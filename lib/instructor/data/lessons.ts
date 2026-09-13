"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Unit, LessonItem, LessonType } from "@/lib/instructor/mock-data";
import { DEFAULT_QUIZ_COMPLETION_THRESHOLD } from "@/lib/quiz/types";

export type { LessonType };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function nextUnitNumber(existingCodes: string[]): number {
  const numbers = existingCodes.map((code) => Number(code.match(/(\d+)/)?.[1] ?? 0));
  return (numbers.length ? Math.max(...numbers) : 0) + 1;
}

function unitNumberFromCode(code: string): string {
  return code.match(/(\d+)/)?.[1] ?? "0";
}

/**
 * Closes gaps left by a deleted/moved unit and keeps every unit's "Unit N"
 * label matching its actual position - reassigns 1..N by current position
 * order, then cascades each unit's new number into its own lessons' "N.M"
 * codes (position within the unit doesn't change, only the unit prefix).
 */
async function renumberUnitsAndCascadeLessons(supabase: SupabaseClient, courseId: string): Promise<void> {
  const { data: unitRows, error } = await supabase
    .from("units")
    .select("id, lessons(id, position)")
    .eq("course_id", courseId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  const writes: PromiseLike<{ error: { message: string } | null }>[] = [];
  (unitRows ?? []).forEach((unit, index) => {
    const unitNumber = index + 1;
    writes.push(
      supabase.from("units").update({ position: unitNumber, code: `Unit ${unitNumber}` }).eq("id", unit.id)
    );
    for (const lesson of unit.lessons ?? []) {
      writes.push(
        supabase.from("lessons").update({ code: `${unitNumber}.${lesson.position}` }).eq("id", lesson.id)
      );
    }
  });

  const results = await Promise.all(writes);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

/** Closes gaps left by a deleted/moved lesson within one unit - reassigns 1..N by current position order and keeps each lesson's "N.M" code in sync. */
async function renumberLessonsInUnit(supabase: SupabaseClient, unitId: string): Promise<void> {
  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("code")
    .eq("id", unitId)
    .single();
  if (unitError || !unit) throw new Error(unitError?.message ?? "Unknown unit");
  const unitNumber = unitNumberFromCode(unit.code);

  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id")
    .eq("unit_id", unitId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  const results = await Promise.all(
    (lessons ?? []).map((l, index) =>
      supabase
        .from("lessons")
        .update({ position: index + 1, code: `${unitNumber}.${index + 1}` })
        .eq("id", l.id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

export async function addUnit(courseCode: string, title: string): Promise<Unit> {
  const supabase = await createClient();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("code", courseCode)
    .single();
  if (courseError || !course) throw new Error(courseError?.message ?? "Unknown course code");

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
  if (courseError || !course) throw new Error(courseError?.message ?? "Unknown course code");

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

export async function renameUnit(courseCode: string, unitId: string, title: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("units").update({ title }).eq("id", unitId);
  if (error) throw new Error(error.message);

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath(`/student/${courseCode}`);
}

export async function deleteUnit(courseCode: string, unitId: string) {
  const supabase = await createClient();
  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("course_id")
    .eq("id", unitId)
    .single();
  if (unitError || !unit) throw new Error(unitError?.message ?? "Unknown unit");

  const { error } = await supabase.from("units").delete().eq("id", unitId);
  if (error) throw new Error(error.message);

  await renumberUnitsAndCascadeLessons(supabase, unit.course_id);

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath("/instructor");
}

export async function reorderUnits(courseCode: string, orderedUnitIds: string[]) {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedUnitIds.map((id, index) =>
      supabase.from("units").update({ position: index + 1, code: `Unit ${index + 1}` }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id, unit_id, position")
    .in("unit_id", orderedUnitIds);
  if (lessonsError) throw new Error(lessonsError.message);

  const unitNumberById = new Map(orderedUnitIds.map((id, index) => [id, index + 1]));
  const lessonResults = await Promise.all(
    (lessons ?? []).map((l) =>
      supabase
        .from("lessons")
        .update({ code: `${unitNumberById.get(l.unit_id)}.${l.position}` })
        .eq("id", l.id)
    )
  );
  const failedLesson = lessonResults.find((r) => r.error);
  if (failedLesson?.error) throw new Error(failedLesson.error.message);

  revalidatePath(`/instructor/${courseCode}`);
}

export async function addLesson(courseCode: string, unitId: string): Promise<LessonItem> {
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("code")
    .eq("id", unitId)
    .single();
  if (unitError || !unit) throw new Error(unitError?.message ?? "Unknown unit");

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
    category: null,
    contentHtml: newLesson.content_html,
    contentSource: "html",
    blocks: [],
    isPublished: newLesson.is_published,
    quizCompletionThreshold: DEFAULT_QUIZ_COMPLETION_THRESHOLD,
    showReferenceAnswers: false,
    attachments: [],
    ltiLinkId: null,
    updatedAt: newLesson.updated_at,
  };
}

export async function addLessonFromImport(
  unitId: string,
  patch: {
    title: string;
    type: LessonType;
    position: number;
    sourceDriveFileId: string | null;
    contentHtml?: string;
    /** 'blocks' for organize-mode lessons (composed of lesson_blocks, no content_html); defaults to 'html' for the atomizer path. */
    contentSource?: "html" | "blocks";
    /** Set only for type "quiz" - which of the two graded-work labels this is (see quizLessonCategory). */
    category?: "assignment" | "homework" | null;
  }
): Promise<LessonItem> {
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("code")
    .eq("id", unitId)
    .single();
  if (unitError || !unit) throw new Error(unitError?.message ?? "Unknown unit");

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
      content_source: patch.contentSource ?? "html",
      category: patch.category ?? null,
      ...(patch.contentHtml ? { content_html: patch.contentHtml } : {}),
    })
    .select("id, code, title, type, content_html, is_published, updated_at, category")
    .single();
  if (error || !newLesson) throw new Error(error?.message ?? "Failed to create lesson");

  return {
    id: newLesson.id,
    code: newLesson.code,
    title: newLesson.title,
    type: newLesson.type as LessonType,
    category: (newLesson.category as "assignment" | "homework" | null) ?? null,
    contentHtml: newLesson.content_html,
    contentSource: patch.contentSource ?? "html",
    blocks: [],
    isPublished: newLesson.is_published,
    quizCompletionThreshold: DEFAULT_QUIZ_COMPLETION_THRESHOLD,
    showReferenceAnswers: false,
    attachments: [],
    ltiLinkId: null,
    updatedAt: newLesson.updated_at,
  };
}

export async function deleteLesson(courseCode: string, lessonId: string) {
  const supabase = await createClient();
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("unit_id")
    .eq("id", lessonId)
    .single();
  if (lessonError || !lesson) throw new Error(lessonError?.message ?? "Unknown lesson");

  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
  if (error) throw new Error(error.message);

  await renumberLessonsInUnit(supabase, lesson.unit_id);

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath("/instructor");
}

export async function reorderLessons(
  courseCode: string,
  unitId: string,
  orderedLessonIds: string[]
) {
  const supabase = await createClient();
  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("code")
    .eq("id", unitId)
    .single();
  if (unitError || !unit) throw new Error(unitError?.message ?? "Unknown unit");
  const unitNumber = unitNumberFromCode(unit.code);

  const results = await Promise.all(
    orderedLessonIds.map((id, index) =>
      supabase
        .from("lessons")
        .update({ position: index + 1, code: `${unitNumber}.${index + 1}` })
        .eq("id", id)
        .eq("unit_id", unitId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  revalidatePath(`/instructor/${courseCode}`);
}

/**
 * Moves a lesson into a different unit (drag-and-drop across units) - inserts
 * it right before `targetLessonId` in the destination unit's order, or at the
 * end when `targetLessonId` is null (dropped on the unit itself), then
 * renumbers both the destination unit (position + "N.M" code, including the
 * moved lesson) and the source unit (closing the gap it left behind).
 */
export async function moveLessonToUnit(
  courseCode: string,
  lessonId: string,
  fromUnitId: string,
  toUnitId: string,
  targetLessonId: string | null
) {
  if (fromUnitId === toUnitId) return;
  const supabase = await createClient();

  const { data: toUnit, error: toUnitError } = await supabase
    .from("units")
    .select("code")
    .eq("id", toUnitId)
    .single();
  if (toUnitError || !toUnit) throw new Error(toUnitError?.message ?? "Unknown destination unit");
  const toUnitNumber = unitNumberFromCode(toUnit.code);

  const { data: destLessons, error: destError } = await supabase
    .from("lessons")
    .select("id")
    .eq("unit_id", toUnitId)
    .order("position", { ascending: true });
  if (destError) throw new Error(destError.message);

  const destIds = (destLessons ?? []).map((l) => l.id);
  const insertIndex = targetLessonId ? destIds.indexOf(targetLessonId) : destIds.length;
  const newOrderIds = [...destIds];
  newOrderIds.splice(insertIndex === -1 ? destIds.length : insertIndex, 0, lessonId);

  const { error: moveError } = await supabase
    .from("lessons")
    .update({ unit_id: toUnitId })
    .eq("id", lessonId);
  if (moveError) throw new Error(moveError.message);

  const results = await Promise.all(
    newOrderIds.map((id, index) =>
      supabase
        .from("lessons")
        .update({ position: index + 1, code: `${toUnitNumber}.${index + 1}` })
        .eq("id", id)
        .eq("unit_id", toUnitId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  await renumberLessonsInUnit(supabase, fromUnitId);

  revalidatePath(`/instructor/${courseCode}`);
}

export async function updateQuizCompletionThreshold(
  courseCode: string,
  lessonId: string,
  threshold: number
) {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
    throw new Error("Completion threshold must be an integer from 0 to 100.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({
      quiz_completion_threshold: threshold,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lessonId);
  if (error) throw new Error(error.message);

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath(`/student/${courseCode}`);
}

/** Whether students see the free_response (AI-graded) reference answer after submitting this quiz - off by default. */
export async function updateShowReferenceAnswers(
  courseCode: string,
  lessonId: string,
  show: boolean
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({
      show_reference_answers: show,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lessonId);
  if (error) throw new Error(error.message);

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath(`/student/${courseCode}`);
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

export async function updateLessonType(
  courseCode: string,
  lessonId: string,
  type: LessonType
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({ type, updated_at: new Date().toISOString() })
    .eq("id", lessonId);
  if (error) throw new Error(error.message);

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath(`/student/${courseCode}`);
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

/** Publishes every not-yet-published lesson in the course in one go. */
export async function publishAllLessons(courseCode: string) {
  const supabase = await createClient();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("code", courseCode)
    .single();
  if (courseError || !course) throw new Error(courseError?.message ?? "Unknown course code");

  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id")
    .eq("course_id", course.id);
  if (unitsError) throw new Error(unitsError.message);

  const unitIds = (units ?? []).map((u) => u.id);
  if (unitIds.length === 0) return;

  const { error } = await supabase
    .from("lessons")
    .update({ is_published: true, updated_at: new Date().toISOString() })
    .in("unit_id", unitIds)
    .eq("is_published", false);
  if (error) throw new Error(error.message);

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath(`/student/${courseCode}`);
}
