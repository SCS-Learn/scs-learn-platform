"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLaunchingUser } from "@/lib/lti/config";
import { reconcileQuizSubmission } from "@/lib/quiz/grading";
import { DEFAULT_QUIZ_COMPLETION_THRESHOLD } from "@/lib/quiz/types";
import { applyQuestionVariants, parseVariants } from "@/lib/quiz/variants";
import type { QuestionChoices, QuestionType } from "@/lib/quiz/types";

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
    .select(
      "quiz_completion_threshold, lesson_blocks(question_groups(questions(id, prompt_text, choices, answer_key, question_type, variants)))"
    )
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonError) throw new Error(lessonError.message);
  if (!lesson) throw new Error("Lesson not found");

  const threshold = (lesson.quiz_completion_threshold as number | null) ?? DEFAULT_QUIZ_COMPLETION_THRESHOLD;

  type QuestionRow = {
    id: string;
    prompt_text: string;
    choices: QuestionChoices;
    answer_key: string | null;
    question_type: string;
    variants?: unknown;
  };

  const blocks = (lesson.lesson_blocks ?? []) as unknown as {
    question_groups: { questions: QuestionRow[] } | { questions: QuestionRow[] }[] | null;
  }[];

  const questions = blocks.flatMap((block) => {
    const groups = block.question_groups;
    if (!groups) return [];
    const list = Array.isArray(groups) ? groups : [groups];
    return list.flatMap((group) =>
      (group.questions ?? []).map((q) => {
        const variants = parseVariants(q.variants);
        return {
          id: q.id,
          promptText: q.prompt_text,
          choices: q.choices,
          answerKey: q.answer_key,
          questionType: q.question_type as QuestionType,
          ...(variants.length > 0 ? { variants } : {}),
        };
      })
    );
  });
  if (questions.length === 0) return;

  const { data: submission, error: submissionError } = await supabase
    .from("quiz_submissions")
    .select("submitted_at, variant_index, quiz_responses(question_id, response_text)")
    .eq("lesson_id", lessonId)
    .eq("platform_user_id", platformUserId)
    .maybeSingle();
  if (submissionError) throw new Error(submissionError.message);

  if (!submission) {
    throw new Error(
      `Quiz lessons can only be marked complete after scoring at least ${threshold}%.`
    );
  }

  const responses: Record<string, string> = {};
  for (const response of (submission.quiz_responses ?? []) as {
    question_id: string;
    response_text: string;
  }[]) {
    responses[response.question_id] = response.response_text;
  }

  const variantIndex = (submission.variant_index as number | null | undefined) ?? 0;
  const scoredQuestions = applyQuestionVariants(questions, variantIndex);

  const reconciled = reconcileQuizSubmission(scoredQuestions, {
    submittedAt: submission.submitted_at as string,
    responses,
  });
  if (!reconciled || reconciled.scorePercent < threshold) {
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
