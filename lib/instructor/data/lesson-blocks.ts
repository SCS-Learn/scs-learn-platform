"use server";

import { createClient } from "@/lib/supabase/server";

export type LessonBlockKind = "slide_file" | "video" | "question_group";
export type SlideFileRenderMode = "pdf_embed" | "slide_card_images" | "slide_rendered_images";

export type LessonBlockPatch =
  | {
      kind: "slide_file";
      position: number;
      title: string | null;
      sourceDriveFileId: string;
      renderMode: SlideFileRenderMode;
      bodyHtml: string | null;
      /** Ordered, durable PNG URLs - only set for renderMode "slide_rendered_images". */
      renderedImageUrls?: string[] | null;
    }
  | {
      kind: "video";
      position: number;
      title: string | null;
      sourceDriveFileId: string | null;
      videoUrl: string;
    }
  | {
      kind: "question_group";
      position: number;
      title: string | null;
      sourceDriveFileId: string | null;
      questionGroupId: string;
    };

export type LessonBlock = {
  id: string;
  lessonId: string;
  kind: LessonBlockKind;
  position: number;
  title: string | null;
  sourceDriveFileId: string | null;
  renderMode: SlideFileRenderMode | null;
  bodyHtml: string | null;
  renderedImageUrls: string[] | null;
  videoUrl: string | null;
  questionGroupId: string | null;
};

const BLOCK_COLUMNS =
  "id, lesson_id, kind, position, title, source_drive_file_id, render_mode, body_html, rendered_image_urls, video_url, question_group_id";

function toLessonBlock(row: {
  id: string;
  lesson_id: string;
  kind: LessonBlockKind;
  position: number;
  title: string | null;
  source_drive_file_id: string | null;
  render_mode: SlideFileRenderMode | null;
  body_html: string | null;
  rendered_image_urls: string[] | null;
  video_url: string | null;
  question_group_id: string | null;
}): LessonBlock {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    kind: row.kind,
    position: row.position,
    title: row.title,
    sourceDriveFileId: row.source_drive_file_id,
    renderMode: row.render_mode,
    bodyHtml: row.body_html,
    renderedImageUrls: row.rendered_image_urls,
    videoUrl: row.video_url,
    questionGroupId: row.question_group_id,
  };
}

export async function addLessonBlock(lessonId: string, patch: LessonBlockPatch): Promise<LessonBlock> {
  const supabase = await createClient();

  const insert = {
    lesson_id: lessonId,
    position: patch.position,
    kind: patch.kind,
    title: patch.title,
    source_drive_file_id: patch.sourceDriveFileId,
    render_mode: patch.kind === "slide_file" ? patch.renderMode : null,
    body_html: patch.kind === "slide_file" ? patch.bodyHtml : null,
    rendered_image_urls: patch.kind === "slide_file" ? patch.renderedImageUrls ?? null : null,
    video_url: patch.kind === "video" ? patch.videoUrl : null,
    question_group_id: patch.kind === "question_group" ? patch.questionGroupId : null,
  };

  const { data, error } = await supabase.from("lesson_blocks").insert(insert).select(BLOCK_COLUMNS).single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create lesson block");

  return toLessonBlock(data);
}

export async function getLessonBlocks(lessonId: string): Promise<LessonBlock[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_blocks")
    .select(BLOCK_COLUMNS)
    .eq("lesson_id", lessonId)
    .order("position");
  if (error) throw new Error(error.message);

  return (data ?? []).map(toLessonBlock);
}
