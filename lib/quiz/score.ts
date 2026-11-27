import { isGradable, isLlmGradable } from "@/lib/quiz/grading";
import type { QuizQuestionFields } from "@/lib/quiz/types";

/**
 * The one place a quiz total is computed. computeQuizGrading (grade-quiz.ts)
 * uses it when an attempt is submitted; the completion gate, the reloaded
 * quiz and the course outline use it on the fractions stored with that
 * attempt (quiz_responses.score_fraction). Pure, so the tests and the
 * browser bundle can import it.
 */

export type ScoredQuestion = QuizQuestionFields & { id: string; points: number };

export type QuizTotal = {
  /** Points earned: Σ fraction × points. Fractional when free_response earns partial credit. */
  correctCount: number;
  /** Points available: Σ points over the questions that count. */
  gradableCount: number;
  scorePercent: number;
};

/** Rule-graded questions with a key, and free_response questions with a reference answer. */
export function countsTowardScore(question: QuizQuestionFields): boolean {
  return isGradable(question) || isLlmGradable(question);
}

/**
 * Σ fraction × points ÷ Σ points over the questions that count. A question
 * with no fraction (unanswered, or added after the attempt) earns 0; a
 * fraction for a question that no longer exists is ignored.
 */
export function totalScore(questions: ScoredQuestion[], fractions: Record<string, number>): QuizTotal {
  let correctCount = 0;
  let gradableCount = 0;
  for (const question of questions) {
    if (!countsTowardScore(question)) continue;
    const points = question.points ?? 0;
    gradableCount += points;
    correctCount += (fractions[question.id] ?? 0) * points;
  }
  const scorePercent = gradableCount > 0 ? Math.round((correctCount / gradableCount) * 100) : 0;
  return { correctCount, gradableCount, scorePercent };
}

/**
 * A stored attempt against the current questions: drops responses and scores
 * for questions that were deleted, and recomputes the total from the stored
 * per-question fractions. Nothing is regraded, so an attempt keeps the grade
 * it got when it was submitted even if an answer key changes later.
 */
export function scoreStoredAttempt<
  T extends { responses: Record<string, string>; scores: Record<string, { fraction: number }> },
>(questions: ScoredQuestion[], attempt: T | null): (T & QuizTotal) | null {
  if (!attempt) return null;
  const live = new Set(questions.map((question) => question.id));
  const responses = Object.fromEntries(Object.entries(attempt.responses).filter(([id]) => live.has(id)));
  const scores = Object.fromEntries(
    Object.entries(attempt.scores).filter(([id]) => live.has(id))
  ) as T["scores"];
  const fractions = Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, score.fraction]));
  return { ...attempt, responses, scores, ...totalScore(questions, fractions) };
}
