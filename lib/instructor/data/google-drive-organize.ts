"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, parseDriveFolderUrl } from "@/lib/google/drive-client";
import {
  buildDriveImportTree,
  flattenDriveImportTree,
  type DriveEntry,
} from "@/lib/google/drive-traversal";
import { detectDuplicatesFromUnits, type TopicGroup } from "@/lib/google/classify-drive-topics";
import {
  classifyOrganizeImport,
  organizeClassificationToPersistable,
  type OrganizeUnitForPersist,
} from "@/lib/google/classify-drive-organize";
import {
  extractYoutubeVideoId,
  fetchYoutubePlaylistVideos,
  looksLikePlaylistReference,
  youtubeWatchUrl,
  type YoutubePlaylistVideo,
} from "@/lib/google/youtube-playlist";
import { fetchAllVideosForChannel } from "@/lib/google/youtube-channel-playlists";
import { placeYoutubeVideos, type YoutubeExistingUnit } from "@/lib/google/place-youtube-videos";
import { isQuizFilename } from "@/lib/google/file-role";
import { downloadDriveFileAsPdfBase64 } from "@/lib/google/download-drive-file";
import { analysisFromFilename } from "@/lib/google/analysis-from-filename";
import { analyzeDriveFileContent, quizLessonCategory, type DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import {
  saveCogniterraCourseConfig,
  wireExternalLessonsToCogniterra,
  getCogniterraCourseConfig,
  type CogniterraSetupInput,
} from "@/lib/instructor/data/cogniterra";
import type { DriveAssignmentForMatch } from "@/lib/cogniterra/match-lessons";
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
import { addUnitFromImport, addLessonFromImport, deleteLesson, deleteUnit } from "@/lib/instructor/data/lessons";
import { addAttachment } from "@/lib/instructor/data/attachments";
import { addLessonBlock } from "@/lib/instructor/data/lesson-blocks";
import { addQuestionGroup, addQuestion, persistQuestionVariants } from "@/lib/instructor/data/questions";

/**
 * Every Drive file, and every YouTube video, already pulled into this course
 * - across every place a source file id (a topic lesson's primary file, its
 * other slide/notes blocks, a quiz's question group) or a video block's URL
 * is recorded. Re-running import over the same folder/playlist must skip
 * these outright, rather than asking the classifier/placement model to
 * structure content it already turned into a lesson once - that previously
 * produced fully duplicated units/lessons/questions that had to be deleted by
 * hand.
 */
async function alreadyImportedCourseContent(
  courseId: string
): Promise<{ driveFileIds: Set<string>; youtubeVideoIds: Set<string> }> {
  const supabase = await createClient();
  const driveFileIds = new Set<string>();
  const youtubeVideoIds = new Set<string>();

  const { data: units } = await supabase.from("units").select("id").eq("course_id", courseId);
  const unitIds = (units ?? []).map((u) => u.id as string);
  if (unitIds.length === 0) return { driveFileIds, youtubeVideoIds };

  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, source_drive_file_id")
    .in("unit_id", unitIds);
  for (const lesson of lessons ?? []) {
    if (lesson.source_drive_file_id) driveFileIds.add(lesson.source_drive_file_id as string);
  }

  const lessonIds = (lessons ?? []).map((l) => l.id as string);
  if (lessonIds.length === 0) return { driveFileIds, youtubeVideoIds };

  const [{ data: blocks }, { data: groups }] = await Promise.all([
    supabase.from("lesson_blocks").select("source_drive_file_id, video_url").in("lesson_id", lessonIds),
    supabase.from("question_groups").select("source_drive_file_id").in("lesson_id", lessonIds),
  ]);
  for (const block of blocks ?? []) {
    if (block.source_drive_file_id) driveFileIds.add(block.source_drive_file_id as string);
    const videoId = block.video_url ? extractYoutubeVideoId(block.video_url as string) : null;
    if (videoId) youtubeVideoIds.add(videoId);
  }
  for (const group of groups ?? []) {
    if (group.source_drive_file_id) driveFileIds.add(group.source_drive_file_id as string);
  }

  return { driveFileIds, youtubeVideoIds };
}

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
  const urls = await renderGoogleSlidesThumbnails(clients, presentationId, file.id, title);
  return urls && urls.length > 0 ? urls : null;
}

/** Uploads a PDF durably, creates the lesson block, then links the attachment to it. Returns false (no block created) when there was no PDF to embed. */
async function addPdfEmbedBlock(
  lessonId: string,
  file: DriveEntry,
  analysis: DriveFileAnalysis,
  pdfUrl: string | null,
  pdfBytes: Buffer | null,
  position: number
): Promise<boolean> {
  const uploaded = pdfBytes
    ? await uploadDriveFile(file.id, pdfBytes, "application/pdf", `${cleanFilenameTitle(file.name)}.pdf`)
    : null;
  const url = uploaded?.url ?? pdfUrl;
  if (!url) return false;

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
  return true;
}

/**
 * Adds one slide/video file as a lesson block at the given position. Returns
 * whether a block actually got created - a failed render/download/extraction
 * anywhere along the way means no block, and the caller needs to know that so
 * it never leaves a lesson looking populated when it's actually empty.
 */
async function addSlideFileBlock(
  lessonId: string,
  file: DriveEntry,
  resolved: ResolvedFile,
  analysis: DriveFileAnalysis,
  resourceKeyHeader: string | undefined,
  position: number
): Promise<boolean> {
  if (resolved.routing === "video") {
    if (!resolved.videoUrl) return false;
    await addLessonBlock(lessonId, {
      kind: "video",
      position,
      title: analysis.title || null,
      sourceDriveFileId: file.id,
      videoUrl: resolved.videoUrl,
    });
    return true;
  }

  const title = analysis.title || cleanFilenameTitle(file.name);

  if (resolved.routing === "google_slides") {
    const thumbnailUrls = await tryRenderSlidesAsThumbnails(file.id, file, title);
    if (thumbnailUrls) {
      await addRenderedSlidesBlock(lessonId, file, analysis, thumbnailUrls, position);
      return true;
    }

    const drive = await getDriveClient();
    const pdfBase64 = await downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader);
    if (pdfBase64) {
      return addPdfEmbedBlock(lessonId, file, analysis, null, Buffer.from(pdfBase64, "base64"), position);
    }
    return false;
  }

  if (resolved.routing === "slide_pdf") {
    return addPdfEmbedBlock(
      lessonId,
      file,
      analysis,
      null,
      Buffer.from(resolved.pdfBase64, "base64"),
      position
    );
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
            return true;
          }

          const renderedPdfUrl = await exportPresentationAsPdf(
            oauthClients.drive,
            tempPresentationId,
            file.id,
            title
          );
          if (renderedPdfUrl) {
            return addPdfEmbedBlock(lessonId, file, analysis, renderedPdfUrl, null, position);
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
        return addPdfEmbedBlock(lessonId, file, analysis, renderedPdfUrl, null, position);
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
    if (!bodyHtml.trim()) return false;
    await addLessonBlock(lessonId, {
      kind: "slide_file",
      position,
      title: analysis.title || null,
      sourceDriveFileId: file.id,
      renderMode: "slide_card_images",
      bodyHtml,
    });
    return true;
  }

  if (resolved.routing === "document_text") {
    const paragraphs = resolved.pages.flatMap((page) => page.texts);
    const bodyHtml = paragraphsToNotesHtml(paragraphs);
    if (!bodyHtml) return false;
    await addLessonBlock(lessonId, {
      kind: "course_notes",
      position,
      title: analysis.title || cleanFilenameTitle(file.name),
      sourceDriveFileId: file.id,
      bodyHtml,
    });
    return true;
  }

  return false;
}

function shouldBecomeExternalLesson(analysis: DriveFileAnalysis): boolean {
  return analysis.category === "assignment" || analysis.category === "homework";
}

/**
 * Renders the assignment file itself as a lesson block (whatever type its
 * routing resolves to — notes, slides, PDF) rather than a synthesized
 * "Course Notes" summary, matching how topic lessons render their files.
 */
async function populateExternalLesson(
  lessonId: string,
  quiz: { title: string; file: DriveEntry },
  entry: { analysis: DriveFileAnalysis; resolved: ResolvedFile },
  driveFilesById: Map<string, DriveEntry>,
  duplicatesBySurvivorId: Map<string, string[]>,
  resourceKeyHeader: string | undefined
): Promise<boolean> {
  const supabase = await createClient();
  const { error: typeError } = await supabase
    .from("lessons")
    .update({ type: "external" })
    .eq("id", lessonId);
  if (typeError) throw new Error(typeError.message);

  if (entry.resolved.routing !== "unsupported") {
    await addSlideFileBlock(
      lessonId,
      quiz.file,
      entry.resolved,
      entry.analysis,
      resourceKeyHeader,
      1
    );
  }

  await addDriveLinkAttachments(
    lessonId,
    [quiz.file.id, ...(duplicatesBySurvivorId.get(quiz.file.id) ?? [])],
    driveFilesById
  );
  return true;
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
  quiz: { title: string; file: DriveEntry; extraFiles: DriveEntry[] },
  entry: { analysis: DriveFileAnalysis; resolved: ResolvedFile },
  resolvedByFileId: Map<string, { analysis: DriveFileAnalysis; resolved: ResolvedFile }>,
  course: { title: string; department: string },
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  driveFilesById: Map<string, DriveEntry>,
  duplicatesBySurvivorId: Map<string, string[]>,
  resourceKeyHeader: string | undefined
): Promise<boolean> {
  const { resolved } = entry;

  const extraSources = quiz.extraFiles
    .map((file) => {
      const extraEntry = resolvedByFileId.get(file.id);
      return extraEntry ? { file, resolved: extraEntry.resolved } : null;
    })
    .filter((e): e is { file: DriveEntry; resolved: ResolvedFile } => e !== null);

  const extracted = await extractQuestionsFromDriveFile(
    course,
    drive,
    { file: quiz.file, resolved },
    extraSources,
    resourceKeyHeader
  ).catch((error) => {
    console.error(
      `populateQuizLesson: question extraction failed for "${quiz.file.name}":`,
      error instanceof Error ? error.message : error
    );
    return [];
  });

  if (extracted.length === 0) {
    // Nothing gradable came out of this file - a question_group/lesson
    // block with zero questions is a dead end for a student, so don't create
    // them at all. The caller drops the whole (now genuinely empty) lesson.
    console.warn(
      `populateQuizLesson: no gradable questions found in "${quiz.file.name}"`
    );
    return false;
  }

  const group = await addQuestionGroup(lessonId, {
    sourceDriveFileId: quiz.file.id,
    title: quiz.title,
    position: 1,
  });

  const createdQuestions: Awaited<ReturnType<typeof addQuestion>>[] = [];

  for (const question of extracted) {
    const created = await addQuestion(group.id, {
      position: question.position,
      promptText: question.promptText,
      promptSource: question.promptSource,
      choices: question.choices,
      answerKey: question.answerKey,
      questionType: question.questionType,
      sourceSlideOrPageIndex: question.sourceSlideOrPageIndex,
      needsReview: question.needsReview,
    });
    createdQuestions.push(created);
  }

  // Generate variant pools with bounded parallelism so import stays responsive.
  const concurrency = 3;
  for (let i = 0; i < createdQuestions.length; i += concurrency) {
    const batch = createdQuestions.slice(i, i + concurrency);
    await Promise.all(
      batch.map((q) =>
        persistQuestionVariants(q.id, {
          promptText: q.promptText,
          questionType: q.questionType,
          choices: q.choices,
          answerKey: q.answerKey,
        })
      )
    );
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

  return true;
}

/**
 * Populates one topic lesson's blocks. Returns how many blocks actually got
 * created - a topic whose files all failed to render (broken download, no
 * OAuth fallback, empty notes export, etc.) returns 0 so the caller can drop
 * the lesson entirely instead of leaving a title with nothing under it.
 */
async function populateTopicLesson(
  lessonId: string,
  topic: {
    videoFiles: DriveEntry[];
    slideFiles: DriveEntry[];
    notesFiles: DriveEntry[];
    externalVideo?: { url: string; title: string } | null;
  },
  resolvedByFileId: Map<string, { analysis: DriveFileAnalysis; resolved: ResolvedFile }>,
  driveFilesById: Map<string, DriveEntry>,
  duplicatesBySurvivorId: Map<string, string[]>,
  resourceKeyHeader: string | undefined
): Promise<number> {
  let blockPosition = 0;
  let blocksAdded = 0;
  const allFileIds = new Set<string>();

  // 1. Video at top (first video only)
  const videoFile = topic.videoFiles[0];
  if (videoFile) {
    const entry = resolvedByFileId.get(videoFile.id);
    if (entry) {
      const added = await addSlideFileBlock(
        lessonId,
        videoFile,
        entry.resolved,
        entry.analysis,
        resourceKeyHeader,
        blockPosition + 1
      );
      if (added) {
        blockPosition += 1;
        blocksAdded += 1;
      }
      allFileIds.add(videoFile.id);
    }
  }

  // 1b. Fall back to a YouTube-playlist video when Drive had no video file
  // for this topic (see attachYoutubePlaylistVideos).
  if (!videoFile && topic.externalVideo) {
    await addLessonBlock(lessonId, {
      kind: "video",
      position: blockPosition + 1,
      title: topic.externalVideo.title || null,
      sourceDriveFileId: null,
      videoUrl: topic.externalVideo.url,
    });
    blockPosition += 1;
    blocksAdded += 1;
  }

  // 2. Toggleable slide files and notes/reading files — each rendered as its
  // own block straight from its source file. This is an import parser, not a
  // summarizer: no separate "Course Notes" block gets synthesized by
  // re-extracting a file whose content is already shown verbatim here, since
  // that only ever produced a duplicate copy of the same material.
  for (const file of [...topic.slideFiles, ...topic.notesFiles]) {
    const entry = resolvedByFileId.get(file.id);
    if (!entry || entry.resolved.routing === "unsupported") continue;
    const added = await addSlideFileBlock(
      lessonId,
      file,
      entry.resolved,
      entry.analysis,
      resourceKeyHeader,
      blockPosition + 1
    );
    if (added) {
      blockPosition += 1;
      blocksAdded += 1;
    }
    allFileIds.add(file.id);
  }

  // Drive link attachments for every file in this topic
  for (const fileId of allFileIds) {
    const dupes = duplicatesBySurvivorId.get(fileId) ?? [];
    await addDriveLinkAttachments(lessonId, [fileId, ...dupes], driveFilesById);
  }

  return blocksAdded;
}

/**
 * Fetches lecture videos from either a single YouTube playlist link or a
 * channel link (when a course splits lectures into one playlist per unit),
 * and has an LLM place them into the course's unit/topic structure —
 * filling a Drive-classified topic that has no video yet where one clearly
 * fits, and inventing brand-new units/topics for lectures that exist only on
 * YouTube (e.g. a Drive folder with no per-lecture structure of its own —
 * just a single doc linking out to the playlist/channel). Mutates `units`
 * (and its topics) in place, including pushing new unit/topic entries.
 * Best-effort: any failure is returned as a warning string rather than
 * thrown, so a broken/unreadable playlist/channel never blocks the rest of
 * the (already-succeeded) Drive import.
 */
async function attachYoutubePlaylistVideos(
  course: { title: string; department: string },
  units: OrganizeUnitForPersist[],
  folderId: string,
  playlistOrChannelUrl: string,
  alreadyPlacedVideoIds: Set<string>
): Promise<string | null> {
  let videos: YoutubePlaylistVideo[];
  let truncatedNote: string | null = null;
  try {
    if (looksLikePlaylistReference(playlistOrChannelUrl)) {
      videos = await fetchYoutubePlaylistVideos(playlistOrChannelUrl);
    } else {
      const result = await fetchAllVideosForChannel(playlistOrChannelUrl);
      videos = result.videos;
      if (result.truncated) {
        truncatedNote = "That channel has more playlists than could be scanned — only the first 20 were checked.";
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that YouTube playlist or channel.";
    console.error("attachYoutubePlaylistVideos: failed to read playlist/channel:", message);
    return message;
  }

  console.log(`attachYoutubePlaylistVideos: fetched ${videos.length} video(s) from ${playlistOrChannelUrl}`);

  // Never re-place a video this course already has a lesson for — otherwise
  // re-running import with the same playlist/channel link (e.g. after new
  // lectures were added to it) re-declares brand-new duplicate units/topics
  // for videos that already have a home, since a YouTube-only lesson has no
  // Drive file id for the ordinary already-imported check above to catch.
  const alreadyPlacedCount = videos.filter((v) => alreadyPlacedVideoIds.has(v.videoId)).length;
  videos = videos.filter((v) => !alreadyPlacedVideoIds.has(v.videoId));
  if (alreadyPlacedCount > 0) {
    console.log(`attachYoutubePlaylistVideos: skipping ${alreadyPlacedCount} video(s) already placed in this course`);
  }

  if (videos.length === 0) {
    return alreadyPlacedCount > 0
      ? null
      : "That YouTube playlist/channel has no videos.";
  }

  // Existing units/topics are referenced by a stable id assigned here, never
  // by title — Opus reusing a slightly-reworded title instead of an id is
  // exactly what previously produced near-duplicate units for the same
  // lecture (e.g. two "Genome Assembly..." units, one with 3 lessons and one
  // with 15, created within a single run).
  const existingUnits: YoutubeExistingUnit[] = units.map((unit, ui) => ({
    id: `u${ui}`,
    title: unit.title,
    topics: unit.topics.map((topic, ti) => ({
      id: `u${ui}t${ti}`,
      title: topic.title,
      hasVideo: topic.videoFiles.length > 0,
    })),
  }));
  const unitByExistingId = new Map(existingUnits.map((eu, ui) => [eu.id, units[ui]!]));
  const topicByExistingId = new Map<string, TopicGroup>();
  existingUnits.forEach((eu, ui) => {
    eu.topics.forEach((et, ti) => topicByExistingId.set(et.id, units[ui]!.topics[ti]!));
  });

  let result;
  try {
    result = await placeYoutubeVideos(course, videos, existingUnits);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not place playlist videos into the course.";
    console.error("attachYoutubePlaylistVideos: placement failed:", message);
    return message;
  }

  console.log(
    `attachYoutubePlaylistVideos: declared ${result.newUnits.length} new unit(s), placed ${result.placements.length}/${videos.length} video(s)`
  );

  const newUnitObjects = new Map<string, OrganizeUnitForPersist>();
  for (const nu of result.newUnits) {
    newUnitObjects.set(nu.key, {
      title: nu.title,
      order: 0, // unused for persistence — final position comes from array order after anchor-based insertion below
      sourceDriveFolderId: folderId,
      topics: [],
      quizzes: [],
    });
  }

  const resolveUnit = (unitRef: string): OrganizeUnitForPersist | undefined =>
    unitByExistingId.get(unitRef) ?? newUnitObjects.get(unitRef);

  // Tracks, per existing unit + anchor topic id ("" = lead), the index a new
  // topic was last inserted at — so several new topics anchored to the same
  // point stack in the order they're processed instead of reversing each
  // other, and later anchors correctly account for earlier insertions.
  const lastTopicInsertionIndex = new Map<OrganizeUnitForPersist, Map<string, number>>();

  const videoById = new Map(videos.map((v) => [v.videoId, v]));
  for (const placement of result.placements) {
    const video = videoById.get(placement.videoId);
    const unit = resolveUnit(placement.unitRef);
    if (!video || !unit) continue;

    let topic: TopicGroup | undefined;
    if (placement.existingTopicId) {
      topic = topicByExistingId.get(placement.existingTopicId);
      if (!topic || topic.videoFiles.length > 0 || topic.externalVideo) continue; // already validated, but never override
    } else {
      topic = {
        title: placement.newTopicTitle ?? video.title,
        order: video.position, // real playlist position — ground truth, not LLM-guessed
        videoFiles: [],
        slideFiles: [],
        notesFiles: [],
        externalVideo: null,
      };

      if (newUnitObjects.has(placement.unitRef)) {
        // Brand-new unit — every topic in it is new, so real playlist
        // position (sorted in once the unit is inserted below) is already a
        // correct, simple ordering; no anchoring needed.
        unit.topics.push(topic);
      } else {
        // Existing (Drive-derived) unit — slot the new topic in next to the
        // related material it was anchored to, instead of always at the end.
        const anchorMap = lastTopicInsertionIndex.get(unit) ?? new Map<string, number>();
        lastTopicInsertionIndex.set(unit, anchorMap);

        const anchorId = placement.insertAfterTopicId ?? "";
        const anchorTopic = anchorId ? topicByExistingId.get(anchorId) : undefined;
        let insertIndex: number;
        if (anchorMap.has(anchorId)) {
          insertIndex = anchorMap.get(anchorId)! + 1;
        } else if (anchorId === "") {
          insertIndex = 0;
        } else {
          const anchorIndex = anchorTopic ? unit.topics.indexOf(anchorTopic) : -1;
          insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : unit.topics.length;
        }

        unit.topics.splice(insertIndex, 0, topic);
        anchorMap.set(anchorId, insertIndex);
      }
    }

    topic.externalVideo = { url: youtubeWatchUrl(video.videoId), title: video.title };
  }

  // Insert each new unit right after the specific existing unit it anchored
  // to (re-resolving that anchor's current array index each time so several
  // new units anchored to the same point stack in the order Opus gave them,
  // and later anchors correctly account for earlier insertions). An empty or
  // unresolved anchor falls back to appending at the end — safer than
  // guessing a numeric position, which is what previously misplaced a
  // "course review" unit at position 26 of 32 instead of near the end.
  const lastInsertionIndexByAnchor = new Map<string, number>();
  for (const nu of result.newUnits) {
    const unitObj = newUnitObjects.get(nu.key);
    if (!unitObj || unitObj.topics.length === 0) continue; // declared but never actually used

    unitObj.topics.sort((a, b) => a.order - b.order);

    const anchorKey = nu.insertAfterUnitId ?? "";
    let insertIndex: number;
    if (lastInsertionIndexByAnchor.has(anchorKey)) {
      insertIndex = lastInsertionIndexByAnchor.get(anchorKey)! + 1;
    } else if (anchorKey === "") {
      insertIndex = 0;
    } else {
      const anchorUnit = unitByExistingId.get(anchorKey);
      const anchorIndex = anchorUnit ? units.indexOf(anchorUnit) : -1;
      insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : units.length;
    }

    units.splice(insertIndex, 0, unitObj);
    lastInsertionIndexByAnchor.set(anchorKey, insertIndex);
  }

  const placementNote = result.placements.length === 0 ? "None of the videos could be placed into the course." : null;
  return [truncatedNote, placementNote].filter(Boolean).join(" ") || null;
}

// Matches "Final Review", "Final Exam Review", "Course Review", "Cumulative
// Review", "Comprehensive Review", "Review for the final", etc. - but not a
// mid-course "Midterm 1 Review" or a plain per-topic "Recursion Review",
// which should stay wherever their own topic sorts.
const FINAL_REVIEW_UNIT_TITLE_PATTERN =
  /\bfinal\b[\s\S]*\breview\b|\breview\b[\s\S]*\bfinal\b|\bcourse\s+review\b|\bcumulative\s+review\b|\bcomprehensive\s+review\b/i;

function moveFinalReviewUnitsToEnd(units: OrganizeUnitForPersist[]): OrganizeUnitForPersist[] {
  const regular: OrganizeUnitForPersist[] = [];
  const finalReview: OrganizeUnitForPersist[] = [];
  for (const unit of units) {
    (FINAL_REVIEW_UNIT_TITLE_PATTERN.test(unit.title) ? finalReview : regular).push(unit);
  }
  return finalReview.length > 0 ? [...regular, ...finalReview] : units;
}

export async function runDriveImportOrganize(
  courseCode: string,
  folderUrl: string,
  youtubePlaylistUrl?: string,
  options?: { cogniterra?: CogniterraSetupInput }
): Promise<{
  unitIds: string[];
  lessonIds: string[];
  youtubePlaylistWarning?: string | null;
  cogniterraWired: number;
  skippedAlreadyImportedCount: number;
  failedUnitTitles: string[];
}> {
  const { folderId, resourceKey } = parseDriveFolderUrl(folderUrl);
  const resourceKeyHeader = resourceKey ? `${folderId}/${resourceKey}` : undefined;

  const supabase = await createClient();
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, code, title, department")
    .eq("code", courseCode)
    .single();
  if (courseError || !course) throw new Error("Unknown course code");

  if (
    options?.cogniterra?.cogniterraCourseId &&
    options.cogniterra.consumerKey &&
    (options.cogniterra.sharedSecret ||
      (await getCogniterraCourseConfig(courseCode)) !== null)
  ) {
    await saveCogniterraCourseConfig(courseCode, options.cogniterra);
  }

  const drive = await getDriveClient();
  const nestedTree = await buildDriveImportTree(drive, folderId, resourceKey).catch((error) => {
    throw new Error(driveErrorMessage(error));
  });

  // Folder layout is not a contract — flatten everything and let the model
  // decide units / multi-file content lessons / quizzes from file content.
  const flatTree = flattenDriveImportTree(nestedTree, folderId);

  // Never hand the classifier a file (or the placement model a video) this
  // course already imported — otherwise re-running the same folder/playlist
  // (retrying, or adding a few new files later) re-structures and re-persists
  // everything it already built once, producing fully duplicated
  // units/lessons/questions.
  const { driveFileIds: alreadyImportedFileIds, youtubeVideoIds: alreadyPlacedVideoIds } =
    await alreadyImportedCourseContent(course.id);
  let skippedAlreadyImportedCount = 0;
  const tree = {
    ...flatTree,
    units: flatTree.units.map((unit) => ({
      ...unit,
      files: unit.files.filter((f) => {
        if (!alreadyImportedFileIds.has(f.id)) return true;
        skippedAlreadyImportedCount += 1;
        return false;
      }),
    })),
  };
  if (skippedAlreadyImportedCount > 0) {
    console.log(
      `runDriveImportOrganize: skipping ${skippedAlreadyImportedCount} file(s) already imported into "${courseCode}"`
    );
  }

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
  const trimmedPlaylistUrl = youtubePlaylistUrl?.trim() || null;

  // A Drive folder with nothing classifiable (e.g. just a doc linking out to
  // the actual lecture videos) is only a dead end when there's no YouTube
  // source to build the course from instead - otherwise plannedUnits starts
  // empty and attachYoutubePlaylistVideos below builds it from scratch.
  if (classifiableCount === 0 && !trimmedPlaylistUrl) {
    revalidatePath(`/instructor/${courseCode}`);
    return {
      unitIds: [],
      lessonIds: [],
      youtubePlaylistWarning: null,
      cogniterraWired: 0,
      skippedAlreadyImportedCount,
      failedUnitTitles: [],
    };
  }

  let plannedUnits: OrganizeUnitForPersist[] = [];
  const duplicatesBySurvivorId = new Map<string, string[]>();
  let unclassified: { name: string; driveFileId: string; reason: string }[] = [];

  if (classifiableCount > 0) {
    const basenameDupes = detectDuplicatesFromUnits(filteredTree.units);
    const classification = await classifyOrganizeImport(course, filteredTree, filteredAnalysis);
    unclassified = classification.unclassified;

    // Prefer model duplicates; fold in basename-detected pairs the model missed.
    const duplicates = [...classification.duplicates];
    const seenDupIds = new Set(duplicates.map((d) => d.driveFileId));
    for (const dup of basenameDupes.duplicates) {
      if (seenDupIds.has(dup.driveFileId)) continue;
      duplicates.push(dup);
      seenDupIds.add(dup.driveFileId);
    }

    const { units, extraDuplicates } = organizeClassificationToPersistable(
      { ...classification, duplicates },
      driveFilesById,
      folderId
    );
    plannedUnits = units;

    for (const duplicate of [...duplicates, ...extraDuplicates]) {
      const list = duplicatesBySurvivorId.get(duplicate.duplicateOfDriveFileId) ?? [];
      list.push(duplicate.driveFileId);
      duplicatesBySurvivorId.set(duplicate.duplicateOfDriveFileId, list);
    }
  }

  const youtubePlaylistWarning = trimmedPlaylistUrl
    ? await attachYoutubePlaylistVideos(course, plannedUnits, folderId, trimmedPlaylistUrl, alreadyPlacedVideoIds)
    : null;

  // A cumulative/final course review almost never has one clear topical home,
  // so an LLM ordering call (classifyOrganizeGrouping's prerequisite-based
  // "order", or a YouTube review video's own new-unit anchor) is never a hard
  // guarantee it lands last - this is a deterministic backstop on top of
  // those prompts, not a replacement for them.
  plannedUnits = moveFinalReviewUnitsToEnd(plannedUnits);

  for (const item of unclassified) {
    console.log(
      `runDriveImportOrganize: unclassified "${item.name}" (${item.driveFileId}): ${item.reason}`
    );
  }

  const unitIds: string[] = [];
  const lessonIds: string[] = [];
  const externalAssignments: DriveAssignmentForMatch[] = [];
  const failedUnitTitles: string[] = [];

  for (const unit of plannedUnits) {
    // A DB/network hiccup partway through one unit (a Supabase gateway
    // timeout has been observed here on long-running imports) must not
    // discard every other already-classified unit along with it — catch and
    // move on, so the rest of the course still imports. A re-run of import
    // picks the failed unit's files back up (they never got a
    // source_drive_file_id recorded, so alreadyImportedCourseContent above
    // won't skip them).
    try {
      await importOneUnit(unit, { title: course.title, department: course.department });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `runDriveImportOrganize: unit "${unit.title}" failed to import, skipping to the next unit (re-run import to retry it): ${message}`
      );
      failedUnitTitles.push(unit.title);
    }
  }

  async function importOneUnit(
    unit: OrganizeUnitForPersist,
    course: { title: string; department: string }
  ): Promise<void> {
    const newUnit = await addUnitFromImport(courseCode, unit.title, unit.sourceDriveFolderId);
    let unitLessonCount = 0;
    let lessonPosition = 0;

    for (const topic of unit.topics) {
      const primaryFile =
        topic.videoFiles[0] ?? topic.slideFiles[0] ?? topic.notesFiles[0];
      // A topic with no Drive file at all is still valid when it's a
      // YouTube-only lecture (see attachYoutubePlaylistVideos) — everything
      // else (a Drive-classified topic that produced no files) still bails.
      if (!primaryFile && !topic.externalVideo) continue;

      lessonPosition += 1;
      const newLesson = await addLessonFromImport(newUnit.id, {
        title: topic.title,
        type: "lesson",
        position: lessonPosition,
        sourceDriveFileId: primaryFile?.id ?? null,
        contentSource: "blocks",
      });

      const blocksAdded = await populateTopicLesson(
        newLesson.id,
        topic,
        resolvedByFileId,
        driveFilesById,
        duplicatesBySurvivorId,
        resourceKeyHeader
      );

      if (blocksAdded === 0) {
        // Every file this topic pointed at failed to render into anything -
        // don't leave an empty page in the sidebar.
        console.warn(
          `runDriveImportOrganize: dropping empty topic lesson "${topic.title}" - no content block could be built from its file(s)`
        );
        await deleteLesson(courseCode, newLesson.id);
        lessonPosition -= 1;
        continue;
      }

      lessonIds.push(newLesson.id);
      unitLessonCount += 1;
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
        category: quizLessonCategory(entry.analysis.category),
      });

      const hasQuestions = await populateQuizLesson(
        newLesson.id,
        quiz,
        entry,
        resolvedByFileId,
        { title: course.title, department: course.department },
        drive,
        driveFilesById,
        duplicatesBySurvivorId,
        resourceKeyHeader
      );

      if (!hasQuestions) {
        if (shouldBecomeExternalLesson(entry.analysis)) {
          await populateExternalLesson(
            newLesson.id,
            quiz,
            entry,
            driveFilesById,
            duplicatesBySurvivorId,
            resourceKeyHeader
          );
          externalAssignments.push({
            lessonId: newLesson.id,
            title: quiz.title,
            topicSummary: entry.analysis.topicSummary,
          });
          lessonIds.push(newLesson.id);
          unitLessonCount += 1;
          continue;
        }

        console.warn(
          `runDriveImportOrganize: dropping empty quiz lesson "${quiz.title}" - no gradable questions could be extracted`
        );
        await deleteLesson(courseCode, newLesson.id);
        lessonPosition -= 1;
        continue;
      }

      lessonIds.push(newLesson.id);
      unitLessonCount += 1;
    }

    if (unitLessonCount === 0) {
      // Every topic/quiz in this unit turned out empty - don't leave a unit
      // with a title and nothing underneath it.
      console.warn(`runDriveImportOrganize: dropping empty unit "${unit.title}" - no lesson survived content resolution`);
      await deleteUnit(courseCode, newUnit.id);
      return;
    }

    unitIds.push(newUnit.id);
  }

  const { wired: cogniterraWired } = await wireExternalLessonsToCogniterra(
    courseCode,
    externalAssignments
  );
  if (cogniterraWired > 0) {
    console.log(
      `runDriveImportOrganize: wired ${cogniterraWired} external lesson(s) to Cogniterra`
    );
  } else if (externalAssignments.length > 0) {
    console.warn(
      `runDriveImportOrganize: ${externalAssignments.length} external assignment(s) but none wired to Cogniterra (is cogniterra config saved?)`
    );
  }

  revalidatePath(`/instructor/${courseCode}`);
  return {
    unitIds,
    lessonIds,
    youtubePlaylistWarning,
    cogniterraWired,
    skippedAlreadyImportedCount,
    failedUnitTitles,
  };
}
