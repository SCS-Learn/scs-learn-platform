"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLaunchingUser } from "@/lib/lti/config";
import { isCorrect, isGradable, scoreQuiz } from "@/lib/quiz/grading";
import type { StudentQuestion } from "@/lib/student/types";

export type QuizSubmissionStatus = {
  submittedAt: string;
  correctCount: number;
  gradableCount: number;
  scorePercent: number;
  responses: Record<string, string>;
  variantIndex: number;
};

export async function fetchQuizSubmissionsForLessons(
  lessonIds: string[],
  platformUserId: string
): Promise<Map<string, QuizSubmissionStatus>> {
  if (lessonIds.length === 0) return new Map();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("quiz_submissions")
      .select(
        "id, lesson_id, correct_count, gradable_count, score_percent, submitted_at, variant_index, quiz_responses(question_id, response_text)"
      )
      .eq("platform_user_id", platformUserId)
      .in("lesson_id", lessonIds);
    if (error) throw new Error(error.message);

    return new Map(
      (data ?? []).map((row) => {
        const responses: Record<string, string> = {};
        for (const response of (row.quiz_responses ?? []) as {
          question_id: string;
          response_text: string;
        }[]) {
          responses[response.question_id] = response.response_text;
        }
        return [
          row.lesson_id as string,
          {
            submittedAt: row.submitted_at as string,
            correctCount: row.correct_count as number,
            gradableCount: row.gradable_count as number,
            scorePercent: row.score_percent as number,
            responses,
            variantIndex: (row.variant_index as number | null | undefined) ?? 0,
          },
        ] as const;
      })
    );
  } catch (error) {
    console.warn(
      "Skipping quiz progress (supabase/migrations/add-quiz-progress.sql likely not run yet):",
      error
    );
    return new Map();
  }
}

export async function submitQuiz(
  courseCode: string,
  lessonId: string,
  responses: { questionId: string; responseText: string }[],
  questions: StudentQuestion[],
  variantIndex = 0
): Promise<QuizSubmissionStatus> {
  const learner = await getLaunchingUser();
  const supabase = await createClient();

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const responseMap: Record<string, string> = {};
  for (const response of responses) {
    responseMap[response.questionId] = response.responseText;
  }
  const { correctCount, gradableCount, scorePercent } = scoreQuiz(questions, responseMap);

  const gradedResponses = responses.map(({ questionId, responseText }) => {
    const question = questionById.get(questionId);
    const gradable = question ? isGradable(question) : false;
    const correct = question ? isCorrect(question, responseText) : false;
    return { questionId, responseText, isCorrect: gradable ? correct : null };
  });

  const safeVariantIndex = Number.isFinite(variantIndex)
    ? Math.max(0, Math.trunc(variantIndex))
    : 0;

  const { data: submission, error: submissionError } = await supabase
    .from("quiz_submissions")
    .upsert(
      {
        lesson_id: lessonId,
        platform_user_id: learner.id,
        correct_count: correctCount,
        gradable_count: gradableCount,
        score_percent: scorePercent,
        variant_index: safeVariantIndex,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,platform_user_id" }
    )
    .select("id, submitted_at, correct_count, gradable_count, score_percent, variant_index")
    .single();

  if (submissionError || !submission) {
    throw new Error(submissionError?.message ?? "Failed to save quiz submission");
  }

  await supabase.from("quiz_responses").delete().eq("submission_id", submission.id);

  if (gradedResponses.length > 0) {
    const { error: responsesError } = await supabase.from("quiz_responses").insert(
      gradedResponses.map((response) => ({
        submission_id: submission.id,
        question_id: response.questionId,
        response_text: response.responseText,
        is_correct: response.isCorrect,
      }))
    );
    if (responsesError) throw new Error(responsesError.message);
  }

  revalidatePath(`/student/${courseCode}`);

  return {
    submittedAt: submission.submitted_at as string,
    correctCount: submission.correct_count as number,
    gradableCount: submission.gradable_count as number,
    scorePercent: submission.score_percent as number,
    responses: responseMap,
    variantIndex: (submission.variant_index as number | null | undefined) ?? safeVariantIndex,
  };
}
