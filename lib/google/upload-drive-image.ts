import { createClient } from "@/lib/supabase/server";
import type { DriveImage } from "@/lib/google/extract-drive-images";

const BUCKET = "lesson-media";

/** Uploads one figure Claude chose to keep into the same bucket manual attachment uploads use. */
export async function uploadDriveImage(
  driveFileId: string,
  imageIndex: number,
  image: DriveImage
): Promise<{ url: string; storagePath: string } | null> {
  const supabase = await createClient();
  const extension = image.contentType.split("/")[1] ?? "png";
  const path = `drive-import/${driveFileId}/figure-${imageIndex}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, image.data, {
    contentType: image.contentType,
    upsert: true,
  });
  if (error) return null;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, storagePath: path };
}
