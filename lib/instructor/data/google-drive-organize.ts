"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, parseDriveFolderUrl } from "@/lib/google/drive-client";
import { buildDriveImportTree, type DriveEntry } from "@/lib/google/drive-traversal";
import { classifyUnitIntoTopics, detectDuplicatesFromUnits } from "@/lib/google/classify-drive-topics";
import { classifyFileRole, isQuizFilename } from "@/lib/google/file-role";
import { exportDriveFileAsNotesHtml, mergeNotesSections } from "@/lib/google/export-drive-notes-html";
import { downloadDriveFileAsPdfBase64 } from "@/lib/google/download-drive-file";
import { analysisFromFilename } from "@/lib/google/analysis-from-filename";
import type { DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import { detectVideoLink } from "@/lib/google/detect-video-link";
import { detectVideoUrlInDocument } from "@/lib/google/extract-document-text";
import { renderPptxSlideCards } from "@/lib/google/render-pptx-slide-cards";
import { extractSlideTextFromZip, type SlideText } from "@/lib/google/extract-slide-text";
import { extractDocParagraphsFromZip } from "@/lib/google/extract-doc-text";
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
  resolved: ResolvedFile,
  course: { title: string; department: string },
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  driveFilesById: Map<string, DriveEntry>,
  duplicatesBySurvivorId: Map<string, string[]>,
  resourceKeyHeader: string | undefined
): Promise<void> {
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

  await addDriveLinkAttachments(
    lessonId,
    [quiz.file.id, ...(duplicatesBySurvivorId.get(quiz.file.id) ?? [])],
    driveFilesById
  );

  if (extracted.length === 0) {
    console.warn(
      `populateQuizLesson: no questions extracted from "${quiz.file.name}" - lesson will show an empty quiz state`
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
  const tree = await buildDriveImportTree(drive, folderId, resourceKey).catch((error) => {
    throw new Error(driveErrorMessage(error));
  });

  const driveFilesById = new Map(tree.units.flatMap((u) => u.files).map((f) => [f.id, f]));

  const resolvedByFileId = new Map<string, { analysis: DriveFileAnalysis; resolved: ResolvedFile }>(
    await mapWithConcurrencyLimit(
      Array.from(driveFilesById.values()),
      DRIVE_IMPORT_CONCURRENCY,
      async (file) => [file.id, await resolveFile(drive, file, resourceKeyHeader)] as const
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
      const file = driveFilesById.get(fileId);
      // Quiz/assignment files must never vanish silently — keep them even when
      // Drive can't export to PDF (common for uploaded .docx).
      if (file && isQuizFilename(file.name)) {
        analysisByFileId.set(fileId, {
          ...analysis,
          isCourseContent: true,
          notCourseContentReason: "",
          type: "quiz",
          category: "homework",
        });
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

  const { duplicates, duplicateFileIds } = detectDuplicatesFromUnits(filteredTree.units);
  const duplicatesBySurvivorId = new Map<string, string[]>();
  for (const duplicate of duplicates) {
    const list = duplicatesBySurvivorId.get(duplicate.duplicateOfDriveFileId) ?? [];
    list.push(duplicate.driveFileId);
    duplicatesBySurvivorId.set(duplicate.duplicateOfDriveFileId, list);
  }

  const roleByFileId = new Map<string, ReturnType<typeof classifyFileRole>>();
  for (const [fileId, { analysis, resolved }] of resolvedByFileId) {
    if (excludedFileIds.has(fileId)) continue;
    const file = driveFilesById.get(fileId);
    if (!file) continue;
    let role = classifyFileRole(file, resolved.routing, analysis.isCourseContent !== false);
    if (role === "skip" && isQuizFilename(file.name)) role = "quiz";
    roleByFileId.set(fileId, role);
  }

  const unitIds: string[] = [];
  const lessonIds: string[] = [];

  for (const unit of filteredTree.units) {
    const { topics, quizzes } = classifyUnitIntoTopics(unit, roleByFileId, duplicateFileIds);
    if (topics.length === 0 && quizzes.length === 0) continue;

    const newUnit = await addUnitFromImport(
      courseCode,
      unit.folderName,
      unit.folderId
    );
    unitIds.push(newUnit.id);

    let lessonPosition = 0;

    for (const topic of topics) {
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

    for (const quiz of quizzes) {
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
        entry.resolved,
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
