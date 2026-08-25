import JSZip from "jszip";
import type { drive_v3 } from "googleapis";

const OOXML_EXPORT_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.google-apps.presentation":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.google-apps.spreadsheet":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// A file already saved in one of these formats (a real .pptx/.docx/.xlsx,
// not a Google-native Doc/Slide/Sheet) has no "export" to do - the OOXML zip
// *is* the file, so it's downloaded directly instead.
const ALREADY_OOXML_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/**
 * Fetches a file's OOXML zip exactly once - either Drive-exported (a
 * Google-native Doc/Slide/Sheet) or downloaded as-is (an already
 * .docx/.pptx/.xlsx file) - so image extraction and slide-text extraction
 * can both read from the same in-memory zip instead of each downloading a
 * potentially huge file over again. Returns null for a mimeType this can't
 * produce a zip for (plain PDFs, images, unknown types) or on a failed
 * request.
 */
export async function loadOoxmlZip(
  drive: drive_v3.Drive,
  file: { id: string; mimeType: string },
  resourceKeyHeader?: string
): Promise<JSZip | null> {
  const requestOptions = resourceKeyHeader
    ? { headers: { "X-Goog-Drive-Resource-Keys": resourceKeyHeader } }
    : {};

  try {
    let zipBuffer: Buffer;
    if (ALREADY_OOXML_MIME_TYPES.has(file.mimeType)) {
      const { data } = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { ...requestOptions, responseType: "arraybuffer" }
      );
      zipBuffer = Buffer.from(data as ArrayBuffer);
    } else {
      const exportMimeType = OOXML_EXPORT_MIME_TYPES[file.mimeType];
      if (!exportMimeType) return null;
      const { data } = await drive.files.export(
        { fileId: file.id, mimeType: exportMimeType },
        { ...requestOptions, responseType: "arraybuffer" }
      );
      zipBuffer = Buffer.from(data as ArrayBuffer);
    }
    return await JSZip.loadAsync(zipBuffer);
  } catch {
    return null;
  }
}
