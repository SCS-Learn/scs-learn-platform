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

async function contentBlocksForResolved(
  drive: drive_v3.Drive,
  file: DriveEntry,
  resolved: ResolvedFile,
  resourceKeyHeader: string | undefined
): Promise<ContentBlock[]> {
  if (resolved.routing === "slide_pdf") {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: resolved.pdfBase64 },
      },
    ];
  }

  if (resolved.routing === "google_slides") {
    const pdfBase64 = await downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader);
    if (pdfBase64) {
      return [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        },
      ];
    }
  }

  if (resolved.routing === "slide_cards") {
    const body = resolved.slides
      .map(
        (slide) =>
          `Slide ${slide.index}:\n${slide.texts.length > 0 ? slide.texts.join("\n") : "(no extractable text)"}`
      )
      .join("\n\n");
    return [{ type: "text", text: `Slide deck text:\n\n${body}` }];
  }

  if (resolved.routing === "document_text") {
    const body = resolved.pages.map((page) => page.texts.join("\n")).join("\n\n");
    return [{ type: "text", text: `Document text:\n\n${body}` }];
  }

  return [];
}

/**
 * Hands quiz/assignment source content to an LLM to build structured,
 * auto-gradable questions — not programmatic page slicing.
 */
export async function extractQuestionsFromDriveFile(
  course: { title: string; department: string },
  drive: drive_v3.Drive,
  file: DriveEntry,
  resolved: ResolvedFile,
  resourceKeyHeader: string | undefined
): Promise<ExtractedQuizQuestion[]> {
  if (resolved.routing === "unsupported" || resolved.routing === "video") return [];

  const blocks = await contentBlocksForResolved(drive, file, resolved, resourceKeyHeader);
  if (blocks.length === 0) return [];

  const built = await buildQuizQuestionsFromContent(course, file.name, blocks);

  return built.map((question) => ({
    ...question,
    promptSource: "llm_transcribed" as const,
    sourceSlideOrPageIndex: null,
  }));
}

/** Fallback: extract plain text when LLM path has no PDF/document blocks. */
export async function extractPlainTextFromResolved(
  resolved: ResolvedFile
): Promise<string> {
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
