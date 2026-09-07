import { parseJson } from "@/lib/quiz/parse";
import type { QuizQuestionFields } from "@/lib/quiz/types";

export function formatCorrectAnswer(question: QuizQuestionFields): string {
  const { questionType, answerKey, choices } = question;
  if (!answerKey) return "";

  if (questionType === "multiple_select") {
    const parsed = parseJson<string[]>(answerKey);
    return parsed ? parsed.join(", ") : answerKey;
  }

  if (
    questionType === "inline_dropdown" ||
    questionType === "matching" ||
    questionType === "categorization" ||
    questionType === "multi_blank" ||
    questionType === "cloze" ||
    questionType === "choice_grid" ||
    questionType === "matrix_per_cell"
  ) {
    const parsed = parseJson<Record<string, unknown>>(answerKey);
    if (parsed) {
      return Object.entries(parsed)
        .map(([k, v]) => {
          if (typeof v === "object" && v !== null) {
            return `${k}: ${JSON.stringify(v)}`;
          }
          return `${k} → ${String(v)}`;
        })
        .join("; ");
    }
  }

  if (questionType === "ordering" || questionType === "hottext") {
    const parsed = parseJson<string[]>(answerKey);
    if (parsed) return parsed.join(" → ");
  }

  if (questionType === "keyword_scored") {
    const parsed = parseJson<{ keywords: string[]; minKeywords?: number }>(answerKey);
    if (parsed) return `Keywords: ${parsed.keywords.join(", ")}`;
  }

  if (questionType === "numeric_tolerance" || questionType === "integer" || questionType === "slider") {
    const parsed = parseJson<{ value: number; tolerance?: number }>(answerKey);
    if (parsed) {
      return parsed.tolerance != null
        ? `${parsed.value} (±${parsed.tolerance})`
        : String(parsed.value);
    }
  }

  if (questionType === "vector") {
    const parsed = parseJson<{ vector: number[] }>(answerKey);
    if (parsed) return `[${parsed.vector.join(", ")}]`;
  }

  if (questionType === "matrix_whole") {
    const parsed = parseJson<{ matrix: number[][] }>(answerKey);
    if (parsed) return parsed.matrix.map((row) => `[${row.join(", ")}]`).join(" ");
  }

  if (questionType === "significant_figures") {
    const parsed = parseJson<{ value: number; sigFigs: number }>(answerKey);
    if (parsed) return `${parsed.value} (${parsed.sigFigs} sig figs)`;
  }

  if (questionType === "number_with_units") {
    const parsed = parseJson<{ value: number; unit: string }>(answerKey);
    if (parsed) return `${parsed.value} ${parsed.unit}`;
  }

  if (questionType === "antiderivative") {
    const parsed = parseJson<{ expression: string }>(answerKey);
    if (parsed) return parsed.expression;
  }

  if (questionType === "interval_set_list") {
    const parsed = parseJson<{ type: string; value: string }>(answerKey);
    if (parsed) return parsed.value;
  }

  if (questionType === "chemical_formula") {
    const parsed = parseJson<{ formula: string }>(answerKey);
    if (parsed) return parsed.formula;
  }

  if (questionType === "form_constrained_algebra") {
    const parsed = parseJson<{ example: string }>(answerKey);
    if (parsed) return parsed.example;
  }

  return answerKey;
}
