import type { drive_v3 } from "googleapis";

const PDF_EXPORTABLE_MIME_TYPES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
]);

/**
 * Best-effort: returns null for anything that isn't a PDF or a Workspace
 * type Drive can export to PDF (images, video, Forms, unknown types, or a
 * failed request) - the caller falls back to attachment-only for those, no
 * generated lesson content.
 */
export async function downloadDriveFileAsPdfBase64(
  drive: drive_v3.Drive,
  file: { id: string; mimeType: string },
  resourceKeyHeader?: string
): Promise<string | null> {
  const requestOptions = resourceKeyHeader
    ? { headers: { "X-Goog-Drive-Resource-Keys": resourceKeyHeader } }
    : {};

  try {
    if (file.mimeType === "application/pdf") {
      const { data } = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { ...requestOptions, responseType: "arraybuffer" }
      );
      return Buffer.from(data as ArrayBuffer).toString("base64");
    }
    if (PDF_EXPORTABLE_MIME_TYPES.has(file.mimeType)) {
      const { data } = await drive.files.export(
        { fileId: file.id, mimeType: "application/pdf" },
        { ...requestOptions, responseType: "arraybuffer" }
      );
      return Buffer.from(data as ArrayBuffer).toString("base64");
    }
    return null;
  } catch {
    return null;
  }
}
