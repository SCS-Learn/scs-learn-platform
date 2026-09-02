import type { drive_v3 } from "googleapis";
import type JSZip from "jszip";
import { withDriveRetry } from "@/lib/google/drive-retry";
import { extractPdfPageText } from "@/lib/google/extract-pdf-text";
import { extractDocParagraphsFromZip } from "@/lib/google/extract-doc-text";
import { loadOoxmlZip } from "@/lib/google/load-ooxml-zip";
import { detectVideoLink } from "@/lib/google/detect-video-link";

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Pulls plain text from a Google Doc / Word file so we can detect an embedded
 * YouTube (or similar) link before treating the file as slides or notes.
 */
export async function extractDocumentTextLines(
  drive: drive_v3.Drive,
  file: { id: string; name: string; mimeType: string },
  resourceKeyHeader: string | undefined,
  pdfBase64: string | null,
  zip: JSZip | null
): Promise<string[]> {
  if (zip && (file.mimeType === GOOGLE_DOC_MIME || file.mimeType === DOCX_MIME)) {
    const paragraphs = await extractDocParagraphsFromZip(zip).catch(() => []);
    if (paragraphs.length > 0) return paragraphs;
  }

  if (pdfBase64) {
    const pages = await extractPdfPageText(pdfBase64).catch(() => []);
    const lines = pages.flatMap((p) => p.texts);
    if (lines.length > 0) return lines;
  }

  if (file.mimeType === GOOGLE_DOC_MIME) {
    const requestOptions = resourceKeyHeader
      ? { headers: { "X-Goog-Drive-Resource-Keys": resourceKeyHeader } }
      : {};
    try {
      const { data } = await withDriveRetry(`export txt ${file.id}`, () =>
        drive.files.export(
          { fileId: file.id, mimeType: "text/plain" },
          { ...requestOptions, responseType: "arraybuffer" }
        )
      );
      const text = Buffer.from(data as ArrayBuffer).toString("utf-8").trim();
      if (text) return text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    } catch {
      // fall through
    }
  }

  if (!zip && (file.mimeType === GOOGLE_DOC_MIME || file.mimeType === DOCX_MIME)) {
    const loaded = await loadOoxmlZip(drive, file, resourceKeyHeader).catch(() => null);
    if (loaded) {
      const paragraphs = await extractDocParagraphsFromZip(loaded).catch(() => []);
      if (paragraphs.length > 0) return paragraphs;
    }
  }

  return [];
}

export async function detectVideoUrlInDocument(
  drive: drive_v3.Drive,
  file: { id: string; name: string; mimeType: string },
  resourceKeyHeader: string | undefined,
  pdfBase64: string | null,
  zip: JSZip | null
): Promise<string | null> {
  const lines = await extractDocumentTextLines(drive, file, resourceKeyHeader, pdfBase64, zip);
  return detectVideoLink(lines);
}
