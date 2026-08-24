"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Unit, LessonItem, LessonType } from "@/lib/instructor/mock-data";

function nextUnitNumber(existingCodes: string[]): number {
  const numbers = existingCodes.map((code) => Number(code.match(/(\d+)/)?.[1] ?? 0));
  return (numbers.length ? Math.max(...numbers) : 0) + 1;
}

export async function addUnit(courseCode: string, title: string): Promise<Unit> {
  const supabase = await createClient();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("code", courseCode)
    .single();
  if (courseError || !course) throw new Error("Unknown course code");

  const { data: existingUnits, error: unitsError } = await supabase
    .from("units")
    .select("code")
    .eq("course_id", course.id);
  if (unitsError) throw new Error(unitsError.message);

  const unitNumber = nextUnitNumber((existingUnits ?? []).map((u) => u.code));

  const { data: newUnit, error } = await supabase
    .from("units")
    .insert({
      course_id: course.id,
      code: `Unit ${unitNumber}`,
      title,
      position: (existingUnits ?? []).length + 1,
    })
    .select("id, code, title")
    .single();
  if (error || !newUnit) throw new Error(error?.message ?? "Failed to create unit");

  revalidatePath(`/instructor/${courseCode}`);
  return { id: newUnit.id, code: newUnit.code, title: newUnit.title, lessons: [] };
}

export async function addUnitFromImport(
  courseCode: string,
  title: string,
  sourceDriveFolderId: string
): Promise<Unit> {
  const supabase = await createClient();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("code", courseCode)
    .single();
  if (courseError || !course) throw new Error("Unknown course code");

  const { data: existingUnits, error: unitsError } = await supabase
    .from("units")
    .select("code")
    .eq("course_id", course.id);
  if (unitsError) throw new Error(unitsError.message);

  const unitNumber = nextUnitNumber((existingUnits ?? []).map((u) => u.code));

  const { data: newUnit, error } = await supabase
    .from("units")
    .insert({
      course_id: course.id,
      code: `Unit ${unitNumber}`,
      title,
      position: (existingUnits ?? []).length + 1,
      source_drive_folder_id: sourceDriveFolderId,
    })
    .select("id, code, title")
    .single();
  if (error || !newUnit) throw new Error(error?.message ?? "Failed to create unit");

  return { id: newUnit.id, code: newUnit.code, title: newUnit.title, lessons: [] };
}

export async function deleteUnit(courseCode: string, unitId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("units").delete().eq("id", unitId);
  if (error) throw new Error(error.message);

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath("/instructor");
}

export async function reorderUnits(courseCode: string, orderedUnitIds: string[]) {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedUnitIds.map((id, index) =>
      supabase.from("units").update({ position: index + 1 }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  revalidatePath(`/instructor/${courseCode}`);
}

export async function addLesson(courseCode: string, unitId: string): Promise<LessonItem> {
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("code")
    .eq("id", unitId)
    .single();
  if (unitError || !unit) throw new Error("Unknown unit");

  const { data: existingLessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id")
    .eq("unit_id", unitId);
  if (lessonsError) throw new Error(lessonsError.message);

  const unitNumber = unit.code.match(/(\d+)/)?.[1] ?? "0";
  const position = (existingLessons ?? []).length + 1;
  const code = `${unitNumber}.${position}`;

  const { data: newLesson, error } = await supabase
    .from("lessons")
    .insert({
      unit_id: unitId,
      code,
      title: "Untitled lesson",
      type: "lesson",
      position,
    })
    .select("id, code, title, type, content_html, is_published, updated_at")
    .single();
  if (error || !newLesson) throw new Error(error?.message ?? "Failed to create lesson");

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath("/instructor");
  return {
    id: newLesson.id,
    code: newLesson.code,
    title: newLesson.title,
    type: newLesson.type as LessonType,
    contentHtml: newLesson.content_html,
    isPublished: newLesson.is_published,
    attachments: [],
    updatedAt: newLesson.updated_at,
  };
}

export async function addLessonFromImport(
  unitId: string,
  patch: {
    title: string;
    type: LessonType;
    position: number;
    sourceDriveFileId: string;
    contentHtml?: string;
  }
): Promise<LessonItem> {
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("code")
    .eq("id", unitId)
    .single();
  if (unitError || !unit) throw new Error("Unknown unit");

  const unitNumber = unit.code.match(/(\d+)/)?.[1] ?? "0";
  const code = `${unitNumber}.${patch.position}`;

  const { data: newLesson, error } = await supabase
    .from("lessons")
    .insert({
      unit_id: unitId,
      code,
      title: patch.title,
      type: patch.type,
      position: patch.position,
      source_drive_file_id: patch.sourceDriveFileId,
      ...(patch.contentHtml ? { content_html: patch.contentHtml } : {}),
    })
    .select("id, code, title, type, content_html, is_published, updated_at")
    .single();
  if (error || !newLesson) throw new Error(error?.message ?? "Failed to create lesson");

  return {
    id: newLesson.id,
    code: newLesson.code,
    title: newLesson.title,
    type: newLesson.type as LessonType,
    contentHtml: newLesson.content_html,
    isPublished: newLesson.is_published,
    attachments: [],
    updatedAt: newLesson.updated_at,
  };
}

export async function deleteLesson(courseCode: string, lessonId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
  if (error) throw new Error(error.message);

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath("/instructor");
}

export async function reorderLessons(
  courseCode: string,
  unitId: string,
  orderedLessonIds: string[]
) {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedLessonIds.map((id, index) =>
      supabase.from("lessons").update({ position: index + 1 }).eq("id", id).eq("unit_id", unitId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  revalidatePath(`/instructor/${courseCode}`);
}

export async function updateLessonContent(
  lessonId: string,
  patch: { title: string; contentHtml: string }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({
      title: patch.title,
      content_html: patch.contentHtml,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lessonId);
  if (error) throw new Error(error.message);
  // Deliberately no revalidatePath here — this fires on every debounced
  // keystroke and only the currently-open editor (which already has the
  // edit in its own local state) needs to reflect it.
}

export async function publishLesson(courseCode: string, lessonId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({ is_published: true, updated_at: new Date().toISOString() })
    .eq("id", lessonId);
  if (error) throw new Error(error.message);

  revalidatePath(`/instructor/${courseCode}`);
}
