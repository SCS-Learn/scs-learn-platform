import { createServiceClient } from "@/lib/supabase/service";
import type { DriveImage } from "@/lib/google/extract-drive-images";

const BUCKET = "lesson-media";

/**
 * Uploads one figure Claude chose to keep into the same bucket manual
 * attachment uploads use. Service role: signed-in users may only write under
 * "<lesson id>/..." (supabase/migrations/20261127150000_scope_lesson_media_storage.sql),
 * and every caller has already passed requireCourseInstructor.
 */
export async function uploadDriveImage(
  driveFileId: string,
  image: DriveImage
): Promise<{ url: string; storagePath: string } | null> {
  const supabase = createServiceClient();
  const extension = image.contentType.split("/")[1] ?? "png";
  const slug = image.sourcePath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "figure";
  const path = `drive-import/${driveFileId}/${slug}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, image.data, {
    contentType: image.contentType,
    upsert: true,
  });
  if (error) {
    console.error(`uploadDriveImage: Supabase Storage upload failed for ${path}:`, error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, storagePath: path };
}
