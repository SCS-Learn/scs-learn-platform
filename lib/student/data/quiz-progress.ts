"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLaunchingUser } from "@/lib/lti/config";
import { computeQuizGrading } from "@/lib/quiz/grade-quiz";
import type { StudentQuestion } from "@/lib/student/types";

export type QuizSubmissionStatus = {
  submittedAt: string;
  correctCount: number;
  gradableCount: number;
  scorePercent: number;
  responses: Record<string, string>;
  /** Active quiz version index (0–9 when variants exist). */
  variantIndex: number;
  /** Per-question grading — fraction 0..1 (partial credit for free_response) plus any LLM feedback. */
  scores: Record<string, { fraction: number; feedback: string | null; feedbackRating?: "up" | "down" | null }>;
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
        "id, lesson_id, correct_count, gradable_count, score_percent, submitted_at, variant_index, quiz_responses(question_id, response_text, score_fraction, feedback, grading_feedback_rating)"
      )
      .eq("platform_user_id", platformUserId)
      .in("lesson_id", lessonIds);
    if (error) throw new Error(error.message);

    return new Map(
      (data ?? []).map((row) => {
        const responses: Record<string, string> = {};
        const scores: QuizSubmissionStatus["scores"] = {};
        for (const response of (row.quiz_responses ?? []) as {
          question_id: string;
          response_text: string;
          score_fraction: number | null;
          feedback: string | null;
          grading_feedback_rating: "up" | "down" | null;
        }[]) {
          responses[response.question_id] = response.response_text;
          if (response.score_fraction !== null) {
            scores[response.question_id] = {
              fraction: Number(response.score_fraction),
              feedback: response.feedback,
              feedbackRating: response.grading_feedback_rating,
            };
          }
        }
        return [
          row.lesson_id as string,
          {
            submittedAt: row.submitted_at as string,
            correctCount: Number(row.correct_count),
            gradableCount: row.gradable_count as number,
            scorePercent: row.score_percent as number,
            responses,
            variantIndex: (row.variant_index as number | null | undefined) ?? 0,
            scores,
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

/** Grades a quiz attempt without persisting it — used for instructor preview mode. */
export async function previewGradeQuiz(
  responses: { questionId: string; responseText: string }[],
  questions: StudentQuestion[]
): Promise<Pick<QuizSubmissionStatus, "correctCount" | "gradableCount" | "scorePercent" | "responses" | "scores">> {
  const responseMap: Record<string, string> = {};
  for (const { questionId, responseText } of responses) {
    responseMap[questionId] = responseText;
  }

  const grading = await computeQuizGrading(questions, responseMap);

  return { ...grading, responses: responseMap };
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

  const responseMap: Record<string, string> = {};
  for (const { questionId, responseText } of responses) {
    responseMap[questionId] = responseText;
  }

  const grading = await computeQuizGrading(questions, responseMap);

  const safeVariantIndex = Number.isFinite(variantIndex)
    ? Math.max(0, Math.trunc(variantIndex))
    : 0;

  const { data: submission, error: submissionError } = await supabase
    .from("quiz_submissions")
    .upsert(
      {
        lesson_id: lessonId,
        platform_user_id: learner.id,
        correct_count: grading.correctCount,
        gradable_count: grading.gradableCount,
        score_percent: grading.scorePercent,
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

  if (responses.length > 0) {
    const { error: responsesError } = await supabase.from("quiz_responses").insert(
      responses.map(({ questionId, responseText }) => {
        const score = grading.scores[questionId];
        return {
          submission_id: submission.id,
          question_id: questionId,
          response_text: responseText,
          is_correct: score ? score.fraction >= 1 : null,
          score_fraction: score ? score.fraction : null,
          feedback: score?.feedback ?? null,
        };
      })
    );
    if (responsesError) throw new Error(responsesError.message);
  }

  revalidatePath(`/student/${courseCode}`);

  return {
    submittedAt: submission.submitted_at as string,
    correctCount: grading.correctCount,
    gradableCount: grading.gradableCount,
    scorePercent: grading.scorePercent,
    responses: responseMap,
    variantIndex: (submission.variant_index as number | null | undefined) ?? safeVariantIndex,
    scores: grading.scores,
  };
}

/** Records a student's thumbs-up/down on the LLM grader's feedback for one question in their current submission. */
export async function rateGradingFeedback(
  lessonId: string,
  questionId: string,
  rating: "up" | "down" | null
): Promise<void> {
  const learner = await getLaunchingUser();
  const supabase = await createClient();

  const { data: submission, error: submissionError } = await supabase
    .from("quiz_submissions")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("platform_user_id", learner.id)
    .single();
  if (submissionError || !submission) {
    throw new Error("No submission found for this lesson.");
  }

  const { error } = await supabase
    .from("quiz_responses")
    .update({ grading_feedback_rating: rating })
    .eq("submission_id", submission.id)
    .eq("question_id", questionId);
  if (error) throw new Error(error.message);
}
