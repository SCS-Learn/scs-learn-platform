"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_INSTRUCTOR_ID } from "@/lib/instructor/data/current-instructor";
import type {
  InstructorCourse,
  Unit,
  LessonItem,
  LessonType,
  LessonContentSource,
  LessonBlockView,
  QuestionView,
  Attachment,
} from "@/lib/instructor/mock-data";

type AttachmentRow = {
  id: string;
  name: string;
  url: string | null;
  lesson_block_id: string | null;
  storage_path: string | null;
};

type QuestionRow = {
  id: string;
  position: number;
  prompt_text: string;
  choices: string[] | null;
  answer_key: string | null;
  question_type: string;
  needs_review: boolean;
};

type LessonBlockRow = {
  id: string;
  kind: "slide_file" | "video" | "question_group" | "course_notes";
  position: number;
  title: string | null;
  render_mode: "pdf_embed" | "slide_card_images" | "slide_rendered_images" | null;
  body_html: string | null;
  rendered_image_urls: string[] | null;
  video_url: string | null;
  question_groups: { questions: QuestionRow[] } | null;
};

type LessonRow = {
  id: string;
  code: string;
  title: string;
  type: string;
  position: number;
  content_html: string;
  content_source: string;
  is_published: boolean;
  updated_at: string;
  attachments: AttachmentRow[];
  lesson_blocks: LessonBlockRow[];
};

type UnitRow = {
  id: string;
  code: string;
  title: string;
  position: number;
  lessons: LessonRow[];
};

type CourseRow = {
  code: string;
  title: string;
  department: string;
  track: string;
  student_count: number;
  units: UnitRow[];
};

function toAttachment(row: AttachmentRow): Attachment {
  return { id: row.id, name: row.name, url: row.url ?? "" };
}

function toQuestionView(row: QuestionRow): QuestionView {
  return {
    id: row.id,
    promptText: row.prompt_text,
    choices: row.choices,
    answerKey: row.answer_key,
    questionType: row.question_type,
    needsReview: row.needs_review,
  };
}

function isHostedPdfAttachment(attachment: AttachmentRow): boolean {
  if (!attachment.url || !attachment.storage_path) return false;
  if (attachment.url.includes("drive.google.com") || attachment.url.includes("docs.google.com")) {
    return false;
  }
  return attachment.name.toLowerCase().endsWith(".pdf");
}

function pdfUrlForBlock(block: LessonBlockRow, attachments: AttachmentRow[]): string | null {
  const linked = attachments.find((a) => a.lesson_block_id === block.id && isHostedPdfAttachment(a));
  if (linked?.url) return linked.url;

  if (block.render_mode !== "pdf_embed") return null;

  // Only use copies uploaded to Supabase Storage — never embed a Drive webViewLink.
  const lessonPdf = attachments.find((a) => !a.lesson_block_id && isHostedPdfAttachment(a));
  return lessonPdf?.url ?? null;
}

function toLessonItem(row: LessonRow): LessonItem {
  // A lesson_blocks-linked attachment (the durable copy of a slide file/image
  // uploaded at import time) renders inline inside its block instead of the
  // generic attachment list - only an attachment with no lesson_block_id
  // (e.g. the original Drive link) belongs in the sidebar's list.
  const visibleAttachments = row.attachments.filter((a) => !a.lesson_block_id).map(toAttachment);

  const blocks: LessonBlockView[] = [...row.lesson_blocks]
    .sort((a, b) => a.position - b.position)
    .map((block) => ({
      id: block.id,
      kind: block.kind,
      title: block.title,
      renderMode: block.render_mode,
      bodyHtml: block.body_html,
      renderedImageUrls: block.rendered_image_urls,
      pdfUrl: pdfUrlForBlock(block, row.attachments),
      videoUrl: block.video_url,
      questions: block.question_groups
        ? [...block.question_groups.questions].sort((a, b) => a.position - b.position).map(toQuestionView)
        : null,
    }));

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type: row.type as LessonType,
    contentHtml: row.content_html,
    contentSource: row.content_source as LessonContentSource,
    blocks,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
    attachments: visibleAttachments,
  };
}

function toUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    lessons: [...row.lessons].sort((a, b) => a.position - b.position).map(toLessonItem),
  };
}

function toInstructorCourse(row: CourseRow): InstructorCourse {
  return {
    code: row.code,
    title: row.title,
    department: row.department,
    track: row.track,
    studentCount: row.student_count,
    units: [...row.units].sort((a, b) => a.position - b.position).map(toUnit),
  };
}

const COURSE_WITH_CONTENT_SELECT =
  "code, title, department, track, student_count, units(id, code, title, position, lessons(id, code, title, type, position, content_html, content_source, is_published, updated_at, attachments(id, name, url, storage_path, lesson_block_id), lesson_blocks(id, kind, position, title, render_mode, body_html, rendered_image_urls, video_url, question_groups(questions(id, position, prompt_text, choices, answer_key, question_type, needs_review)))))";

export async function getInstructorCourseList(): Promise<InstructorCourse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_WITH_CONTENT_SELECT)
    .eq("instructor_id", CURRENT_INSTRUCTOR_ID)
    .order("code");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => toInstructorCourse(row as unknown as CourseRow));
}

export async function getCourseWithContent(courseCode: string): Promise<InstructorCourse | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_WITH_CONTENT_SELECT)
    .eq("code", courseCode)
    .eq("instructor_id", CURRENT_INSTRUCTOR_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return toInstructorCourse(data as unknown as CourseRow);
}

export type CreateCourseInput = {
  code: string;
  title: string;
};

export async function createCourse(input: CreateCourseInput): Promise<{ code: string }> {
  const code = input.code.trim();
  const title = input.title.trim();

  if (!code || !title) {
    throw new Error("All fields are required.");
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (existing) throw new Error("A course with this code already exists.");

  const { error } = await supabase.from("courses").insert({
    code,
    title,
    department: "",
    track: "",
    instructor_id: CURRENT_INSTRUCTOR_ID,
    student_count: 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/instructor");
  return { code };
}

export async function deleteCourse(courseCode: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("code", courseCode)
    .eq("instructor_id", CURRENT_INSTRUCTOR_ID);
  if (error) throw new Error(error.message);

  revalidatePath("/instructor");
}
