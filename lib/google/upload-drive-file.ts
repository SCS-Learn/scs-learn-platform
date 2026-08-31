import { createClient } from "@/lib/supabase/server";

const BUCKET = "lesson-media";

/**
 * Server-side sibling of upload-drive-image.ts for a whole file's raw bytes
 * (a PDF, say) rather than an extracted figure - the organize pipeline copies
 * every whole asset into Supabase Storage at import time (durable even if the
 * instructor later un-shares the source Drive folder) instead of linking
 * Drive's own preview live.
 */
export async function uploadDriveFile(
  driveFileId: string,
  data: Buffer,
  contentType: string,
  filename: string
): Promise<{ url: string; storagePath: string } | null> {
  const supabase = await createClient();
  const slug = filename.replace(/[^a-zA-Z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "file";
  const path = `drive-import/${driveFileId}/${slug}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, data, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.error(`uploadDriveFile: Supabase Storage upload failed for ${path}:`, error.message);
    return null;
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: publicUrlData.publicUrl, storagePath: path };
}
