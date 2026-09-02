import type { drive_v3, slides_v1 } from "googleapis";
import { uploadDriveFile } from "@/lib/google/upload-drive-file";
import { withDriveRetry } from "@/lib/google/drive-retry";
import { mapWithConcurrencyLimit } from "@/lib/google/with-concurrency-limit";

const THUMBNAIL_CONCURRENCY = 4;

/**
 * Renders every slide in a Google Slides presentation using Google's own
 * Slides renderer (backgrounds, fonts, layout — exactly as in Slides).
 * Downloads each LARGE thumbnail and uploads it durably to Supabase Storage.
 */
export async function renderGoogleSlidesThumbnails(
  clients: { slides: slides_v1.Slides },
  presentationId: string,
  storageFileId: string,
  title: string
): Promise<string[] | null> {
  try {
    const { data: presentation } = await withDriveRetry(`get presentation ${presentationId}`, () =>
      clients.slides.presentations.get({
        presentationId,
        fields: "slides.objectId",
      })
    );

    const pageIds = (presentation.slides ?? [])
      .map((slide) => slide.objectId)
      .filter((id): id is string => Boolean(id));

    if (pageIds.length === 0) return null;

    const slug = title.replace(/[^a-zA-Z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "slides";

    const urls = await mapWithConcurrencyLimit(
      pageIds.map((pageObjectId, index) => ({ pageObjectId, index })),
      THUMBNAIL_CONCURRENCY,
      async ({ pageObjectId, index }) => {
      const { data: thumbnail } = await withDriveRetry(
        `thumbnail ${presentationId}/${pageObjectId}`,
        () =>
          clients.slides.presentations.pages.getThumbnail({
            presentationId,
            pageObjectId,
            "thumbnailProperties.thumbnailSize": "LARGE",
            "thumbnailProperties.mimeType": "PNG",
          })
      );

      const contentUrl = thumbnail.contentUrl;
      if (!contentUrl) return null;

      const response = await fetch(contentUrl);
      if (!response.ok) return null;

      const uploaded = await uploadDriveFile(
        storageFileId,
        Buffer.from(await response.arrayBuffer()),
        "image/png",
        `${slug}-slide-${String(index + 1).padStart(3, "0")}.png`
      );
      return uploaded?.url ?? null;
    }
    );

    const durableUrls = urls.filter((url): url is string => Boolean(url));
    return durableUrls.length > 0 ? durableUrls : null;
  } catch (error) {
    console.warn(`renderGoogleSlidesThumbnails failed for ${presentationId}:`, error);
    return null;
  }
}
