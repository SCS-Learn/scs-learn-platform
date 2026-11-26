import { formatCorrectAnswer } from "@/lib/quiz/format-answer";
import { matrixShapeFromAnswerKey } from "@/lib/quiz/matrix";
import { parseOrderingChoices } from "@/lib/quiz/ordering";
import { asObjectChoices } from "@/lib/quiz/parse";
import type { QuestionChoices, QuestionType } from "@/lib/quiz/types";
import { applyQuestionVariant, hasVariantPool, type QuestionWithVariants } from "@/lib/quiz/variants";

/**
 * Learners never receive answer keys: quizzes are graded on the server
 * (lib/student/data/quiz-progress.ts), and the browser gets each question with
 * answerKey null, in every variant, plus nothing else derived from the key:
 * - matrix questions take their grid size from the key, so the size is copied
 *   into choices;
 * - ordering questions store the correct order in choices.items, so learners
 *   get only the order they are shown. That order is computed here, for every
 *   variant, and marked fixedOrder so the browser doesn't reshuffle it
 *   (shuffleAnswerOptions); grading falls back to the shown order when the
 *   learner leaves it untouched, so both sides must agree on it.
 */

function orderingWithoutKey(choices: QuestionChoices): QuestionChoices {
  const config = parseOrderingChoices(choices);
  if (!config) return choices;
  return {
    ...(asObjectChoices(choices) ?? {}),
    items: [...config.displayOrder],
    displayOrder: config.displayOrder,
    fixedOrder: true,
  };
}

function choicesWithoutKey(
  questionType: QuestionType | string,
  choices: QuestionChoices,
  answerKey: string | null
): QuestionChoices {
  if (questionType === "ordering") return orderingWithoutKey(choices);
  if (questionType !== "matrix_whole" && questionType !== "matrix_per_cell") return choices;
  const shape = matrixShapeFromAnswerKey(questionType, answerKey);
  if (!shape) return choices;
  return { ...(asObjectChoices(choices) ?? {}), rows: shape.rows, cols: shape.cols };
}

export function withoutAnswerKey<T extends QuestionWithVariants>(question: T): T {
  const pool = question.variants;
  return {
    ...question,
    choices: choicesWithoutKey(question.questionType, question.choices, question.answerKey),
    answerKey: null,
    ...(pool
      ? {
          variants: pool.map((variant, index) => {
            // What this variant shows: for index > 0 the server reshuffles
            // option order (applyQuestionVariant); ordering needs that result.
            const shown =
              question.questionType === "ordering" && index > 0 && hasVariantPool(pool)
                ? applyQuestionVariant(question, index).choices
                : variant.choices;
            return {
              ...variant,
              choices: choicesWithoutKey(question.questionType, shown, variant.answerKey),
              answerKey: null,
            };
          }),
        }
      : {}),
  };
}

/**
 * Correct answers a learner may see after grading, keyed by question id: only
 * when the lesson shows reference answers, and only for questions the attempt
 * didn't get fully right (the quiz UI shows nothing for correct ones).
 * `questions` must be the graded variant, with keys.
 */
export function revealedAnswers(
  questions: (QuestionWithVariants & { questionType: QuestionType })[],
  scores: Record<string, { fraction: number }>,
  showReferenceAnswers: boolean
): Record<string, string> {
  if (!showReferenceAnswers) return {};
  const answers: Record<string, string> = {};
  for (const question of questions) {
    const score = scores[question.id];
    if (!score || score.fraction >= 1 || !question.answerKey) continue;
    const formatted = formatCorrectAnswer(question);
    if (formatted) answers[question.id] = formatted;
  }
  return answers;
}
