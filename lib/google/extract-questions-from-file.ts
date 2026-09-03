import type { drive_v3 } from "googleapis";
import type { DriveEntry } from "@/lib/google/drive-traversal";
import { buildQuizQuestionsFromContent, type BuiltQuizQuestion } from "@/lib/google/build-quiz-questions-from-file";
import { downloadDriveFileAsPdfBase64 } from "@/lib/google/download-drive-file";
import { extractPdfPageText } from "@/lib/google/extract-pdf-text";

type ResolvedFile =
  | { routing: "video"; videoUrl: string }
  | { routing: "google_slides" }
  | { routing: "slide_pdf"; pdfBase64: string }
  | { routing: "slide_cards"; slides: { index: number; texts: string[] }[] }
  | { routing: "document_text"; pages: { index: number; texts: string[] }[] }
  | { routing: "unsupported" };

export type ExtractedQuizQuestion = BuiltQuizQuestion & {
  promptSource: "llm_transcribed";
  sourceSlideOrPageIndex: number | null;
};

type ContentBlock =
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "text"; text: string };

/**
 * Prefer handing the model the richest available source: PDF when we have one,
 * otherwise slide/document text. Always include text alongside PDF when both
 * exist so small OCR gaps don't hide problems.
 */
async function contentBlocksForResolved(
  drive: drive_v3.Drive,
  file: DriveEntry,
  resolved: ResolvedFile,
  resourceKeyHeader: string | undefined
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];

  if (resolved.routing === "slide_pdf") {
    blocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: resolved.pdfBase64 },
    });
    return blocks;
  }

  if (resolved.routing === "google_slides") {
    const pdfBase64 = await downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader);
    if (pdfBase64) {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
      });
      return blocks;
    }
  }

  // Docs/docx: try PDF export first (native Google Docs), then fall back to text.
  if (resolved.routing === "document_text") {
    const pdfBase64 = await downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader).catch(
      () => null
    );
    if (pdfBase64) {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
      });
    }

    const body = resolved.pages.map((page) => page.texts.join("\n")).join("\n\n").trim();
    if (body) {
      blocks.push({
        type: "text",
        text: `Document text extracted from "${file.name}":\n\n${body}`,
      });
    }
    return blocks;
  }

  if (resolved.routing === "slide_cards") {
    const body = resolved.slides
      .map(
        (slide) =>
          `Slide ${slide.index}:\n${slide.texts.length > 0 ? slide.texts.join("\n") : "(no extractable text)"}`
      )
      .join("\n\n");
    blocks.push({ type: "text", text: `Slide deck text:\n\n${body}` });
    return blocks;
  }

  return blocks;
}

/**
 * Hands quiz/assignment/practice-problem source content to an LLM to build
 * structured questions (including free_response) that instructors can edit.
 */
export async function extractQuestionsFromDriveFile(
  course: { title: string; department: string },
  drive: drive_v3.Drive,
  file: DriveEntry,
  resolved: ResolvedFile,
  resourceKeyHeader: string | undefined
): Promise<ExtractedQuizQuestion[]> {
  if (resolved.routing === "unsupported" || resolved.routing === "video") {
    console.warn(
      `extractQuestionsFromDriveFile: cannot read "${file.name}" (routing=${resolved.routing})`
    );
    return [];
  }

  const blocks = await contentBlocksForResolved(drive, file, resolved, resourceKeyHeader);
  if (blocks.length === 0) {
    console.warn(
      `extractQuestionsFromDriveFile: no content blocks for "${file.name}" (routing=${resolved.routing})`
    );
    return [];
  }

  const built = await buildQuizQuestionsFromContent(course, file.name, blocks);
  console.log(
    `extractQuestionsFromDriveFile: built ${built.length} question(s) from "${file.name}"`
  );

  return built.map((question) => ({
    ...question,
    promptSource: "llm_transcribed" as const,
    sourceSlideOrPageIndex: null,
  }));
}

/** Fallback: extract plain text when LLM path has no PDF/document blocks. */
export async function extractPlainTextFromResolved(resolved: ResolvedFile): Promise<string> {
  if (resolved.routing === "slide_pdf") {
    const pages = await extractPdfPageText(resolved.pdfBase64);
    return pages.flatMap((p) => p.texts).join("\n");
  }
  if (resolved.routing === "document_text") {
    return resolved.pages.flatMap((p) => p.texts).join("\n");
  }
  if (resolved.routing === "slide_cards") {
    return resolved.slides.flatMap((s) => s.texts).join("\n");
  }
  return "";
}
