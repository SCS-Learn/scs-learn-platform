import type { drive_v3 } from "googleapis";
import type JSZip from "jszip";
import { withDriveRetry } from "@/lib/google/drive-retry";
import { extractPdfPageText } from "@/lib/google/extract-pdf-text";
import { extractDocParagraphsFromZip, paragraphsToNotesHtml } from "@/lib/google/extract-doc-text";
import { loadOoxmlZip } from "@/lib/google/load-ooxml-zip";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeGoogleDocHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let content = bodyMatch ? bodyMatch[1]! : html;
  content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
  content = content.replace(/<style[\s\S]*?<\/style>/gi, "");
  return content.trim();
}

function pdfPagesToHtml(pdfBase64: string): Promise<string> {
  return extractPdfPageText(pdfBase64).then((pages) =>
    pages
      .flatMap((page) => page.texts)
      .map((text) => `<p>${escapeHtml(text)}</p>`)
      .join("\n")
  );
}

async function docZipToHtml(zip: JSZip): Promise<string> {
  const paragraphs = await extractDocParagraphsFromZip(zip);
  return paragraphsToNotesHtml(paragraphs);
}

/**
 * Exports a notes file to HTML — Google Docs as HTML export, docx/PDF as
 * deterministic text extraction wrapped in paragraphs. Content is unmodified
 * source text, not LLM-authored.
 */
export async function exportDriveFileAsNotesHtml(
  drive: drive_v3.Drive,
  file: { id: string; name: string; mimeType: string },
  resourceKeyHeader: string | undefined,
  pdfBase64: string | null
): Promise<string | null> {
  const requestOptions = resourceKeyHeader
    ? { headers: { "X-Goog-Drive-Resource-Keys": resourceKeyHeader } }
    : {};

  try {
    if (file.mimeType === "application/vnd.google-apps.document") {
      const { data } = await withDriveRetry(`export html ${file.id}`, () =>
        drive.files.export(
          { fileId: file.id, mimeType: "text/html" },
          { ...requestOptions, responseType: "arraybuffer" }
        )
      );
      const html = sanitizeGoogleDocHtml(Buffer.from(data as ArrayBuffer).toString("utf-8"));
      return html || null;
    }

    const zip = await loadOoxmlZip(drive, file, resourceKeyHeader).catch(() => null);
    if (zip && file.mimeType.includes("wordprocessingml")) {
      const html = await docZipToHtml(zip);
      return html || null;
    }

    if (pdfBase64) {
      const html = await pdfPagesToHtml(pdfBase64);
      return html || null;
    }

    return null;
  } catch (error) {
    console.warn(`exportDriveFileAsNotesHtml failed for ${file.name}:`, error);
    return null;
  }
}

export function mergeNotesSections(sections: { title: string; html: string }[]): string {
  return sections
    .map((section) => `<section class="course-notes-section">${section.html}</section>`)
    .join('<hr class="course-notes-divider">');
}
