"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, getServiceAccountEmail, parseDriveFolderUrl } from "@/lib/google/drive-client";
import { buildDriveImportTree } from "@/lib/google/drive-traversal";
import { classifyDriveImport } from "@/lib/google/classify-drive-content";
import { downloadDriveFileAsPdfBase64 } from "@/lib/google/download-drive-file";
import { analyzeDriveFileContent, type DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import { extractFileAtoms, type Atom } from "@/lib/google/extract-file-atoms";
import { linkCourseAtoms } from "@/lib/google/link-course-atoms";
import {
  extractDriveFileImages,
  extractImagesFromZip,
  extractImagesFromZipByPaths,
  type DriveImage,
} from "@/lib/google/extract-drive-images";
import { extractSlideTextFromZip, type SlideText } from "@/lib/google/extract-slide-text";
import { loadOoxmlZip } from "@/lib/google/load-ooxml-zip";
import type { FileContentSource } from "@/lib/google/file-content-source";
import type JSZip from "jszip";
import { uploadDriveImage } from "@/lib/google/upload-drive-image";
import { addUnitFromImport, addLessonFromImport } from "@/lib/instructor/data/lessons";
import { addAttachment } from "@/lib/instructor/data/attachments";
import { flushAtomStore, summarizeAtoms, writeAtomRecord } from "@/lib/debug/atom-store";
import { groupAtomsIntoSlides, renderAtomsToHtml } from "@/lib/google/render-atoms";

type ResolvedFigure = {
  imageIndex: number;
  sourcePath: string;
  url: string;
  storagePath: string;
  contentType: string;
  caption: string;
  sizeBytes: number;
};

function cleanFilenameTitle(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[_-]+/g, " ").trim();
}

/**
 * Uploads every "figure" atom's referenced image (deduped by the image's own
 * identity, so the same picture referenced twice only uploads once) and
 * returns both the resolved figures (for lesson attachments) and a lookup
 * from atom id to its asset URL. Takes the specific `images` array that
 * produced these atoms - required because a batch's atoms reference indices
 * into that batch's own image array, not a single shared one.
 */
async function resolveAtomFigures(
  fileId: string,
  atoms: Atom[],
  images: DriveImage[]
): Promise<{ figures: ResolvedFigure[]; assetUrlByAtomId: Map<string, string> }> {
  const uploadedBySourcePath = new Map<string, { url: string; storagePath: string }>();
  const figures: ResolvedFigure[] = [];
  const assetUrlByAtomId = new Map<string, string>();

  for (const atom of atoms) {
    if (atom.modality !== "figure" || atom.assetImageIndex === null) continue;
    const image = images[atom.assetImageIndex];
    if (!image) {
      console.error(`resolveAtomFigures: atom ${atom.id} (file ${fileId}) referenced image index ${atom.assetImageIndex}, but only ${images.length} image(s) were extracted - figure will be missing from the rendered lesson`);
      continue;
    }

    let uploaded = uploadedBySourcePath.get(image.sourcePath);
    if (!uploaded) {
      const result = await uploadDriveImage(fileId, image);
      if (!result) {
        console.error(`resolveAtomFigures: upload failed for atom ${atom.id} (file ${fileId}, image ${image.sourcePath}) - figure will be missing from the rendered lesson`);
        continue;
      }
      uploaded = result;
      uploadedBySourcePath.set(image.sourcePath, uploaded);
    }

    assetUrlByAtomId.set(atom.id, uploaded.url);
    figures.push({
      imageIndex: atom.assetImageIndex,
      sourcePath: image.sourcePath,
      url: uploaded.url,
      storagePath: uploaded.storagePath,
      contentType: image.contentType,
      caption: atom.altText ?? atom.title,
      sizeBytes: image.data.length,
    });
  }

  return { figures, assetUrlByAtomId };
}

const MAX_IMAGES_PER_CALL = 12;
// A deck past this many slides gets split into parallel batches for atom
// extraction instead of one call - a 200+ slide deck was always going to be
// slow (and prone to truncating) as a single request no matter what
// max_tokens was set to. Kept smaller than you'd think necessary because
// atoms now carry full elaborated explanations, not one-liners - each atom
// costs a lot more output budget than it used to, so a smaller slide window
// per call keeps well clear of the 48000 max_tokens ceiling.
const SLIDE_BATCH_SIZE = 12;

/** Every image path referenced by these slides, in slide order, deduped, up to `cap` - a diverse sample instead of an arbitrary whole-file scan. */
function collectSlideImagePaths(slides: SlideText[], cap: number): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const slide of slides) {
    for (const path of slide.imagePaths) {
      if (seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
      if (paths.length >= cap) return paths;
    }
  }
  return paths;
}

/**
 * Runs atom extraction over a large deck in parallel batches of slides
 * instead of one call for the whole thing - each batch stays well under any
 * token ceiling (faster, and far less likely to truncate), and each batch
 * gets only the images its own slides actually reference instead of
 * competing for a single whole-file image cap. Atom ids get a batch prefix
 * so they stay unique within the file; batches run in original slide order,
 * so the concatenated result is still in reading order.
 */
type AtomExtractionResult = { atoms: Atom[]; figures: ResolvedFigure[]; assetUrlByAtomId: Map<string, string> };

const EMPTY_ATOM_RESULT: AtomExtractionResult = { atoms: [], figures: [], assetUrlByAtomId: new Map() };

function mergeAtomResults(results: AtomExtractionResult[]): AtomExtractionResult {
  const assetUrlByAtomId = new Map<string, string>();
  for (const result of results) for (const [id, url] of result.assetUrlByAtomId) assetUrlByAtomId.set(id, url);
  return {
    atoms: results.flatMap((r) => r.atoms),
    figures: results.flatMap((r) => r.figures),
    assetUrlByAtomId,
  };
}

async function extractAtomsInBatches(
  course: { title: string; department: string },
  slides: SlideText[],
  zip: JSZip,
  fileLabel: string,
  file: { id: string; name: string }
): Promise<AtomExtractionResult> {
  const batches: SlideText[][] = [];
  for (let i = 0; i < slides.length; i += SLIDE_BATCH_SIZE) batches.push(slides.slice(i, i + SLIDE_BATCH_SIZE));

  const batchResults = await Promise.all(
    batches.map(async (batchSlides, batchIndex): Promise<AtomExtractionResult> => {
      const batchImagePaths = collectSlideImagePaths(batchSlides, MAX_IMAGES_PER_CALL);
      const batchImages = await extractImagesFromZipByPaths(zip, batchImagePaths, MAX_IMAGES_PER_CALL).catch(() => []);
      const batchSource: FileContentSource = { kind: "slideText", slides: batchSlides };
      try {
        const rawAtoms = await extractFileAtoms(course, batchSource, batchImages);
        const atoms = rawAtoms.map((atom) => ({
          ...atom,
          id: `b${batchIndex}-${atom.id}`,
          dependsOn: atom.dependsOn.map((id) => `b${batchIndex}-${id}`),
        }));
        const { figures, assetUrlByAtomId } = await resolveAtomFigures(file.id, atoms, batchImages);
        return { atoms, figures, assetUrlByAtomId };
      } catch (error) {
        const slideRange = `${batchSlides[0]?.index ?? "?"}-${batchSlides[batchSlides.length - 1]?.index ?? "?"}`;
        await writeAtomRecord(`${fileLabel}--slides${slideRange}--EXTRACTION_ERROR`, {
          file,
          slideRange,
          error: error instanceof Error ? error.message : String(error),
        });
        return EMPTY_ATOM_RESULT;
      }
    })
  );
  return mergeAtomResults(batchResults);
}

/** Null when only GOOGLE_API_KEY is configured - "Anyone with the link" is then the only option. */
export async function getDriveShareEmail(): Promise<string | null> {
  return getServiceAccountEmail();
}

function driveErrorMessage(error: unknown): string {
  const code = (error as { code?: number })?.code;
  if (code === 404 || code === 403) {
    return "Couldn't open that folder - make sure it's shared as \"Anyone with the link\" and try again.";
  }
  return "Couldn't reach Google Drive for that link.";
}

export async function getDriveImportPreview(
  folderUrl: string
): Promise<{ unitCount: number; lessonCount: number; isFlat: boolean }> {
  const { folderId, resourceKey } = parseDriveFolderUrl(folderUrl);
  const drive = getDriveClient();
  try {
    const tree = await buildDriveImportTree(drive, folderId, resourceKey);
    return {
      // In a flat folder this is just 1 (the whole thing, pre-split) - Claude
      // only decides the real unit count once the import actually runs.
      unitCount: tree.units.length,
      lessonCount: tree.units.reduce((sum, unit) => sum + unit.files.length, 0),
      isFlat: tree.isFlat,
    };
  } catch (error) {
    throw new Error(driveErrorMessage(error));
  }
}

export async function runDriveImport(
  courseCode: string,
  folderUrl: string
): Promise<{ unitIds: string[]; lessonIds: string[] }> {
  const { folderId, resourceKey } = parseDriveFolderUrl(folderUrl);
  const resourceKeyHeader = resourceKey ? `${folderId}/${resourceKey}` : undefined;

  const supabase = await createClient();
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("title, department")
    .eq("code", courseCode)
    .single();
  if (courseError || !course) throw new Error("Unknown course code");

  await flushAtomStore();

  const drive = getDriveClient();
  const tree = await buildDriveImportTree(drive, folderId, resourceKey).catch((error) => {
    throw new Error(driveErrorMessage(error));
  });

  const driveFilesById = new Map(tree.units.flatMap((u) => u.files).map((f) => [f.id, f]));

  // Read every file's actual content up front, in parallel, before grouping
  // or touching the DB - downloading + Claude are the slow part, and a bad
  // PDF here just falls back to a filename-derived title/type for that one
  // file (it still gets its attachment) instead of breaking the import.
  const figuresByFileId = new Map<string, ResolvedFigure[]>();
  const atomsByFileId = new Map<string, Atom[]>();
  const assetUrlByAtomIdByFileId = new Map<string, Map<string, string>>();

  const analysisByFileId = new Map<string, DriveFileAnalysis>(
    await Promise.all(
      Array.from(driveFilesById.values()).map(async (file) => {
        // The OOXML zip (if this mimeType has one) is fetched exactly once
        // and reused for both images and the slide-text fallback below -
        // downloading a potentially huge presentation/doc/sheet file twice
        // over the network was pure waste.
        const [pdfBase64, zip] = await Promise.all([
          downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader),
          loadOoxmlZip(drive, file, resourceKeyHeader).catch(() => null),
        ]);
        const fileLabel = cleanFilenameTitle(file.name);

        // A real (already OOXML) .pptx can't be exported to PDF via the Drive
        // API at all - only Google-native Slides files can. Fall back to the
        // deck's own slide text (titles/captions/notes) so a visually-driven
        // file (few words, lots of hand-drawn figures) still gets read
        // instead of silently producing nothing.
        const slides = pdfBase64 || !zip ? [] : await extractSlideTextFromZip(zip).catch(() => []);

        // When we know which images belong to which slide, prefer a diverse,
        // slide-ordered sample over an arbitrary whole-zip scan - otherwise
        // whichever 12 happen to sort first in the zip win, regardless of
        // which slide they're actually on.
        const images =
          slides.length > 0 && zip
            ? await extractImagesFromZipByPaths(
                zip,
                collectSlideImagePaths(slides, MAX_IMAGES_PER_CALL * 3),
                MAX_IMAGES_PER_CALL * 3
              ).catch(() => [])
            : zip
              ? await extractImagesFromZip(zip).catch(() => [])
              : await extractDriveFileImages(drive, file, resourceKeyHeader).catch(() => []);

        const source: FileContentSource | null = pdfBase64
          ? { kind: "pdf", pdfBase64 }
          : slides.length > 0
            ? { kind: "slideText", slides }
            : null;

        const [analysis, atomResult] = await Promise.all([
          source ? analyzeDriveFileContent(course, source).catch(() => null) : Promise.resolve(null),
          !source
            ? Promise.resolve(EMPTY_ATOM_RESULT)
            : source.kind === "slideText" && source.slides.length > SLIDE_BATCH_SIZE && zip
              ? extractAtomsInBatches(course, source.slides, zip, fileLabel, { id: file.id, name: file.name })
              : extractFileAtoms(course, source, images)
                  .then((atoms) => resolveAtomFigures(file.id, atoms, images).then(({ figures, assetUrlByAtomId }) => ({
                    atoms,
                    figures,
                    assetUrlByAtomId,
                  })))
                  .catch(async (error) => {
                    await writeAtomRecord(`${fileLabel}--EXTRACTION_ERROR`, {
                      file: { id: file.id, name: file.name },
                      error: error instanceof Error ? error.message : String(error),
                    });
                    return EMPTY_ATOM_RESULT;
                  }),
        ]);
        const atoms = atomResult.atoms;
        atomsByFileId.set(file.id, atoms);
        assetUrlByAtomIdByFileId.set(file.id, atomResult.assetUrlByAtomId);
        figuresByFileId.set(file.id, atomResult.figures);

        if (!analysis) {
          const fallback: DriveFileAnalysis = {
            title: cleanFilenameTitle(file.name),
            type: file.mimeType === "application/vnd.google-apps.form" ? "quiz" : "lesson",
            topicSummary: "",
          };
          return [file.id, fallback] as const;
        }

        return [file.id, analysis] as const;
      })
    )
  );

  const classification = await classifyDriveImport(course, tree, analysisByFileId);
  await writeAtomRecord("classify", { input: Array.from(analysisByFileId.entries()), classification });

  // A duplicate (the same lecture as both a .pptx and a .pdf, say) doesn't
  // get its own lesson or its own atoms - just folded into whichever copy
  // the classifier kept, so the same content doesn't show up twice.
  const duplicateFileIds = new Set(classification.duplicates.map((d) => d.driveFileId));
  const duplicatesBySurvivorId = new Map<string, string[]>();
  for (const duplicate of classification.duplicates) {
    const list = duplicatesBySurvivorId.get(duplicate.duplicateOfDriveFileId) ?? [];
    list.push(duplicate.driveFileId);
    duplicatesBySurvivorId.set(duplicate.duplicateOfDriveFileId, list);
  }
  for (const duplicate of classification.duplicates) {
    const label = cleanFilenameTitle(driveFilesById.get(duplicate.driveFileId)?.name ?? duplicate.driveFileId);
    await writeAtomRecord(`DUPLICATE--${label}`, duplicate);
  }

  // Stage 3: place every file's atoms into one course-wide, flow-ordered
  // sequence and let concepts/dependencies cross file boundaries - a later
  // lesson's atoms can (and should) point back at an earlier lesson's.
  const fileNameById = new Map(Array.from(driveFilesById.entries()).map(([id, file]) => [id, file.name]));
  const atomsByFileIdForLinking = new Map(
    Array.from(atomsByFileId.entries()).filter(([fileId]) => !duplicateFileIds.has(fileId))
  );
  const courseAtoms = await linkCourseAtoms(course, classification, atomsByFileIdForLinking, fileNameById);

  await writeAtomRecord("course-atoms--summary", {
    totalAtoms: courseAtoms.length,
    atomSummary: summarizeAtoms(courseAtoms.map((c) => c.atom)),
  });
  for (const courseAtom of courseAtoms) {
    const assetUrl = assetUrlByAtomIdByFileId.get(courseAtom.sourceFileId)?.get(courseAtom.atom.id) ?? null;
    await writeAtomRecord(
      `${courseAtom.courseAtomId}--${cleanFilenameTitle(courseAtom.sourceFileName)}--${courseAtom.atom.role}--${courseAtom.atom.title}`,
      { ...courseAtom, atom: { ...courseAtom.atom, assetUrl } }
    );
  }

  const unitIds: string[] = [];
  const lessonIds: string[] = [];

  // Splitting a file's atoms into several slide-sized pages means a unit can
  // now accumulate far more lesson rows than it used to (one file used to be
  // one lesson; now it can be many). Past this many pages, break the unit
  // into several - always at a file boundary, never splitting one file's own
  // pages across two units - so the sidebar doesn't end up with one unit
  // holding dozens of lessons.
  const MAX_LESSONS_PER_UNIT = 20;

  const sortedUnits = [...classification.units].sort((a, b) => a.order - b.order);
  for (const unit of sortedUnits) {
    // Defensive: a duplicate should already be absent from unit.lessons per
    // classifyDriveImport's prompt, but filter before numbering positions
    // anyway so one leaking through can't also leave a numbering gap.
    const sortedLessons = [...unit.lessons]
      .filter((lesson) => !duplicateFileIds.has(lesson.driveFileId))
      .sort((a, b) => a.order - b.order);

    const fileEntries = sortedLessons.map((lesson) => {
      const analysis = analysisByFileId.get(lesson.driveFileId);
      const atoms = atomsByFileId.get(lesson.driveFileId) ?? [];
      const assetUrlByAtomId = assetUrlByAtomIdByFileId.get(lesson.driveFileId) ?? new Map<string, string>();
      const slides =
        atoms.length > 0 ? groupAtomsIntoSlides(atoms) : [{ title: analysis?.title ?? "Untitled lesson", sections: [] }];
      return { lesson, analysis, assetUrlByAtomId, slides };
    });

    const subUnits: (typeof fileEntries)[] = [];
    let currentSubUnit: typeof fileEntries = [];
    let currentPageCount = 0;
    for (const entry of fileEntries) {
      if (currentSubUnit.length > 0 && currentPageCount + entry.slides.length > MAX_LESSONS_PER_UNIT) {
        subUnits.push(currentSubUnit);
        currentSubUnit = [];
        currentPageCount = 0;
      }
      currentSubUnit.push(entry);
      currentPageCount += entry.slides.length;
    }
    if (currentSubUnit.length > 0) subUnits.push(currentSubUnit);

    for (const [subUnitIndex, subUnitEntries] of subUnits.entries()) {
      const title = subUnits.length > 1 ? `${unit.title} (Part ${subUnitIndex + 1})` : unit.title;
      const newUnit = await addUnitFromImport(courseCode, title, unit.driveFolderId);
      unitIds.push(newUnit.id);

      // Position counts pages within the unit, not files - a single dense
      // file's atoms split into several slide-sized pages, each becoming its
      // own lesson row, so the instructor sees short, focused pages instead
      // of one long scroll.
      let position = 0;
      for (const { lesson, analysis, assetUrlByAtomId, slides } of subUnitEntries) {
        for (const [slideIndex, slide] of slides.entries()) {
          position += 1;
          const newLesson = await addLessonFromImport(newUnit.id, {
            title: slide.title || analysis?.title || "Untitled lesson",
            type: analysis?.type ?? "lesson",
            position,
            sourceDriveFileId: lesson.driveFileId,
            contentHtml: slide.sections.length > 0 ? renderAtomsToHtml(slide, assetUrlByAtomId) : undefined,
          });
          lessonIds.push(newLesson.id);

          // Attachments (source file link + figures) belong to the file as a
          // whole, so they only go on its first page - repeating them on
          // every split-out page would just spam the attachment list.
          if (slideIndex !== 0) continue;

          // The surviving file, plus every duplicate folded into it - so the
          // original .pptx (say) is still reachable even though only the
          // .pdf's content became the lesson.
          const sourceFileIds = [lesson.driveFileId, ...(duplicatesBySurvivorId.get(lesson.driveFileId) ?? [])];
          for (const sourceFileId of sourceFileIds) {
            const driveFile = driveFilesById.get(sourceFileId);
            if (driveFile?.webViewLink) {
              await addAttachment(newLesson.id, {
                name: driveFile.name,
                url: driveFile.webViewLink,
                storagePath: null,
                contentType: driveFile.mimeType,
                sizeBytes: 0,
              });
            }
          }

          for (const figure of figuresByFileId.get(lesson.driveFileId) ?? []) {
            await addAttachment(newLesson.id, {
              name: `${analysis?.title ?? "Figure"} - ${figure.caption}`.slice(0, 200),
              url: figure.url,
              storagePath: figure.storagePath,
              contentType: figure.contentType,
              sizeBytes: figure.sizeBytes,
            });
          }
        }
      }
    }
  }

  revalidatePath(`/instructor/${courseCode}`);
  return { unitIds, lessonIds };
}
