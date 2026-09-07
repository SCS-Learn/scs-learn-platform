"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLaunchingUser } from "@/lib/lti/config";

export async function fetchLessonCompletionsForLessons(
  lessonIds: string[],
  platformUserId: string
): Promise<Map<string, string>> {
  if (lessonIds.length === 0) return new Map();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lesson_completions")
      .select("lesson_id, completed_at")
      .eq("platform_user_id", platformUserId)
      .in("lesson_id", lessonIds);
    if (error) throw new Error(error.message);

    return new Map(
      (data ?? []).map((row) => [row.lesson_id as string, row.completed_at as string] as const)
    );
  } catch (error) {
    console.warn(
      "Skipping lesson completions (supabase/migrations/add-lesson-completions.sql likely not run yet):",
      error
    );
    return new Map();
  }
}

async function assertQuizMayBeCompleted(lessonId: string, platformUserId: string) {
  const supabase = await createClient();

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("type, quiz_completion_threshold, lesson_blocks(question_groups(questions(id)))")
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonError) throw new Error(lessonError.message);
  if (!lesson) throw new Error("Lesson not found");

  const threshold = (lesson.quiz_completion_threshold as number | null) ?? 100;

  const blocks = (lesson.lesson_blocks ?? []) as unknown as {
    question_groups: { questions: { id: string }[] } | { questions: { id: string }[] }[] | null;
  }[];
  const hasQuestions = blocks.some((block) => {
    const groups = block.question_groups;
    if (!groups) return false;
    const list = Array.isArray(groups) ? groups : [groups];
    return list.some((group) => (group.questions?.length ?? 0) > 0);
  });
  if (!hasQuestions) return;

  const { data: submission, error: submissionError } = await supabase
    .from("quiz_submissions")
    .select("score_percent")
    .eq("lesson_id", lessonId)
    .eq("platform_user_id", platformUserId)
    .maybeSingle();
  if (submissionError) throw new Error(submissionError.message);

  if (!submission || (submission.score_percent as number) < threshold) {
    throw new Error(
      `Quiz lessons can only be marked complete after scoring at least ${threshold}%.`
    );
  }
}

export async function markLessonComplete(courseCode: string, lessonId: string): Promise<string> {
  const learner = await getLaunchingUser();
  await assertQuizMayBeCompleted(lessonId, learner.id);

  const supabase = await createClient();
  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("lesson_completions")
    .upsert(
      {
        lesson_id: lessonId,
        platform_user_id: learner.id,
        completed_at: completedAt,
      },
      { onConflict: "lesson_id,platform_user_id" }
    )
    .select("completed_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to mark lesson complete");
  }

  revalidatePath(`/student/${courseCode}`);
  revalidatePath("/student");
  return data.completed_at as string;
}

export async function unmarkLessonComplete(courseCode: string, lessonId: string): Promise<void> {
  const learner = await getLaunchingUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_completions")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("platform_user_id", learner.id);

  if (error) throw new Error(error.message);
  revalidatePath(`/student/${courseCode}`);
  revalidatePath("/student");
}
