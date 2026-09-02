import type { drive_v3, slides_v1 } from "googleapis";
import { uploadDriveFile } from "@/lib/google/upload-drive-file";
import { withDriveRetry } from "@/lib/google/drive-retry";

const CONVERTED_MIME_TYPE = "application/vnd.google-apps.presentation";
const SOURCE_PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * Uploads a native .pptx to Drive as a temporary Google Slides file (Drive's
 * own conversion). Returns the new presentation id, or null on failure.
 * Caller is responsible for deleting the temp file when done.
 */
export async function convertPptxToGoogleSlides(
  drive: drive_v3.Drive,
  fileId: string,
  resourceKeyHeader: string | undefined,
  title: string
): Promise<string | null> {
  const requestOptions = resourceKeyHeader
    ? { headers: { "X-Goog-Drive-Resource-Keys": resourceKeyHeader } }
    : {};

  try {
    const { data: rawBytes } = await withDriveRetry(`get pptx source ${fileId}`, () =>
      drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { ...requestOptions, responseType: "arraybuffer" }
      )
    );

    const created = await withDriveRetry(`create temp slides for ${fileId}`, () =>
      drive.files.create({
        requestBody: { name: `__render_tmp__${title}`, mimeType: CONVERTED_MIME_TYPE },
        media: { mimeType: SOURCE_PPTX_MIME_TYPE, body: Buffer.from(rawBytes as ArrayBuffer) },
        fields: "id",
        supportsAllDrives: true,
      })
    );

    return created.data.id ?? null;
  } catch (error) {
    console.warn(`convertPptxToGoogleSlides failed for ${fileId}:`, error);
    return null;
  }
}

export async function deleteTempPresentation(
  drive: drive_v3.Drive,
  presentationId: string
): Promise<void> {
  await drive.files.delete({ fileId: presentationId, supportsAllDrives: true }).catch(() => {
    // Best-effort cleanup - an orphaned temp file is a minor annoyance.
  });
}

export async function exportPresentationAsPdf(
  drive: drive_v3.Drive,
  presentationId: string,
  storageFileId: string,
  title: string
): Promise<string | null> {
  try {
    const { data: pdfBytes } = await withDriveRetry(`export temp slides ${presentationId}`, () =>
      drive.files.export(
        { fileId: presentationId, mimeType: "application/pdf" },
        { responseType: "arraybuffer" }
      )
    );

    const uploaded = await uploadDriveFile(
      storageFileId,
      Buffer.from(pdfBytes as ArrayBuffer),
      "application/pdf",
      `${title}.pdf`
    );
    return uploaded?.url ?? null;
  } catch (error) {
    console.warn(`exportPresentationAsPdf failed for ${presentationId}:`, error);
    return null;
  }
}

/**
 * Legacy PDF-export path for PPTX when thumbnail rendering isn't available.
 * Prefer renderGoogleSlidesThumbnails after convertPptxToGoogleSlides instead.
 */
export async function convertAndRenderPptxSlides(
  clients: { drive: drive_v3.Drive; slides: slides_v1.Slides },
  fileId: string,
  resourceKeyHeader: string | undefined,
  title: string
): Promise<string | null> {
  const tempPresentationId = await convertPptxToGoogleSlides(
    clients.drive,
    fileId,
    resourceKeyHeader,
    title
  );
  if (!tempPresentationId) return null;

  try {
    return await exportPresentationAsPdf(clients.drive, tempPresentationId, fileId, title);
  } finally {
    await deleteTempPresentation(clients.drive, tempPresentationId);
  }
}
