"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, parseDriveFolderUrl } from "@/lib/google/drive-client";
import {
  buildDriveImportTree,
  flattenDriveImportTree,
  type DriveEntry,
} from "@/lib/google/drive-traversal";
import { detectDuplicatesFromUnits } from "@/lib/google/classify-drive-topics";
import {
  classifyOrganizeImport,
  organizeClassificationToPersistable,
} from "@/lib/google/classify-drive-organize";
import { isQuizFilename } from "@/lib/google/file-role";
import { exportDriveFileAsNotesHtml, mergeNotesSections } from "@/lib/google/export-drive-notes-html";
import { downloadDriveFileAsPdfBase64 } from "@/lib/google/download-drive-file";
import { analysisFromFilename } from "@/lib/google/analysis-from-filename";
import { analyzeDriveFileContent, type DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import type { FileContentSource } from "@/lib/google/file-content-source";
import { detectVideoLink } from "@/lib/google/detect-video-link";
import { detectVideoUrlInDocument } from "@/lib/google/extract-document-text";
import { renderPptxSlideCards } from "@/lib/google/render-pptx-slide-cards";
import { extractSlideTextFromZip, type SlideText } from "@/lib/google/extract-slide-text";
import { extractDocParagraphsFromZip, paragraphsToNotesHtml } from "@/lib/google/extract-doc-text";
import { extractImagesFromZipByPaths } from "@/lib/google/extract-drive-images";
import { loadOoxmlZip } from "@/lib/google/load-ooxml-zip";
import { uploadDriveImage } from "@/lib/google/upload-drive-image";
import { uploadDriveFile } from "@/lib/google/upload-drive-file";
import { getOAuthClients } from "@/lib/google/oauth-client";
import { getSlidesClients, GOOGLE_SLIDES_MIME } from "@/lib/google/slides-client";
import { renderGoogleSlidesThumbnails } from "@/lib/google/render-slides-thumbnails";
import {
  convertAndRenderPptxSlides,
  convertPptxToGoogleSlides,
  deleteTempPresentation,
  exportPresentationAsPdf,
} from "@/lib/google/render-pptx-slide-images";
import { mapWithConcurrencyLimit } from "@/lib/google/with-concurrency-limit";
import { extractQuestionsFromDriveFile } from "@/lib/google/extract-questions-from-file";
import { addUnitFromImport, addLessonFromImport } from "@/lib/instructor/data/lessons";
import { addAttachment } from "@/lib/instructor/data/attachments";
import { addLessonBlock } from "@/lib/instructor/data/lesson-blocks";
import { addQuestionGroup, addQuestion } from "@/lib/instructor/data/questions";

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

// Drive's per-user rate limit is easily tripped by a folder tree with
// thousands of files (a "Recitations" or "Code Repository" subfolder, say) -
// this caps how many files.get/export calls run at once during resolution.
const DRIVE_IMPORT_CONCURRENCY = 8;

/** Cap concurrent Claude reads so a large folder doesn't trip API rate limits. */
const ANALYSIS_CONCURRENCY = 4;

/**
 * What one file resolved to, before any DB writes happen - kept separate from
 * persistence so every file's Drive download can run in parallel up front.
 */
type ResolvedFile =
  | { routing: "video"; videoUrl: string }
  | { routing: "google_slides" }
  | {
      routing: "slide_pdf";
      pdfBase64: string;
    }
  | {
      routing: "slide_cards";
      slides: SlideText[];
      zip: NonNullable<Awaited<ReturnType<typeof loadOoxmlZip>>>;
    }
  | {
      /** Uploaded .docx (or Doc with no PDF export) — paragraph text read from OOXML. */
      routing: "document_text";
      pages: { index: number; texts: string[] }[];
    }
  | { routing: "unsupported" };

async function resolveFile(
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  file: DriveEntry,
  resourceKeyHeader: string | undefined
): Promise<{ analysis: DriveFileAnalysis; resolved: ResolvedFile }> {
  if (file.mimeType.startsWith("video/")) {
    return {
      analysis: analysisFromFilename(file.name, true),
      resolved: { routing: "video", videoUrl: file.webViewLink ?? "" },
    };
  }

  if (file.mimeType === GOOGLE_SLIDES_MIME) {
    return {
      analysis: analysisFromFilename(file.name, true),
      resolved: { routing: "google_slides" },
    };
  }

  const [pdfBase64, zip] = await Promise.all([
    downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader),
    loadOoxmlZip(drive, file, resourceKeyHeader).catch(() => null),
  ]);

  const slides = pdfBase64 || !zip ? [] : await extractSlideTextFromZip(zip).catch(() => []);

  if (slides.length > 0) {
    const videoUrl = detectVideoLink(slides.flatMap((s) => s.texts));
    if (videoUrl) {
      return {
        analysis: analysisFromFilename(file.name, true),
        resolved: { routing: "video", videoUrl },
      };
    }
  }

  const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (file.mimeType === GOOGLE_DOC_MIME || file.mimeType === DOCX_MIME) {
    const videoUrl = await detectVideoUrlInDocument(drive, file, resourceKeyHeader, pdfBase64, zip);
    if (videoUrl) {
      return {
        analysis: analysisFromFilename(file.name, true),
        resolved: { routing: "video", videoUrl },
      };
    }
  }

  const isForm = file.mimeType === "application/vnd.google-apps.form";
  const unreadableReason =
    "Could not read this file type (not exportable to PDF or a readable document format) - most likely not portable lecture or assessment content.";

  if (pdfBase64) {
    return {
      analysis: analysisFromFilename(file.name, true),
      resolved: { routing: "slide_pdf", pdfBase64 },
    };
  }
  if (zip && slides.length > 0) {
    return {
      analysis: analysisFromFilename(file.name, true),
      resolved: { routing: "slide_cards", slides, zip },
    };
  }

  // Uploaded .docx files aren't PDF-exportable via Drive (only Google-native
  // Docs are) but their OOXML zip is downloadable — without this branch they
  // land as "unsupported" and get dropped from import entirely.
  if (zip && (file.mimeType === GOOGLE_DOC_MIME || file.mimeType === DOCX_MIME)) {
    const paragraphs = await extractDocParagraphsFromZip(zip).catch(() => []);
    if (paragraphs.length > 0) {
      return {
        analysis: analysisFromFilename(file.name, true),
        resolved: {
          routing: "document_text",
          pages: paragraphs.map((text, index) => ({ index: index + 1, texts: [text] })),
        },
      };
    }
  }

  return {
    analysis: analysisFromFilename(file.name, isForm, isForm ? "" : unreadableReason),
    resolved: { routing: "unsupported" },
  };
}

function contentSourceFromResolved(resolved: ResolvedFile): FileContentSource | null {
  if (resolved.routing === "slide_pdf") return { kind: "pdf", pdfBase64: resolved.pdfBase64 };
  if (resolved.routing === "slide_cards") return { kind: "slideText", slides: resolved.slides };
  if (resolved.routing === "document_text") {
    return {
      kind: "plainText",
      text: resolved.pages
        .map((page) => `Page ${page.index}:\n${page.texts.join("\n") || "(empty)"}`)
        .join("\n\n"),
    };
  }
  return null;
}

/**
 * Content-derived analysis for AI structuring. Falls back to filename metadata
 * when the file can't be read (native video, unsupported mime, API failure).
 */
async function analyzeResolvedForOrganize(
  course: { title: string; department: string },
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  file: DriveEntry,
  resolved: ResolvedFile,
  resourceKeyHeader: string | undefined
): Promise<DriveFileAnalysis> {
  let source = contentSourceFromResolved(resolved);

  if (!source && resolved.routing === "google_slides") {
    const pdfBase64 = await downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader).catch(() => null);
    if (pdfBase64) source = { kind: "pdf", pdfBase64 };
  }

  if (source) {
    const analysis = await analyzeDriveFileContent(course, source).catch(() => null);
    if (analysis) return analysis;
  }

  if (resolved.routing === "video") {
    return analysisFromFilename(file.name, true);
  }

  if (resolved.routing === "unsupported") {
    const isForm = file.mimeType === "application/vnd.google-apps.form";
    return analysisFromFilename(
      file.name,
      isForm || isQuizFilename(file.name),
      isForm || isQuizFilename(file.name)
        ? ""
        : "Could not read this file type for content analysis."
    );
  }

  return analysisFromFilename(file.name, true);
}

/** Adds a slide deck rendered as Google Slides thumbnails — pixel-accurate backgrounds and layout. */
async function addRenderedSlidesBlock(
  lessonId: string,
  file: DriveEntry,
  analysis: DriveFileAnalysis,
  renderedImageUrls: string[],
  position: number
): Promise<void> {
  await addLessonBlock(lessonId, {
    kind: "slide_file",
    position,
    title: analysis.title || null,
    sourceDriveFileId: file.id,
    renderMode: "slide_rendered_images",
    bodyHtml: null,
    renderedImageUrls,
  });
}

async function tryRenderSlidesAsThumbnails(
  presentationId: string,
  file: DriveEntry,
  title: string
): Promise<string[] | null> {
  const clients = await getSlidesClients();
  if (!clients) return null;
  return renderGoogleSlidesThumbnails(clients, presentationId, file.id, title);
}

/** Uploads a PDF durably, creates the lesson block, then links the attachment to it. */
async function addPdfEmbedBlock(
  lessonId: string,
  file: DriveEntry,
  analysis: DriveFileAnalysis,
  pdfUrl: string | null,
  pdfBytes: Buffer | null,
  position: number
): Promise<void> {
  const uploaded = pdfBytes
    ? await uploadDriveFile(file.id, pdfBytes, "application/pdf", `${cleanFilenameTitle(file.name)}.pdf`)
    : null;
  const url = uploaded?.url ?? pdfUrl;
  if (!url) return;

  const block = await addLessonBlock(lessonId, {
    kind: "slide_file",
    position,
    title: analysis.title || null,
    sourceDriveFileId: file.id,
    renderMode: "pdf_embed",
    bodyHtml: null,
  });

  await addAttachment(lessonId, {
    name: `${cleanFilenameTitle(file.name)}.pdf`,
    url,
    storagePath: uploaded?.storagePath ?? null,
    contentType: "application/pdf",
    sizeBytes: pdfBytes?.length ?? 0,
    lessonBlockId: block.id,
  });
}

/**
 * Adds one slide/video file as a lesson block at the given position.
 */
async function addSlideFileBlock(
  lessonId: string,
  file: DriveEntry,
  resolved: ResolvedFile,
  analysis: DriveFileAnalysis,
  resourceKeyHeader: string | undefined,
  position: number
): Promise<void> {
  if (resolved.routing === "video") {
    await addLessonBlock(lessonId, {
      kind: "video",
      position,
      title: analysis.title || null,
      sourceDriveFileId: file.id,
      videoUrl: resolved.videoUrl,
    });
    return;
  }

  const title = analysis.title || cleanFilenameTitle(file.name);

  if (resolved.routing === "google_slides") {
    const thumbnailUrls = await tryRenderSlidesAsThumbnails(file.id, file, title);
    if (thumbnailUrls) {
      await addRenderedSlidesBlock(lessonId, file, analysis, thumbnailUrls, position);
      return;
    }

    const drive = await getDriveClient();
    const pdfBase64 = await downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader);
    if (pdfBase64) {
      await addPdfEmbedBlock(lessonId, file, analysis, null, Buffer.from(pdfBase64, "base64"), position);
    }
    return;
  }

  if (resolved.routing === "slide_pdf") {
    await addPdfEmbedBlock(
      lessonId,
      file,
      analysis,
      null,
      Buffer.from(resolved.pdfBase64, "base64"),
      position
    );
    return;
  }

  if (resolved.routing === "slide_cards") {
    const oauthClients = await getOAuthClients();
    if (oauthClients) {
      const tempPresentationId = await convertPptxToGoogleSlides(
        oauthClients.drive,
        file.id,
        resourceKeyHeader,
        title
      );

      if (tempPresentationId) {
        try {
          const thumbnailUrls = await renderGoogleSlidesThumbnails(
            oauthClients,
            tempPresentationId,
            file.id,
            title
          );
          if (thumbnailUrls) {
            await addRenderedSlidesBlock(lessonId, file, analysis, thumbnailUrls, position);
            return;
          }

          const renderedPdfUrl = await exportPresentationAsPdf(
            oauthClients.drive,
            tempPresentationId,
            file.id,
            title
          );
          if (renderedPdfUrl) {
            await addPdfEmbedBlock(lessonId, file, analysis, renderedPdfUrl, null, position);
            return;
          }
        } finally {
          await deleteTempPresentation(oauthClients.drive, tempPresentationId);
        }
      }

      const renderedPdfUrl = await convertAndRenderPptxSlides(
        oauthClients,
        file.id,
        resourceKeyHeader,
        title
      );
      if (renderedPdfUrl) {
        await addPdfEmbedBlock(lessonId, file, analysis, renderedPdfUrl, null, position);
        return;
      }
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
      position,
      title: analysis.title || null,
      sourceDriveFileId: file.id,
      renderMode: "slide_card_images",
      bodyHtml,
    });
    return;
  }

  if (resolved.routing === "document_text") {
    const paragraphs = resolved.pages.flatMap((page) => page.texts);
    const bodyHtml = paragraphsToNotesHtml(paragraphs);
    if (!bodyHtml) return;
    await addLessonBlock(lessonId, {
      kind: "course_notes",
      position,
      title: analysis.title || cleanFilenameTitle(file.name),
      sourceDriveFileId: file.id,
      bodyHtml,
    });
  }
}

async function buildNotesHtmlForFiles(
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  files: DriveEntry[],
  resolvedByFileId: Map<string, { analysis: DriveFileAnalysis; resolved: ResolvedFile }>,
  resourceKeyHeader: string | undefined
): Promise<string | null> {
  const sections: { title: string; html: string }[] = [];

  for (const file of files) {
    const entry = resolvedByFileId.get(file.id);
    if (!entry) continue;

    const pdfBase64 =
      entry.resolved.routing === "slide_pdf" ? entry.resolved.pdfBase64 : null;

    const html = await exportDriveFileAsNotesHtml(drive, file, resourceKeyHeader, pdfBase64);
    if (html) {
      sections.push({ title: cleanFilenameTitle(file.name), html });
    }
  }

  return sections.length > 0 ? mergeNotesSections(sections) : null;
}

async function addDriveLinkAttachments(
  lessonId: string,
  fileIds: string[],
  driveFilesById: Map<string, DriveEntry>
): Promise<void> {
  for (const fileId of fileIds) {
    const driveFile = driveFilesById.get(fileId);
    if (driveFile?.webViewLink) {
      await addAttachment(lessonId, {
        name: driveFile.name,
        url: driveFile.webViewLink,
        storagePath: null,
        contentType: driveFile.mimeType,
        sizeBytes: 0,
      });
    }
  }
}

async function populateQuizLesson(
  lessonId: string,
  quiz: { title: string; file: DriveEntry },
  entry: { analysis: DriveFileAnalysis; resolved: ResolvedFile },
  course: { title: string; department: string },
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  driveFilesById: Map<string, DriveEntry>,
  duplicatesBySurvivorId: Map<string, string[]>,
  resourceKeyHeader: string | undefined
): Promise<void> {
  const { resolved } = entry;

  const extracted = await extractQuestionsFromDriveFile(
    course,
    drive,
    quiz.file,
    resolved,
    resourceKeyHeader
  ).catch((error) => {
    console.error(
      `populateQuizLesson: question extraction failed for "${quiz.file.name}":`,
      error instanceof Error ? error.message : error
    );
    return [];
  });

  const group = await addQuestionGroup(lessonId, {
    sourceDriveFileId: quiz.file.id,
    title: quiz.title,
    position: 1,
  });

  for (const question of extracted) {
    await addQuestion(group.id, {
      position: question.position,
      promptText: question.promptText,
      promptSource: question.promptSource,
      choices: question.choices,
      answerKey: question.answerKey,
      questionType: question.questionType,
      sourceSlideOrPageIndex: question.sourceSlideOrPageIndex,
      needsReview: question.needsReview,
    });
  }

  await addLessonBlock(lessonId, {
    kind: "question_group",
    position: 1,
    title: quiz.title,
    sourceDriveFileId: quiz.file.id,
    questionGroupId: group.id,
  });

  // Source file stays as a Drive link attachment (sidebar) — quiz lessons
  // only surface structured questions in the main pane.
  await addDriveLinkAttachments(
    lessonId,
    [quiz.file.id, ...(duplicatesBySurvivorId.get(quiz.file.id) ?? [])],
    driveFilesById
  );

  if (extracted.length === 0) {
    console.warn(
      `populateQuizLesson: no auto-gradable questions found in "${quiz.file.name}"`
    );
  }
}

async function populateTopicLesson(
  lessonId: string,
  topic: {
    videoFiles: DriveEntry[];
    slideFiles: DriveEntry[];
    notesFiles: DriveEntry[];
  },
  resolvedByFileId: Map<string, { analysis: DriveFileAnalysis; resolved: ResolvedFile }>,
  driveFilesById: Map<string, DriveEntry>,
  duplicatesBySurvivorId: Map<string, string[]>,
  resourceKeyHeader: string | undefined,
  drive: Awaited<ReturnType<typeof getDriveClient>>
): Promise<void> {
  let blockPosition = 0;
  const allFileIds = new Set<string>();

  // 1. Video at top (first video only)
  const videoFile = topic.videoFiles[0];
  if (videoFile) {
    const entry = resolvedByFileId.get(videoFile.id);
    if (entry) {
      blockPosition += 1;
      await addSlideFileBlock(
        lessonId,
        videoFile,
        entry.resolved,
        entry.analysis,
        resourceKeyHeader,
        blockPosition
      );
      allFileIds.add(videoFile.id);
    }
  }

  // 2. Toggleable slide files
  for (const file of topic.slideFiles) {
    const entry = resolvedByFileId.get(file.id);
    if (!entry || entry.resolved.routing === "unsupported") continue;
    blockPosition += 1;
    await addSlideFileBlock(
      lessonId,
      file,
      entry.resolved,
      entry.analysis,
      resourceKeyHeader,
      blockPosition
    );
    allFileIds.add(file.id);
  }

  // 3. Course notes as HTML at the bottom
  if (topic.notesFiles.length > 0) {
    const notesHtml = await buildNotesHtmlForFiles(
      drive,
      topic.notesFiles,
      resolvedByFileId,
      resourceKeyHeader
    );
    if (notesHtml) {
      blockPosition += 1;
      await addLessonBlock(lessonId, {
        kind: "course_notes",
        position: blockPosition,
        title: "Course Notes",
        sourceDriveFileId: topic.notesFiles[0]?.id ?? null,
        bodyHtml: notesHtml,
      });
      for (const file of topic.notesFiles) allFileIds.add(file.id);
    }
  }

  // Drive link attachments for every file in this topic
  for (const fileId of allFileIds) {
    const dupes = duplicatesBySurvivorId.get(fileId) ?? [];
    await addDriveLinkAttachments(lessonId, [fileId, ...dupes], driveFilesById);
  }
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
    .select("code, title, department")
    .eq("code", courseCode)
    .single();
  if (courseError || !course) throw new Error("Unknown course code");

  const drive = await getDriveClient();
  const nestedTree = await buildDriveImportTree(drive, folderId, resourceKey).catch((error) => {
    throw new Error(driveErrorMessage(error));
  });

  // Folder layout is not a contract — flatten everything and let the model
  // decide units / multi-file content lessons / quizzes from file content.
  const tree = flattenDriveImportTree(nestedTree, folderId);

  const driveFilesById = new Map(tree.units.flatMap((u) => u.files).map((f) => [f.id, f]));

  const resolvedByFileId = new Map<string, { analysis: DriveFileAnalysis; resolved: ResolvedFile }>(
    await mapWithConcurrencyLimit(
      Array.from(driveFilesById.values()),
      DRIVE_IMPORT_CONCURRENCY,
      async (file) => [file.id, await resolveFile(drive, file, resourceKeyHeader)] as const
    )
  );

  // Replace filename-only placeholders with real content analysis for structuring.
  await mapWithConcurrencyLimit(
    Array.from(resolvedByFileId.entries()),
    ANALYSIS_CONCURRENCY,
    async ([fileId, entry]) => {
      const file = driveFilesById.get(fileId);
      if (!file) return;
      const analysis = await analyzeResolvedForOrganize(
        course,
        drive,
        file,
        entry.resolved,
        resourceKeyHeader
      );
      resolvedByFileId.set(fileId, { ...entry, analysis });
    }
  );

  const analysisByFileId = new Map(
    Array.from(resolvedByFileId.entries()).map(([id, { analysis }]) => [id, analysis])
  );

  // Junk never reaches the classifier — quiz/assignment filenames are kept
  // even when Drive can't export them (common for uploaded .docx).
  const excludedFileIds = new Set<string>();
  for (const [fileId, analysis] of analysisByFileId) {
    if (analysis.isCourseContent === false) {
      const file = driveFilesById.get(fileId);
      if (file && isQuizFilename(file.name)) {
        analysisByFileId.set(fileId, {
          ...analysis,
          isCourseContent: true,
          notCourseContentReason: "",
          type: "quiz",
          category: "homework",
        });
        const entry = resolvedByFileId.get(fileId);
        if (entry) resolvedByFileId.set(fileId, { ...entry, analysis: analysisByFileId.get(fileId)! });
        continue;
      }
      excludedFileIds.add(fileId);
      console.log(
        `runDriveImportOrganize: excluding "${file?.name ?? fileId}" - not course content (${analysis.notCourseContentReason || "no reason given"})`
      );
    }
  }

  const filteredTree = {
    ...tree,
    units: tree.units.map((unit) => ({
      ...unit,
      files: unit.files.filter((f) => !excludedFileIds.has(f.id)),
    })),
  };

  const filteredAnalysis = new Map(
    Array.from(analysisByFileId.entries()).filter(([id]) => !excludedFileIds.has(id))
  );

  const classifiableCount = filteredTree.units.reduce((sum, unit) => sum + unit.files.length, 0);
  if (classifiableCount === 0) {
    revalidatePath(`/instructor/${courseCode}`);
    return { unitIds: [], lessonIds: [] };
  }

  const basenameDupes = detectDuplicatesFromUnits(filteredTree.units);
  const classification = await classifyOrganizeImport(course, filteredTree, filteredAnalysis);

  // Prefer model duplicates; fold in basename-detected pairs the model missed.
  const duplicates = [...classification.duplicates];
  const seenDupIds = new Set(duplicates.map((d) => d.driveFileId));
  for (const dup of basenameDupes.duplicates) {
    if (seenDupIds.has(dup.driveFileId)) continue;
    duplicates.push(dup);
    seenDupIds.add(dup.driveFileId);
  }

  const { units: plannedUnits, extraDuplicates } = organizeClassificationToPersistable(
    { ...classification, duplicates },
    driveFilesById,
    folderId
  );

  const duplicatesBySurvivorId = new Map<string, string[]>();
  for (const duplicate of [...duplicates, ...extraDuplicates]) {
    const list = duplicatesBySurvivorId.get(duplicate.duplicateOfDriveFileId) ?? [];
    list.push(duplicate.driveFileId);
    duplicatesBySurvivorId.set(duplicate.duplicateOfDriveFileId, list);
  }

  for (const item of classification.unclassified) {
    console.log(
      `runDriveImportOrganize: unclassified "${item.name}" (${item.driveFileId}): ${item.reason}`
    );
  }

  const unitIds: string[] = [];
  const lessonIds: string[] = [];

  for (const unit of plannedUnits) {
    const newUnit = await addUnitFromImport(courseCode, unit.title, unit.sourceDriveFolderId);
    unitIds.push(newUnit.id);

    let lessonPosition = 0;

    for (const topic of unit.topics) {
      lessonPosition += 1;
      const primaryFile =
        topic.videoFiles[0] ?? topic.slideFiles[0] ?? topic.notesFiles[0];
      if (!primaryFile) continue;

      const newLesson = await addLessonFromImport(newUnit.id, {
        title: topic.title,
        type: "lesson",
        position: lessonPosition,
        sourceDriveFileId: primaryFile.id,
        contentSource: "blocks",
      });
      lessonIds.push(newLesson.id);

      await populateTopicLesson(
        newLesson.id,
        topic,
        resolvedByFileId,
        driveFilesById,
        duplicatesBySurvivorId,
        resourceKeyHeader,
        drive
      );
    }

    for (const quiz of unit.quizzes) {
      const entry = resolvedByFileId.get(quiz.file.id);
      if (!entry) continue;

      lessonPosition += 1;
      const newLesson = await addLessonFromImport(newUnit.id, {
        title: quiz.title,
        type: "quiz",
        position: lessonPosition,
        sourceDriveFileId: quiz.file.id,
        contentSource: "blocks",
      });
      lessonIds.push(newLesson.id);

      await populateQuizLesson(
        newLesson.id,
        quiz,
        entry,
        { title: course.title, department: course.department },
        drive,
        driveFilesById,
        duplicatesBySurvivorId,
        resourceKeyHeader
      );
    }
  }

  revalidatePath(`/instructor/${courseCode}`);
  return { unitIds, lessonIds };
}
