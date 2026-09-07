import type { AutogradableQuestionType, QuestionChoices } from "@/lib/quiz/types";

export function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function asStringChoices(choices: QuestionChoices): string[] | null {
  if (!choices) return null;
  if (Array.isArray(choices) && choices.every((c) => typeof c === "string")) {
    return choices;
  }
  return null;
}

export function asObjectChoices(choices: QuestionChoices): Record<string, unknown> | null {
  if (!choices || Array.isArray(choices)) return null;
  return choices;
}

/** Parse LLM/import choicesJson field into stored QuestionChoices. */
export function parseChoicesJson(value: string | null | undefined): QuestionChoices {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed === null) return null;
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }
    if (typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

/** MC options from string[] or object config with an "options" array. */
export function resolveMultipleChoiceOptions(choices: QuestionChoices): string[] | null {
  const stringChoices = asStringChoices(choices);
  if (stringChoices && stringChoices.length > 0) return stringChoices;
  const config = asObjectChoices(choices);
  const options = config?.options;
  if (Array.isArray(options) && options.every((o) => typeof o === "string")) {
    return options as string[];
  }
  return null;
}

export function defaultChoicesForType(type: AutogradableQuestionType): QuestionChoices {
  switch (type) {
    case "true_false":
      return ["True", "False"];
    case "multiple_choice":
    case "multiple_select":
      return ["", ""];
    case "ordering":
      return {
        items: ["Step 1", "Step 2", "Step 3"],
        displayOrder: ["Step 3", "Step 1", "Step 2"],
      };
    case "inline_dropdown":
      return {
        blanks: [{ id: "b1", options: ["Option A", "Option B"] }],
      };
    case "matching":
      return { left: ["Item 1", "Item 2"], right: ["Match A", "Match B"] };
    case "categorization":
      return {
        categories: ["Category A", "Category B"],
        items: ["Item 1", "Item 2"],
      };
    case "hottext":
      return {
        passage: "The quick brown fox jumps over the lazy dog.",
        terms: ["quick", "brown", "fox"],
      };
    case "choice_grid":
      return {
        rows: ["Row 1"],
        cols: ["Column A", "Column B"],
        options: ["Option 1", "Option 2", "Option 3"],
      };
    case "multi_blank":
      return { blankIds: ["b1", "b2"] };
    case "cloze":
      return {
        segments: [
          { type: "text", value: "The capital of France is " },
          { type: "blank", id: "b1", inputType: "text" },
          { type: "text", value: "." },
        ],
      };
    case "matrix_whole":
      return { rows: 2, cols: 2 };
    case "matrix_per_cell":
      return { rows: 2, cols: 2, rowLabels: ["R1", "R2"], colLabels: ["C1", "C2"] };
    case "vector":
      return { dimensions: 3 };
    case "slider":
      return { min: 0, max: 100, step: 1 };
    default:
      return null;
  }
}

export function defaultAnswerKeyForType(type: AutogradableQuestionType): string {
  switch (type) {
    case "multiple_choice":
    case "true_false":
      return "True";
    case "multiple_select":
      return JSON.stringify(["Option A"]);
    case "short_answer":
      return "answer";
    case "inline_dropdown":
      return JSON.stringify({ b1: "Option A" });
    case "matching":
      return JSON.stringify({ "Item 1": "Match A", "Item 2": "Match B" });
    case "categorization":
      return JSON.stringify({ "Item 1": "Category A", "Item 2": "Category B" });
    case "ordering":
      return JSON.stringify(["Step 1", "Step 2", "Step 3"]);
    case "hottext":
      return JSON.stringify(["quick"]);
    case "choice_grid":
      return JSON.stringify({ "Row 1": { "Column A": "Option 1", "Column B": "Option 2" } });
    case "multi_blank":
      return JSON.stringify({ b1: "Paris", b2: "France" });
    case "cloze":
      return JSON.stringify({ b1: "Paris" });
    case "keyword_scored":
      return JSON.stringify({ keywords: ["mitosis", "cell division"], minKeywords: 1 });
    case "numeric_tolerance":
      return JSON.stringify({ value: 3.14, tolerance: 0.01 });
    case "matrix_whole":
      return JSON.stringify({ matrix: [[1, 2], [3, 4]] });
    case "matrix_per_cell":
      return JSON.stringify({ cells: { "0,0": 1, "0,1": 2, "1,0": 3, "1,1": 4 } });
    case "vector":
      return JSON.stringify({ vector: [1, 2, 3] });
    case "integer":
      return JSON.stringify({ value: 42 });
    case "significant_figures":
      return JSON.stringify({ value: 3.14, sigFigs: 3 });
    case "number_with_units":
      return JSON.stringify({ value: 9.8, unit: "m/s^2" });
    case "slider":
      return JSON.stringify({ value: 50, tolerance: 1 });
    case "symbolic_expression":
      return "x^2 + 2x + 1";
    case "equation_input":
      return "y = 2x + 1";
    case "form_constrained_algebra":
      return JSON.stringify({ pattern: "ax^2 + bx + c", example: "2x^2 + 3x + 1" });
    case "antiderivative":
      return JSON.stringify({ expression: "x^2 + C", allowConstant: true });
    case "interval_set_list":
      return JSON.stringify({ type: "interval", value: "(0, 1)" });
    case "chemical_formula":
      return JSON.stringify({ formula: "H2O" });
    default:
      return "";
  }
}
