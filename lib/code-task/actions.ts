"use server";

import { revalidatePath } from "next/cache";
import { requireCourseInstructor } from "@/lib/instructor/data/current-instructor";
import { createClient } from "@/lib/supabase/server";
import { parseGradescopeAutograderZip } from "@/lib/code-task/parse-gradescope";
import type { CodeTask, ParsedAutograder } from "@/lib/code-task/types";

// Instructor actions for IDE tasks. Like every instructor server action, each
// one checks course staff itself - server actions are public endpoints.

const MAX_ZIP_BYTES = 900 * 1024; // under Next's 1 MB server-action body limit
const MAX_CODE_CHARS = 50_000;
const MAX_PROMPT_CHARS = 50_000;
const MIGRATION_HINT =
  "IDE tasks need the database migration supabase/migrations/add-code-task-block.sql. Run it in the Supabase SQL editor, then try again.";

const DEFAULT_TASK: CodeTask = {
  language: "python",
  entryFile: "solution.py",
  starterCode: "def solve():\n    # TODO: your code here\n    pass\n",
  promptHtml: "<p>Describe the task here, then upload a Gradescope autograder zip.</p>",
  autograder: null,
};

function friendlyDbError(message: string): string {
  return /code_task|lesson_blocks_kind/.test(message) ? MIGRATION_HINT : message;
}

/** Checks the lesson belongs to the course; returns its id. */
async function lessonInCourse(courseCode: string, lessonId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("id, units!inner(courses!inner(code))")
    .eq("id", lessonId)
    .eq("units.courses.code", courseCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That lesson is not in this course.");
}

/** Loads a code_task block, checking it belongs to the course. */
async function loadCodeTaskBlock(courseCode: string, blockId: string): Promise<{ lessonId: string; task: CodeTask }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_blocks")
    .select("id, kind, lesson_id, code_task, lessons!inner(units!inner(courses!inner(code)))")
    .eq("id", blockId)
    .eq("lessons.units.courses.code", courseCode)
    .maybeSingle();
  if (error) throw new Error(friendlyDbError(error.message));
  if (!data || data.kind !== "code_task") throw new Error("That IDE task is not in this course.");
  return { lessonId: data.lesson_id as string, task: { ...DEFAULT_TASK, ...(data.code_task as CodeTask) } };
}

async function saveTask(blockId: string, task: CodeTask, title?: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_blocks")
    .update({ code_task: task, ...(title !== undefined ? { title } : {}) })
    .eq("id", blockId);
  if (error) throw new Error(friendlyDbError(error.message));
}

/** Turns a lesson into an IDE task lesson: block-based content with one code_task block. */
export async function addCodeTaskToLesson(courseCode: string, lessonId: string): Promise<{ blockId: string }> {
  await requireCourseInstructor(courseCode);
  await lessonInCourse(courseCode, lessonId);
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("lesson_blocks")
    .select("id, kind, position")
    .eq("lesson_id", lessonId);
  if (existingError) throw new Error(existingError.message);
  const already = (existing ?? []).find((b) => b.kind === "code_task");
  if (already) return { blockId: already.id as string };

  const position = Math.max(0, ...(existing ?? []).map((b) => b.position as number)) + 1;
  const { data: block, error } = await supabase
    .from("lesson_blocks")
    .insert({ lesson_id: lessonId, kind: "code_task", position, title: null, code_task: DEFAULT_TASK })
    .select("id")
    .single();
  if (error || !block) throw new Error(friendlyDbError(error?.message ?? "Could not add the IDE task."));

  const { error: lessonError } = await supabase
    .from("lessons")
    .update({ content_source: "blocks", type: "lesson" })
    .eq("id", lessonId);
  if (lessonError) throw new Error(lessonError.message);

  revalidatePath(`/instructor/${courseCode}`, "layout");
  return { blockId: block.id as string };
}

export async function updateCodeTask(
  courseCode: string,
  blockId: string,
  patch: { promptHtml?: string; starterCode?: string; entryFile?: string }
): Promise<CodeTask> {
  await requireCourseInstructor(courseCode);
  const { task } = await loadCodeTaskBlock(courseCode, blockId);
  const next: CodeTask = { ...task };

  if (typeof patch.promptHtml === "string") next.promptHtml = patch.promptHtml.slice(0, MAX_PROMPT_CHARS);
  if (typeof patch.starterCode === "string") next.starterCode = patch.starterCode.slice(0, MAX_CODE_CHARS);
  if (typeof patch.entryFile === "string") {
    const entryFile = patch.entryFile.trim();
    if (!/^[\w.-]+\.(py|java)$/.test(entryFile)) {
      throw new Error("The file name must look like solution.py (letters, numbers, dots, dashes, underscores).");
    }
    next.entryFile = entryFile;
  }

  await saveTask(blockId, next);
  revalidatePath(`/instructor/${courseCode}`, "layout");
  revalidatePath(`/student/${courseCode}`, "layout");
  return next;
}

/** Parses an uploaded Gradescope autograder zip and stores the result on the task. */
export async function uploadCodeTaskAutograder(
  courseCode: string,
  blockId: string,
  formData: FormData
): Promise<CodeTask> {
  await requireCourseInstructor(courseCode);
  const { task } = await loadCodeTaskBlock(courseCode, blockId);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Choose a .zip file to upload.");
  if (file.size > MAX_ZIP_BYTES) throw new Error("That zip is over 900 KB. Leave large data files out of the autograder.");

  let autograder: ParsedAutograder;
  try {
    autograder = await parseGradescopeAutograderZip(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    throw new Error(error instanceof Error ? `Could not read that zip: ${error.message}` : "Could not read that zip.");
  }

  const next: CodeTask = {
    ...task,
    autograder,
    language: autograder.language ?? task.language,
    // Students should save under the name run_autograder copies, e.g. pattern_count.py.
    entryFile: autograder.submissionFiles[0] ?? task.entryFile,
  };
  await saveTask(blockId, next);
  revalidatePath(`/instructor/${courseCode}`, "layout");
  revalidatePath(`/student/${courseCode}`, "layout");
  return next;
}
