import { createClient } from "@/lib/supabase/client";

const BUCKET = "lesson-media";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadLessonFile(
  lessonId: string,
  file: File
): Promise<{ url: string; storagePath: string; contentType: string; sizeBytes: number }> {
  const supabase = createClient();
  const path = `${lessonId}/${Date.now()}-${sanitizeFilename(file.name)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return {
    url: data.publicUrl,
    storagePath: path,
    contentType: file.type,
    sizeBytes: file.size,
  };
}
