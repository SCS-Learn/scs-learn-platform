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

const IMAGE_EXTENSION_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
};

const MAX_IMAGES_PER_FILE = 12;

export type DriveImage = { data: Buffer; contentType: string };

/**
 * Best-effort: the actual embedded photos/charts/diagrams in a Drive file,
 * pulled from the OOXML zip Drive exports Docs/Slides/Sheets into (embedded
 * media lives as plain image files under word|ppt|xl/media) - that's the only
 * way to get real raster assets out, since the PDF export flattens everything
 * to one flat page image and the Drive API has no per-image extraction of its
 * own. Only catches images inserted as pictures, not natively-drawn vector
 * shapes/charts. Native image uploads are returned as-is; anything else
 * (plain PDFs, unknown types, or a failed request) yields no images - the
 * caller falls back to text-only content for those.
 */
export async function extractDriveFileImages(
  drive: drive_v3.Drive,
  file: { id: string; mimeType: string },
  resourceKeyHeader?: string
): Promise<DriveImage[]> {
  const requestOptions = resourceKeyHeader
    ? { headers: { "X-Goog-Drive-Resource-Keys": resourceKeyHeader } }
    : {};

  try {
    if (file.mimeType.startsWith("image/")) {
      const { data } = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { ...requestOptions, responseType: "arraybuffer" }
      );
      return [{ data: Buffer.from(data as ArrayBuffer), contentType: file.mimeType }];
    }

    const exportMimeType = OOXML_EXPORT_MIME_TYPES[file.mimeType];
    if (!exportMimeType) return [];

    const { data } = await drive.files.export(
      { fileId: file.id, mimeType: exportMimeType },
      { ...requestOptions, responseType: "arraybuffer" }
    );
    const zip = await JSZip.loadAsync(Buffer.from(data as ArrayBuffer));

    const images: DriveImage[] = [];
    for (const path of Object.keys(zip.files)) {
      if (images.length >= MAX_IMAGES_PER_FILE) break;
      const match = path.match(/^(?:word|ppt|xl)\/media\/[^/]+\.(\w+)$/i);
      const contentType = match ? IMAGE_EXTENSION_CONTENT_TYPES[match[1].toLowerCase()] : undefined;
      if (!contentType) continue;
      const buffer = await zip.files[path].async("nodebuffer");
      images.push({ data: buffer, contentType });
    }
    return images;
  } catch {
    return [];
  }
}
