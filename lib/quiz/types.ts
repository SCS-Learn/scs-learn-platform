/** Default minimum quiz score (%) required before a learner can mark the lesson complete. */
export const DEFAULT_QUIZ_COMPLETION_THRESHOLD = 80;

/** Question types the platform can auto-grade in-app. */
export type AutogradableQuestionType =
  // Selection & arrangement
  | "multiple_choice"
  | "true_false"
  | "multiple_select"
  | "inline_dropdown"
  | "matching"
  | "categorization"
  | "ordering"
  | "hottext"
  | "choice_grid"
  // Text entry
  | "short_answer"
  | "multi_blank"
  | "cloze"
  | "keyword_scored"
  // Numeric
  | "numeric_tolerance"
  | "matrix_whole"
  | "matrix_per_cell"
  | "vector"
  | "integer"
  | "significant_figures"
  | "number_with_units"
  | "slider"
  // Symbolic & structured math
  | "symbolic_expression"
  | "equation_input"
  | "form_constrained_algebra"
  | "antiderivative"
  | "interval_set_list";

export type QuestionType = AutogradableQuestionType | "free_response" | "unknown";

export type QuestionCategory =
  | "selection"
  | "text_entry"
  | "numeric"
  | "symbolic";

export type QuestionTypeMeta = {
  label: string;
  category: QuestionCategory;
};

export const QUESTION_TYPE_META: Record<AutogradableQuestionType, QuestionTypeMeta> = {
  multiple_choice: { label: "Multiple choice (single answer)", category: "selection" },
  true_false: { label: "True / false", category: "selection" },
  multiple_select: { label: "Select all / multi-select", category: "selection" },
  inline_dropdown: { label: "Inline dropdown", category: "selection" },
  matching: { label: "Matching", category: "selection" },
  categorization: { label: "Categorization / bucket sort", category: "selection" },
  ordering: { label: "Ordering / sequencing", category: "selection" },
  hottext: { label: "Hottext / highlight in passage", category: "selection" },
  choice_grid: { label: "Choice grid / matrix of choices", category: "selection" },
  short_answer: { label: "Short answer (exact / regex)", category: "text_entry" },
  multi_blank: { label: "Multi-blank fill in the blank", category: "text_entry" },
  cloze: { label: "Cloze / mixed embedded answers", category: "text_entry" },
  keyword_scored: { label: "Keyword-scored free text", category: "text_entry" },
  numeric_tolerance: { label: "Number with tolerance", category: "numeric" },
  matrix_whole: { label: "Matrix input (whole matrix)", category: "numeric" },
  matrix_per_cell: { label: "Matrix input (per-cell grid)", category: "numeric" },
  vector: { label: "Vector input", category: "numeric" },
  integer: { label: "Integer", category: "numeric" },
  significant_figures: { label: "Significant figures", category: "numeric" },
  number_with_units: { label: "Number with units", category: "numeric" },
  slider: { label: "Slider / number line", category: "numeric" },
  symbolic_expression: { label: "Symbolic expression", category: "symbolic" },
  equation_input: { label: "Equation input", category: "symbolic" },
  form_constrained_algebra: { label: "Form-constrained algebra", category: "symbolic" },
  antiderivative: { label: "Antiderivative (up to a constant)", category: "symbolic" },
  interval_set_list: { label: "Interval, set, list & union", category: "symbolic" },
};

/** Frequently used types — shown first in instructor question-type dropdowns. */
export const COMMON_QUESTION_TYPES: AutogradableQuestionType[] = [
  "multiple_choice",
  "true_false",
  "short_answer",
  "multiple_select",
  "numeric_tolerance",
  "integer",
  "number_with_units",
  "multi_blank",
  "matching",
  "ordering",
];

/**
 * All autogradable types in display order: common types first, then less-used types
 * grouped by category (selection → text → numeric → symbolic).
 */
export const QUESTION_TYPE_DROPDOWN_ORDER: AutogradableQuestionType[] = [
  ...COMMON_QUESTION_TYPES,
  "significant_figures",
  "inline_dropdown",
  "categorization",
  "cloze",
  "keyword_scored",
  "choice_grid",
  "hottext",
  "symbolic_expression",
  "equation_input",
  "vector",
  "matrix_per_cell",
  "matrix_whole",
  "slider",
  "form_constrained_algebra",
  "antiderivative",
  "interval_set_list",
];

export const AUTOGRADABLE_QUESTION_TYPES: AutogradableQuestionType[] =
  QUESTION_TYPE_DROPDOWN_ORDER;

export const QUESTION_CATEGORIES: { id: QuestionCategory; label: string }[] = [
  { id: "selection", label: "Selection & arrangement" },
  { id: "text_entry", label: "Text entry" },
  { id: "numeric", label: "Numeric" },
  { id: "symbolic", label: "Symbolic & structured math" },
];

export function isAutogradableQuestionType(type: string): type is AutogradableQuestionType {
  return (AUTOGRADABLE_QUESTION_TYPES as string[]).includes(type);
}

/** Stored in jsonb — string[] for simple choice types, object for structured configs. */
export type QuestionChoices = string[] | Record<string, unknown> | null;

export type QuizQuestionFields = {
  promptText: string;
  questionType: QuestionType;
  choices: QuestionChoices;
  answerKey: string | null;
};
