import type JSZip from "jszip";
import type { drive_v3 } from "googleapis";
import { loadOoxmlZip } from "@/lib/google/load-ooxml-zip";

// Only formats Claude's vision input actually accepts. A real deck can also
// carry media as EMF/WMF (vector metafiles) or TIFF/WDP - those are real
// embedded pictures too, but need format conversion before they're usable
// here, which this doesn't do (yet).
const IMAGE_EXTENSION_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
};

const MAX_IMAGES_PER_FILE = 12;

// sourcePath is a stable identity for the image - the zip path it came from,
// or a synthetic one for a directly-downloaded single image file. Once atom
// extraction runs in independent per-batch calls, a bare array index is no
// longer unique across batches for the same file (two different batches can
// each have an "image 3"), so uploads/lookups key off this instead.
export type DriveImage = { data: Buffer; contentType: string; sourcePath: string };

function contentTypeForPath(path: string): string | undefined {
  const match = path.match(/\.(\w+)$/i);
  return match ? IMAGE_EXTENSION_CONTENT_TYPES[match[1].toLowerCase()] : undefined;
}

/** Pulls embedded pictures out of an already-loaded OOXML zip (word|ppt|xl/media/*) - shared by callers that already have the zip open, so they don't fetch the file twice. */
export async function extractImagesFromZip(zip: JSZip): Promise<DriveImage[]> {
  const images: DriveImage[] = [];
  for (const path of Object.keys(zip.files)) {
    if (images.length >= MAX_IMAGES_PER_FILE) break;
    if (!/^(?:word|ppt|xl)\/media\//i.test(path)) continue;
    const contentType = contentTypeForPath(path);
    if (!contentType) continue;
    const buffer = await zip.files[path].async("nodebuffer");
    images.push({ data: buffer, contentType, sourcePath: path });
  }
  return images;
}

/**
 * Pulls only the specific media paths given (e.g. the images a particular
 * slide's own relationships file actually references), instead of an
 * arbitrary whole-file scan - so a large deck's images get attributed to the
 * slide/batch they're actually on rather than won by whichever happens to
 * sort first in the zip.
 */
export async function extractImagesFromZipByPaths(
  zip: JSZip,
  paths: Iterable<string>,
  maxCount: number
): Promise<DriveImage[]> {
  const images: DriveImage[] = [];
  for (const path of paths) {
    if (images.length >= maxCount) break;
    const file = zip.files[path];
    if (!file) continue;
    const contentType = contentTypeForPath(path);
    if (!contentType) continue;
    const buffer = await file.async("nodebuffer");
    images.push({ data: buffer, contentType, sourcePath: path });
  }
  return images;
}

/**
 * Best-effort: the actual embedded photos/charts/diagrams in a Drive file,
 * pulled from its OOXML zip - either Drive-exported (Docs/Slides/Sheets) or
 * downloaded as-is (an already .docx/.pptx/.xlsx file) - since embedded media
 * lives as plain image files under word|ppt|xl/media in both cases. That's
 * the only way to get real raster assets out, since the PDF export flattens
 * everything to one flat page image and the Drive API has no per-image
 * extraction of its own. Only catches images inserted as pictures, not
 * natively-drawn vector shapes/charts. Native image uploads are returned
 * as-is; anything else (plain PDFs, unknown types, or a failed request)
 * yields no images - the caller falls back to text-only content for those.
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
        { fileId: file.id, alt: "media", supportsAllDrives: true },
        { ...requestOptions, responseType: "arraybuffer" }
      );
      return [{ data: Buffer.from(data as ArrayBuffer), contentType: file.mimeType, sourcePath: `direct:${file.id}` }];
    }

    const zip = await loadOoxmlZip(drive, file, resourceKeyHeader);
    if (!zip) return [];
    return await extractImagesFromZip(zip);
  } catch {
    return [];
  }
}
