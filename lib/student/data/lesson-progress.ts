"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLaunchingUser } from "@/lib/lti/config";
import { totalScore } from "@/lib/quiz/score";
import {
  assertUuid,
  getPublishedLesson,
  learnerWriteClient,
  loadLessonQuestions,
  type PublishedLesson,
} from "@/lib/student/data/learner-records";

async function assertQuizMayBeCompleted(lesson: PublishedLesson, platformUserId: string) {
  const questions = await loadLessonQuestions(lesson.id);
  if (questions.length === 0) return;

  const threshold = lesson.quizCompletionThreshold;
  const supabase = await createClient();
  const { data: submission, error: submissionError } = await supabase
    .from("quiz_submissions")
    .select("quiz_responses(question_id, score_fraction)")
    .eq("lesson_id", lesson.id)
    .eq("platform_user_id", platformUserId)
    .maybeSingle();
  if (submissionError) throw new Error(submissionError.message);

  if (!submission) {
    throw new Error(
      `Quiz lessons can only be marked complete after scoring at least ${threshold}%.`
    );
  }

  // The per-question fractions the server stored when it graded the attempt,
  // weighted by the current points: the same total the learner was shown.
  const fractions: Record<string, number> = {};
  for (const response of (submission.quiz_responses ?? []) as {
    question_id: string;
    score_fraction: number | null;
  }[]) {
    if (response.score_fraction !== null) fractions[response.question_id] = Number(response.score_fraction);
  }

  if (totalScore(questions, fractions).scorePercent < threshold) {
    throw new Error(
      `Quiz lessons can only be marked complete after scoring at least ${threshold}%.`
    );
  }
}

export async function markLessonComplete(courseCode: string, lessonId: string): Promise<string> {
  const learner = await getLaunchingUser();
  const lesson = await getPublishedLesson(lessonId);
  await assertQuizMayBeCompleted(lesson, learner.id);

  const completedAt = new Date().toISOString();
  const { data, error } = await learnerWriteClient()
    .from("lesson_completions")
    .upsert(
      {
        lesson_id: lesson.id,
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

  revalidatePath(`/student/${courseCode}`, "layout");
  revalidatePath("/student");
  return data.completed_at as string;
}

export async function unmarkLessonComplete(courseCode: string, lessonId: string): Promise<void> {
  assertUuid(lessonId, "lesson");
  const learner = await getLaunchingUser();
  const { error } = await learnerWriteClient()
    .from("lesson_completions")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("platform_user_id", learner.id);

  if (error) throw new Error(error.message);
  revalidatePath(`/student/${courseCode}`, "layout");
  revalidatePath("/student");
}
