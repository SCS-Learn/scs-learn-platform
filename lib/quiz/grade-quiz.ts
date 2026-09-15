import { isCorrect, isGradable, isLlmGradable } from "@/lib/quiz/grading";
import { gradeFreeResponseBatch } from "@/lib/quiz/grade-free-response";
import type { QuizQuestionFields } from "@/lib/quiz/types";

export type QuestionScore = {
  fraction: number;
  feedback: string | null;
};

export type QuizGradingResult = {
  /** Points earned: sum of (per-question fraction 0..1) × (that question's points) across gradable questions — fractional when free_response earns partial credit. */
  correctCount: number;
  /** Total points available across gradable questions — the quiz's out-of, normally 100 (see supabase/migrations/add-question-points.sql). */
  gradableCount: number;
  scorePercent: number;
  scores: Record<string, QuestionScore>;
};

/**
 * Grades every gradable question in one pass: rule-based types synchronously,
 * free_response questions via a single batched Opus call. Each question's
 * `points` weights its contribution to the total — a wrong answer on a
 * 15-point question costs more than a wrong answer on a 2-point one.
 */
export async function computeQuizGrading(
  questions: (QuizQuestionFields & { id: string; points: number })[],
  responses: Record<string, string>
): Promise<QuizGradingResult> {
  const scores: Record<string, QuestionScore> = {};
  const llmItems: { questionId: string; promptText: string; referenceAnswer: string; response: string }[] = [];

  for (const question of questions) {
    const response = responses[question.id] ?? "";

    if (isGradable(question)) {
      scores[question.id] = { fraction: isCorrect(question, response) ? 1 : 0, feedback: null };
      continue;
    }

    if (isLlmGradable(question)) {
      if (!response.trim()) {
        scores[question.id] = { fraction: 0, feedback: "No answer provided." };
      } else {
        llmItems.push({
          questionId: question.id,
          promptText: question.promptText,
          referenceAnswer: question.answerKey!,
          response,
        });
      }
    }
  }

  if (llmItems.length > 0) {
    const graded = await gradeFreeResponseBatch(llmItems).catch((error) => {
      console.error("computeQuizGrading: free-response grading failed:", error);
      return new Map<string, { scoreFraction: number; feedback: string }>();
    });

    for (const item of llmItems) {
      const result = graded.get(item.questionId);
      scores[item.questionId] = result
        ? { fraction: result.scoreFraction, feedback: result.feedback || null }
        : { fraction: 0, feedback: "Grading failed — please try submitting again." };
    }
  }

  const pointsByQuestionId = new Map(questions.map((q) => [q.id, q.points]));
  let correctCount = 0;
  let gradableCount = 0;
  for (const [questionId, score] of Object.entries(scores)) {
    const points = pointsByQuestionId.get(questionId) ?? 0;
    gradableCount += points;
    correctCount += score.fraction * points;
  }
  const scorePercent = gradableCount > 0 ? Math.round((correctCount / gradableCount) * 100) : 0;

  return { correctCount, gradableCount, scorePercent, scores };
}
