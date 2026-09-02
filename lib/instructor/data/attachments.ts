"use server";

import { createClient } from "@/lib/supabase/server";
import type { Attachment } from "@/lib/instructor/mock-data";

const BUCKET = "lesson-media";

export async function addAttachment(
  lessonId: string,
  file: {
    name: string;
    url: string;
    storagePath: string | null;
    contentType: string;
    sizeBytes: number;
    lessonBlockId?: string | null;
  }
): Promise<Attachment> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attachments")
    .insert({
      lesson_id: lessonId,
      lesson_block_id: file.lessonBlockId ?? null,
      name: file.name,
      url: file.url,
      storage_path: file.storagePath,
      content_type: file.contentType,
      size_bytes: file.sizeBytes,
    })
    .select("id, name, url")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save attachment");

  return { id: data.id, name: data.name, url: data.url ?? "" };
}

export async function deleteAttachment(attachmentId: string) {
  const supabase = await createClient();

  const { data: attachment, error: fetchError } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error: deleteError } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (deleteError) throw new Error(deleteError.message);

  if (attachment?.storage_path) {
    await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
  }
}
