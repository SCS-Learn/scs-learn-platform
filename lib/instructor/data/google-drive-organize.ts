"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, parseDriveFolderUrl } from "@/lib/google/drive-client";
import { buildDriveImportTree, type DriveEntry } from "@/lib/google/drive-traversal";
import { classifyDriveImport } from "@/lib/google/classify-drive-content";
import { downloadDriveFileAsPdfBase64 } from "@/lib/google/download-drive-file";
import { analyzeDriveFileContent, type DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import { detectVideoLink } from "@/lib/google/detect-video-link";
import { renderPptxSlideCards } from "@/lib/google/render-pptx-slide-cards";
import { extractSlideTextFromZip, type SlideText } from "@/lib/google/extract-slide-text";
import { extractImagesFromZipByPaths } from "@/lib/google/extract-drive-images";
import { loadOoxmlZip } from "@/lib/google/load-ooxml-zip";
import { uploadDriveImage } from "@/lib/google/upload-drive-image";
import { uploadDriveFile } from "@/lib/google/upload-drive-file";
import { getOAuthClients } from "@/lib/google/oauth-client";
import { convertAndRenderPptxSlides } from "@/lib/google/render-pptx-slide-images";
import type { FileContentSource } from "@/lib/google/file-content-source";
import { addUnitFromImport, addLessonFromImport } from "@/lib/instructor/data/lessons";
import { addAttachment } from "@/lib/instructor/data/attachments";
import { addLessonBlock } from "@/lib/instructor/data/lesson-blocks";

function cleanFilenameTitle(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[_-]+/g, " ").trim();
}

function driveErrorMessage(error: unknown): string {
  const code = (error as { code?: number })?.code;
  if (code === 404 || code === 403) {
    return "Couldn't open that folder - make sure it's shared as \"Anyone with the link\" and try again.";
  }
  return "Couldn't reach Google Drive for that link.";
}

const MAX_IMAGES_PER_FILE = 36;

/**
 * What one file resolved to, before any DB writes happen - kept separate from
 * persistence so every file's Drive read/Claude classification call can run
 * in parallel up front, same as runDriveImport does for the atomizer path.
 */
type ResolvedFile =
  | { routing: "video"; videoUrl: string }
  | {
      routing: "slide_pdf";
      pdfBase64: string;
    }
  | {
      routing: "slide_cards";
      slides: SlideText[];
      zip: NonNullable<Awaited<ReturnType<typeof loadOoxmlZip>>>;
    }
  | { routing: "unsupported" };

async function resolveFile(
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  file: DriveEntry,
  resourceKeyHeader: string | undefined,
  course: { title: string; department: string }
): Promise<{ analysis: DriveFileAnalysis; resolved: ResolvedFile }> {
  if (file.mimeType.startsWith("video/")) {
    return {
      analysis: { title: cleanFilenameTitle(file.name), type: "lesson", category: "lecture", topicSummary: "", isCourseContent: true, notCourseContentReason: "" },
      resolved: { routing: "video", videoUrl: file.webViewLink ?? "" },
    };
  }

  const [pdfBase64, zip] = await Promise.all([
    downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader),
    loadOoxmlZip(drive, file, resourceKeyHeader).catch(() => null),
  ]);

  // A real (already OOXML) .pptx can't be exported to PDF via the Drive API -
  // fall back to the deck's own slide text, same as the atomizer path.
  const slides = pdfBase64 || !zip ? [] : await extractSlideTextFromZip(zip).catch(() => []);

  // Only checked on the slide-text fallback path: a native PDF/Doc/Sheet
  // export is the real content, not just a pointer to a video.
  if (slides.length > 0) {
    const videoUrl = detectVideoLink(slides.flatMap((s) => s.texts));
    if (videoUrl) {
      return {
        analysis: { title: cleanFilenameTitle(file.name), type: "lesson", category: "lecture", topicSummary: "", isCourseContent: true, notCourseContentReason: "" },
        resolved: { routing: "video", videoUrl },
      };
    }
  }

  const source: FileContentSource | null = pdfBase64
    ? { kind: "pdf", pdfBase64 }
    : slides.length > 0
      ? { kind: "slideText", slides }
      : null;

  // A Google Form is a real quiz format this pipeline just can't parse yet -
  // stays isCourseContent: true (a known gap, not junk). Anything else that
  // reaches this fallback couldn't be read at all (not PDF-exportable, not
  // already-OOXML with slide text, and no source to even ask Claude about) -
  // defaulting that to "yes, real content" is backwards, and is exactly how
  // raw source files, images, and spreadsheets from folders like "Code
  // Repository"/"Grading"/"Photos" were turning into empty junk lessons.
  const isForm = file.mimeType === "application/vnd.google-apps.form";
  const analysis =
    (source ? await analyzeDriveFileContent(course, source).catch(() => null) : null) ??
    ({
      title: cleanFilenameTitle(file.name),
      type: isForm ? "quiz" : "lesson",
      category: isForm ? "homework" : "other",
      topicSummary: "",
      isCourseContent: isForm,
      notCourseContentReason: isForm
        ? ""
        : "Could not read this file type (not exportable to PDF or a readable document format) - most likely not portable lecture or assessment content.",
    } as DriveFileAnalysis);

  // A quiz/homework file is embedded as a whole file exactly like a lecture -
  // "type"/"category" only ever affect the lesson's label and how the
  // classifier groups/attaches it, never how its content gets rendered.
  if (pdfBase64) return { analysis, resolved: { routing: "slide_pdf", pdfBase64 } };
  if (zip && slides.length > 0) return { analysis, resolved: { routing: "slide_cards", slides, zip } };
  return { analysis, resolved: { routing: "unsupported" } };
}

/** Uploads a PDF's bytes durably and adds a pdf_embed lesson block for it - shared by the native-PDF and successful-pptx-conversion cases below, both of which end up with the exact same scrollable PDF viewer. */
async function addPdfEmbedBlock(
  lessonId: string,
  file: DriveEntry,
  analysis: DriveFileAnalysis,
  pdfUrl: string | null,
  pdfBytes: Buffer | null
): Promise<void> {
  const uploaded = pdfBytes
    ? await uploadDriveFile(file.id, pdfBytes, "application/pdf", `${cleanFilenameTitle(file.name)}.pdf`)
    : null;
  const url = uploaded?.url ?? pdfUrl;
  if (url) {
    await addAttachment(lessonId, {
      name: `${cleanFilenameTitle(file.name)}.pdf`,
      url,
      storagePath: uploaded?.storagePath ?? null,
      contentType: "application/pdf",
      sizeBytes: 0,
    });
  }
  await addLessonBlock(lessonId, {
    kind: "slide_file",
    position: 1,
    title: analysis.title || null,
    sourceDriveFileId: file.id,
    renderMode: "pdf_embed",
    bodyHtml: null,
  });
}

/**
 * Persists whatever a file resolved to as a single whole-file lesson block -
 * the same rendering mechanism regardless of category (lecture, homework,
 * practice problems, ...): a PDF/slide deck is embedded in full, never
 * decomposed into extracted pieces. Always lands at position 1 - every
 * lesson gets exactly one block now.
 */
async function addWholeFileBlock(
  lessonId: string,
  file: DriveEntry,
  resolved: ResolvedFile,
  analysis: DriveFileAnalysis,
  resourceKeyHeader: string | undefined
): Promise<void> {
  if (resolved.routing === "video") {
    await addLessonBlock(lessonId, {
      kind: "video",
      position: 1,
      title: analysis.title || null,
      sourceDriveFileId: file.id,
      videoUrl: resolved.videoUrl,
    });
    return;
  }

  if (resolved.routing === "slide_pdf") {
    await addPdfEmbedBlock(lessonId, file, analysis, null, Buffer.from(resolved.pdfBase64, "base64"));
    return;
  }

  if (resolved.routing === "slide_cards") {
    // True, fully-scrollable rendering (a real PDF export of a temporary
    // Slides conversion) when the instructor has connected Google OAuth -
    // falls back to the text+image card below on any failure (not
    // connected, conversion unsupported, quota, etc.) rather than failing
    // the import.
    const oauthClients = await getOAuthClients();
    const renderedPdfUrl = oauthClients
      ? await convertAndRenderPptxSlides(
          oauthClients,
          file.id,
          resourceKeyHeader,
          analysis.title || cleanFilenameTitle(file.name)
        )
      : null;

    if (renderedPdfUrl) {
      await addPdfEmbedBlock(lessonId, file, analysis, renderedPdfUrl, null);
      return;
    }

    const imagePaths = [...new Set(resolved.slides.flatMap((s) => s.imagePaths))].slice(0, MAX_IMAGES_PER_FILE);
    const images = await extractImagesFromZipByPaths(resolved.zip, imagePaths, MAX_IMAGES_PER_FILE).catch(() => []);
    const imageUrlBySourcePath = new Map<string, string>();
    for (const image of images) {
      const uploaded = await uploadDriveImage(file.id, image);
      if (uploaded) imageUrlBySourcePath.set(image.sourcePath, uploaded.url);
    }
    const bodyHtml = renderPptxSlideCards(resolved.slides, imageUrlBySourcePath);
    await addLessonBlock(lessonId, {
      kind: "slide_file",
      position: 1,
      title: analysis.title || null,
      sourceDriveFileId: file.id,
      renderMode: "slide_card_images",
      bodyHtml,
    });
    return;
  }

  // "unsupported" (e.g. a Google Form, or a type with no extractable content
  // at all): the Drive-link attachment (added by the caller) is all this
  // file gets - no lesson block, no generated content.
}

export async function runDriveImportOrganize(
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

  const drive = await getDriveClient();
  const tree = await buildDriveImportTree(drive, folderId, resourceKey).catch((error) => {
    throw new Error(driveErrorMessage(error));
  });

  const driveFilesById = new Map(tree.units.flatMap((u) => u.files).map((f) => [f.id, f]));

  const resolvedByFileId = new Map<string, { analysis: DriveFileAnalysis; resolved: ResolvedFile }>(
    await Promise.all(
      Array.from(driveFilesById.values()).map(
        async (file) => [file.id, await resolveFile(drive, file, resourceKeyHeader, course)] as const
      )
    )
  );

  const analysisByFileId = new Map(
    Array.from(resolvedByFileId.entries()).map(([id, { analysis }]) => [id, analysis])
  );

  // Junk (garbled exports, random/placeholder data, unrelated administrative
  // documents) never reaches the classifier at all, let alone becomes a
  // lesson - it can only ever end up in "unclassified"/a real lesson if the
  // classifier itself sees it. There's no lesson for it to attach to, so it's
  // just logged for visibility rather than silently vanishing.
  const excludedFileIds = new Set<string>();
  for (const [fileId, analysis] of analysisByFileId) {
    if (analysis.isCourseContent === false) {
      excludedFileIds.add(fileId);
      const file = driveFilesById.get(fileId);
      console.log(
        `runDriveImportOrganize: excluding "${file?.name ?? fileId}" - not course content (${analysis.notCourseContentReason || "no reason given"})`
      );
    }
  }

  const filteredAnalysisByFileId = new Map(
    Array.from(analysisByFileId.entries()).filter(([fileId]) => !excludedFileIds.has(fileId))
  );
  const filteredTree = {
    ...tree,
    units: tree.units.map((unit) => ({
      ...unit,
      files: unit.files.filter((f) => !excludedFileIds.has(f.id)),
    })),
  };

  const classification = await classifyDriveImport(course, filteredTree, filteredAnalysisByFileId);

  // A duplicate doesn't get its own lesson - folded into whichever copy the
  // classifier kept, same as the atomizer path.
  const duplicateFileIds = new Set(classification.duplicates.map((d) => d.driveFileId));
  const duplicatesBySurvivorId = new Map<string, string[]>();
  for (const duplicate of classification.duplicates) {
    const list = duplicatesBySurvivorId.get(duplicate.duplicateOfDriveFileId) ?? [];
    list.push(duplicate.driveFileId);
    duplicatesBySurvivorId.set(duplicate.duplicateOfDriveFileId, list);
  }

  const unitIds: string[] = [];
  const lessonIds: string[] = [];

  const sortedUnits = [...classification.units].sort((a, b) => a.order - b.order);
  for (const unit of sortedUnits) {
    const sortedLessons = [...unit.lessons]
      .filter((lesson) => !duplicateFileIds.has(lesson.driveFileId))
      .sort((a, b) => a.order - b.order);
    if (sortedLessons.length === 0) continue;

    const newUnit = await addUnitFromImport(courseCode, unit.title, unit.driveFolderId);
    unitIds.push(newUnit.id);

    for (const [index, lessonRef] of sortedLessons.entries()) {
      const file = driveFilesById.get(lessonRef.driveFileId);
      const entry = resolvedByFileId.get(lessonRef.driveFileId);
      if (!file || !entry) continue;
      const { analysis, resolved } = entry;
      const position = index + 1;

      const newLesson = await addLessonFromImport(newUnit.id, {
        title: analysis.title || cleanFilenameTitle(file.name),
        type: analysis.type,
        position,
        sourceDriveFileId: file.id,
        contentSource: "blocks",
      });
      lessonIds.push(newLesson.id);

      // The original Drive file (plus every duplicate folded into it) stays
      // reachable as a plain attachment link - separate from whatever gets
      // durably copied into Storage for actual rendering below.
      const sourceFileIds = [file.id, ...(duplicatesBySurvivorId.get(file.id) ?? [])];
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

      await addWholeFileBlock(newLesson.id, file, resolved, analysis, resourceKeyHeader);
    }
  }

  revalidatePath(`/instructor/${courseCode}`);
  return { unitIds, lessonIds };
}
