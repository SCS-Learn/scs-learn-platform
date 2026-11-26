"use server";

import { revalidatePath } from "next/cache";
import { getLaunchingUser } from "@/lib/lti/config";
import { requireInstructor } from "@/lib/instructor/data/current-instructor";
import { computeQuizGrading } from "@/lib/quiz/grade-quiz";
import { revealedAnswers } from "@/lib/quiz/learner-view";
import { applyQuestionVariants, clampVariantIndex, quizVariantPoolSize } from "@/lib/quiz/variants";
import {
  assertUuid,
  getPublishedLesson,
  learnerWriteClient,
  loadLessonQuestions,
} from "@/lib/student/data/learner-records";
import type { QuizSubmissionStatus, StudentQuestion } from "@/lib/student/types";

type QuizResponseInput = { questionId: string; responseText: string };

/** Keeps only well-formed responses to questions in `questionIds`; the rest of the payload is ignored. */
function toResponseMap(responses: unknown, questionIds: Set<string>): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(responses)) return map;
  for (const entry of responses) {
    if (!entry || typeof entry !== "object") continue;
    const { questionId, responseText } = entry as Partial<QuizResponseInput>;
    if (typeof questionId !== "string" || typeof responseText !== "string") continue;
    if (!questionIds.has(questionId)) continue;
    map[questionId] = responseText;
  }
  return map;
}

/**
 * Grades a quiz attempt without persisting it, against questions the caller
 * supplies: instructor preview only. Learners submit with submitQuiz, which
 * grades against the stored questions.
 */
export async function previewGradeQuiz(
  responses: QuizResponseInput[],
  questions: StudentQuestion[]
): Promise<Pick<QuizSubmissionStatus, "correctCount" | "gradableCount" | "scorePercent" | "responses" | "scores">> {
  await requireInstructor();
  const responseMap = toResponseMap(responses, new Set(questions.map((q) => q.id)));
  const grading = await computeQuizGrading(questions, responseMap);
  return { ...grading, responses: responseMap };
}

/**
 * Grades and saves the signed-in learner's attempt. The questions, answer
 * keys and points come from the database, never from the browser; the
 * browser only says which answers it gave and which variant it showed.
 */
export async function submitQuiz(
  courseCode: string,
  lessonId: string,
  responses: QuizResponseInput[],
  variantIndex = 0
): Promise<QuizSubmissionStatus> {
  const learner = await getLaunchingUser();
  const lesson = await getPublishedLesson(lessonId);
  const questions = await loadLessonQuestions(lesson.id);
  if (questions.length === 0) throw new Error("This lesson has no quiz questions.");

  const poolSize = quizVariantPoolSize(questions);
  const requestedVariant =
    typeof variantIndex === "number" && Number.isFinite(variantIndex) ? Math.trunc(variantIndex) : 0;
  const safeVariantIndex = poolSize <= 1 ? 0 : clampVariantIndex(requestedVariant, poolSize);
  const activeQuestions = applyQuestionVariants(questions, safeVariantIndex);

  const responseMap = toResponseMap(responses, new Set(activeQuestions.map((q) => q.id)));
  const grading = await computeQuizGrading(activeQuestions, responseMap);

  const db = learnerWriteClient();
  const { data: submission, error: submissionError } = await db
    .from("quiz_submissions")
    .upsert(
      {
        lesson_id: lesson.id,
        platform_user_id: learner.id,
        correct_count: grading.correctCount,
        gradable_count: grading.gradableCount,
        score_percent: grading.scorePercent,
        variant_index: safeVariantIndex,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,platform_user_id" }
    )
    .select("id, submitted_at, variant_index")
    .single();

  if (submissionError || !submission) {
    throw new Error(submissionError?.message ?? "Failed to save quiz submission");
  }

  const { error: clearError } = await db.from("quiz_responses").delete().eq("submission_id", submission.id);
  if (clearError) throw new Error(clearError.message);

  const responseRows = Object.entries(responseMap).map(([questionId, responseText]) => {
    const score = grading.scores[questionId];
    return {
      submission_id: submission.id,
      question_id: questionId,
      response_text: responseText,
      is_correct: score ? score.fraction >= 1 : null,
      score_fraction: score ? score.fraction : null,
      feedback: score?.feedback ?? null,
    };
  });
  if (responseRows.length > 0) {
    const { error: responsesError } = await db.from("quiz_responses").insert(responseRows);
    if (responsesError) throw new Error(responsesError.message);
  }

  revalidatePath(`/student/${courseCode}`, "layout");

  return {
    submittedAt: submission.submitted_at as string,
    correctCount: grading.correctCount,
    gradableCount: grading.gradableCount,
    scorePercent: grading.scorePercent,
    responses: responseMap,
    variantIndex: (submission.variant_index as number | null | undefined) ?? safeVariantIndex,
    scores: grading.scores,
    correctAnswers: revealedAnswers(activeQuestions, grading.scores, lesson.showReferenceAnswers),
  };
}

/** Records a student's thumbs-up/down on the LLM grader's feedback for one question in their current submission. */
export async function rateGradingFeedback(
  lessonId: string,
  questionId: string,
  rating: "up" | "down" | null
): Promise<void> {
  if (rating !== "up" && rating !== "down" && rating !== null) throw new Error("Invalid rating");
  assertUuid(lessonId, "lesson");
  assertUuid(questionId, "question");
  const learner = await getLaunchingUser();
  const db = learnerWriteClient();

  const { data: submission, error: submissionError } = await db
    .from("quiz_submissions")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("platform_user_id", learner.id)
    .maybeSingle();
  if (submissionError || !submission) {
    throw new Error("No submission found for this lesson.");
  }

  const { error } = await db
    .from("quiz_responses")
    .update({ grading_feedback_rating: rating })
    .eq("submission_id", submission.id)
    .eq("question_id", questionId);
  if (error) throw new Error(error.message);
}
