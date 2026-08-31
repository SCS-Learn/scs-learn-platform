import type { drive_v3, slides_v1 } from "googleapis";
import { uploadDriveFile } from "@/lib/google/upload-drive-file";

const CONVERTED_MIME_TYPE = "application/vnd.google-apps.presentation";
const SOURCE_PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * True, fully-scrollable rendering for a real (already-OOXML) .pptx, which
 * the Drive API can't export to PDF directly itself. Uploads the file's own
 * raw bytes with a Google Slides target mimeType - that's what triggers
 * Drive's own conversion into a real, editable Slides file - and a REAL
 * Google Slides file (unlike the original raw .pptx) can be exported to PDF,
 * so the temp conversion's PDF export is durably uploaded and embedded via
 * the exact same scrollable PDF viewer already used for native PDF lectures,
 * rather than a sequence of static per-slide thumbnail images. The temporary
 * Slides copy is always deleted afterward, success or failure, so nothing
 * lingers in the instructor's Drive. Returns null (never throws) on any
 * failure, so the caller falls back to the text+image card fallback.
 */
export async function convertAndRenderPptxSlides(
  clients: { drive: drive_v3.Drive; slides: slides_v1.Slides },
  fileId: string,
  resourceKeyHeader: string | undefined,
  title: string
): Promise<string | null> {
  const requestOptions = resourceKeyHeader
    ? { headers: { "X-Goog-Drive-Resource-Keys": resourceKeyHeader } }
    : {};

  let tempPresentationId: string | null = null;
  try {
    const { data: rawBytes } = await clients.drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { ...requestOptions, responseType: "arraybuffer" }
    );

    const created = await clients.drive.files.create({
      requestBody: { name: `__render_tmp__${title}`, mimeType: CONVERTED_MIME_TYPE },
      media: { mimeType: SOURCE_PPTX_MIME_TYPE, body: Buffer.from(rawBytes as ArrayBuffer) },
      fields: "id",
      supportsAllDrives: true,
    });
    tempPresentationId = created.data.id ?? null;
    if (!tempPresentationId) return null;

    const { data: pdfBytes } = await clients.drive.files.export(
      { fileId: tempPresentationId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );

    const uploaded = await uploadDriveFile(
      fileId,
      Buffer.from(pdfBytes as ArrayBuffer),
      "application/pdf",
      `${title}.pdf`
    );
    return uploaded?.url ?? null;
  } catch {
    return null;
  } finally {
    if (tempPresentationId) {
      await clients.drive.files.delete({ fileId: tempPresentationId, supportsAllDrives: true }).catch(() => {
        // Best-effort cleanup - an orphaned temp file in the instructor's
        // Drive is a minor annoyance, not worth failing the import over.
      });
    }
  }
}
