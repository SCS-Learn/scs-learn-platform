import { effectiveOrderingResponse } from "@/lib/quiz/ordering";
import { parseJson } from "@/lib/quiz/parse";
import { gradeSignificantFigures } from "@/lib/quiz/sig-figs";
import { isAutogradableQuestionType, type QuizQuestionFields } from "@/lib/quiz/types";

export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeShortAnswer(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeRegexPattern(value: string): boolean {
  if (value.includes("|")) return true;
  if (value.startsWith("^") || value.endsWith("$")) return true;
  if (value.includes("(?")) return true;
  if (/\\[dwsWDS]/.test(value)) return true;
  return false;
}

function buildShortAnswerRegex(resolvedPattern: string): RegExp | null {
  const trimmed = resolvedPattern.trim();
  if (!trimmed) return null;
  const anchored =
    trimmed.startsWith("^") || trimmed.endsWith("$") ? trimmed : `^(?:${trimmed})$`;
  try {
    return new RegExp(anchored, "i");
  } catch {
    return null;
  }
}

function resolveShortAnswerRegexSource(raw: string): string | null {
  const trimmed = normalizeShortAnswer(raw);
  if (!trimmed) return null;
  const resolved = looksLikeRegexPattern(trimmed) ? trimmed : escapeRegexLiteral(trimmed);
  return buildShortAnswerRegex(resolved) !== null ? resolved : null;
}

export function isValidShortAnswer(raw: string): boolean {
  return resolveShortAnswerRegexSource(raw) !== null;
}

export function matchesShortAnswer(response: string, storedPattern: string): boolean {
  const resolved = resolveShortAnswerRegexSource(storedPattern);
  if (!resolved) return false;
  const regex = buildShortAnswerRegex(resolved);
  if (!regex) return false;
  const normalized = normalizeShortAnswer(response);
  if (!normalized) return false;
  return regex.test(normalized);
}

export function isGradable(question: QuizQuestionFields): boolean {
  return question.answerKey !== null && isAutogradableQuestionType(question.questionType);
}

function parseJsonStringArray(value: string): string[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => String(item).trim()).filter(Boolean).sort();
  } catch {
    return null;
  }
}

/** JSON string array preserving order (ordering, hottext). */
function parseJsonStringArrayOrdered(value: string | null | undefined): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => normalize(value) === normalize(b[index] ?? ""));
}

export function encodeMultipleSelectResponse(selected: string[]): string {
  return JSON.stringify([...selected].sort());
}

export function decodeMultipleSelectResponse(response: string): string[] {
  return parseJsonStringArray(response) ?? [];
}

function parseJsonObject(value: string): Record<string, string> | null {
  const parsed = parseJson<Record<string, unknown>>(value);
  if (!parsed) return null;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    result[k] = String(v);
  }
  return result;
}

function objectsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (!arraysEqual(keysA, keysB)) return false;
  return keysA.every((k) => normalize(a[k]) === normalize(b[k]));
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function numbersClose(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(a - b) <= tolerance;
}

function normalizeExpression(expr: string): string {
  return expr
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/−/g, "-")
    .replace(/\*\*/g, "^")
    .replace(/\*/g, "")
    .replace(/×/g, "")
    .replace(/÷/g, "/");
}

function parseVector(value: string): number[] | null {
  const parsed = parseJson<number[]>(value);
  if (parsed && Array.isArray(parsed)) return parsed.map(Number).filter((n) => Number.isFinite(n));
  const trimmed = value.trim().replace(/^\[|\]$/g, "");
  if (!trimmed) return null;
  const parts = trimmed.split(/[,;\s]+/).map((p) => Number(p.trim()));
  if (parts.every((n) => Number.isFinite(n))) return parts;
  return null;
}

function parseMatrix(value: string): number[][] | null {
  const parsed = parseJson<number[][]>(value);
  if (parsed && Array.isArray(parsed)) {
    return parsed.map((row) => row.map(Number));
  }
  const rows = value
    .trim()
    .split(/[;\n]/)
    .map((row) => row.replace(/^\[|\]$/g, "").split(/[, \t]+/).map(Number));
  if (rows.every((row) => row.every((n) => Number.isFinite(n)))) return rows;
  return null;
}

function stripAntiderivativeConstant(expr: string): string {
  return expr.replace(/\s*[+-]\s*([C]|\d+(\.\d+)?)\s*$/i, "").trim();
}

function gradeNumericTolerance(
  response: string,
  key: { value: number; tolerance?: number }
): boolean {
  const n = parseNumber(response);
  if (n === null) return false;
  const tol = key.tolerance ?? 1e-9;
  return numbersClose(n, key.value, tol);
}

function gradeMappingResponse(response: string, expected: Record<string, string>): boolean {
  const actual = parseJsonObject(response);
  if (!actual) return false;
  return objectsEqual(actual, expected);
}

function gradeChoiceGrid(response: string, expected: Record<string, Record<string, string>>): boolean {
  const actual = parseJson<Record<string, Record<string, string>>>(response);
  if (!actual) return false;
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  if (!arraysEqual(expectedKeys, actualKeys)) return false;
  return expectedKeys.every((row) => {
    const expCols = expected[row] ?? {};
    const actCols = actual[row] ?? {};
    return objectsEqual(
      Object.fromEntries(Object.entries(expCols).map(([k, v]) => [k, String(v)])),
      Object.fromEntries(Object.entries(actCols).map(([k, v]) => [k, String(v)]))
    );
  });
}

export function isCorrect(question: QuizQuestionFields, response: string): boolean {
  if (!question.answerKey) return false;
  const type = question.questionType;

  if (type === "multiple_select") {
    const expected = parseJsonStringArray(question.answerKey);
    const actual = parseJsonStringArray(response);
    if (!expected || !actual) return false;
    return arraysEqual(expected, actual);
  }

  if (type === "short_answer") {
    return matchesShortAnswer(response, question.answerKey);
  }

  if (type === "multiple_choice" || type === "true_false") {
    return normalize(response) === normalize(question.answerKey);
  }

  if (type === "inline_dropdown" || type === "matching" || type === "categorization" || type === "multi_blank" || type === "cloze") {
    const expected = parseJsonObject(question.answerKey);
    if (!expected) return false;
    if (type === "multi_blank" || type === "cloze") {
      const actual = parseJsonObject(response);
      if (!actual) return false;
      return Object.entries(expected).every(([k, pattern]) =>
        matchesShortAnswer(actual[k] ?? "", pattern)
      );
    }
    return gradeMappingResponse(response, expected);
  }

  if (type === "ordering") {
    const expected = parseJsonStringArrayOrdered(question.answerKey);
    const actualList = effectiveOrderingResponse(question.choices, response);
    if (!expected || actualList.length === 0) return false;
    return arraysEqual(
      expected.map((s) => normalize(s)),
      actualList.map((s) => normalize(s))
    );
  }

  if (type === "hottext") {
    const expected = parseJsonStringArrayOrdered(question.answerKey);
    const actual = parseJsonStringArrayOrdered(response);
    if (!expected || !actual) return false;
    return arraysEqual(
      expected.map((s) => normalize(s)),
      actual.map((s) => normalize(s))
    );
  }

  if (type === "choice_grid") {
    const expected = parseJson<Record<string, Record<string, string>>>(question.answerKey);
    if (!expected) return false;
    return gradeChoiceGrid(response, expected);
  }

  if (type === "keyword_scored") {
    const key = parseJson<{ keywords: string[]; minKeywords?: number }>(question.answerKey);
    if (!key || key.keywords.length === 0) return false;
    const text = normalize(response);
    const matched = key.keywords.filter((kw) => text.includes(normalize(kw))).length;
    const required = key.minKeywords ?? key.keywords.length;
    return matched >= required;
  }

  if (type === "numeric_tolerance" || type === "slider") {
    const key = parseJson<{ value: number; tolerance?: number }>(question.answerKey);
    if (!key) return false;
    return gradeNumericTolerance(response, key);
  }

  if (type === "integer") {
    const key = parseJson<{ value: number }>(question.answerKey);
    if (!key) return false;
    const n = parseNumber(response);
    if (n === null || !Number.isInteger(n)) return false;
    return n === key.value;
  }

  if (type === "significant_figures") {
    const key = parseJson<{ value: number; sigFigs: number }>(question.answerKey);
    if (!key) return false;
    return gradeSignificantFigures(response, key);
  }

  if (type === "number_with_units") {
    const key = parseJson<{ value: number; unit: string; unitAliases?: string[] }>(question.answerKey);
    if (!key) return false;
    const parts = response.trim().split(/\s+/);
    const numPart = parseNumber(parts[0] ?? "");
    if (numPart === null) return false;
    const unitPart = parts.slice(1).join(" ").trim();
    const acceptedUnits = [key.unit, ...(key.unitAliases ?? [])].map(normalize);
    if (!numbersClose(numPart, key.value, 1e-9)) return false;
    return acceptedUnits.includes(normalize(unitPart));
  }

  if (type === "vector") {
    const key = parseJson<{ vector: number[] }>(question.answerKey);
    if (!key) return false;
    const actual = parseVector(response);
    if (!actual || actual.length !== key.vector.length) return false;
    return actual.every((n, i) => numbersClose(n, key.vector[i] ?? NaN));
  }

  if (type === "matrix_whole") {
    const key = parseJson<{ matrix: number[][] }>(question.answerKey);
    if (!key) return false;
    const actual = parseMatrix(response);
    if (!actual) return false;
    if (actual.length !== key.matrix.length) return false;
    return actual.every((row, ri) =>
      row.length === (key.matrix[ri]?.length ?? 0) &&
      row.every((n, ci) => numbersClose(n, key.matrix[ri]?.[ci] ?? NaN))
    );
  }

  if (type === "matrix_per_cell") {
    const key = parseJson<{ cells: Record<string, number>; tolerance?: number }>(question.answerKey);
    if (!key) return false;
    const actual = parseJson<Record<string, string>>(response);
    if (!actual) return false;
    const tol = key.tolerance ?? 1e-9;
    return Object.entries(key.cells).every(([cell, expected]) => {
      const n = parseNumber(actual[cell] ?? "");
      return n !== null && numbersClose(n, expected, tol);
    });
  }

  if (type === "symbolic_expression" || type === "equation_input") {
    return normalizeExpression(response) === normalizeExpression(question.answerKey);
  }

  if (type === "form_constrained_algebra") {
    const key = parseJson<{ example: string; pattern?: string }>(question.answerKey);
    if (!key) return false;
    return normalizeExpression(response) === normalizeExpression(key.example);
  }

  if (type === "antiderivative") {
    const key = parseJson<{ expression: string; allowConstant?: boolean }>(question.answerKey);
    if (!key) return false;
    const expected = key.allowConstant ? stripAntiderivativeConstant(key.expression) : key.expression;
    const actual = key.allowConstant ? stripAntiderivativeConstant(response) : response;
    return normalizeExpression(actual) === normalizeExpression(expected);
  }

  if (type === "interval_set_list") {
    const key = parseJson<{ value: string }>(question.answerKey);
    if (!key) return false;
    return normalize(response).replace(/\s/g, "") === normalize(key.value).replace(/\s/g, "");
  }

  return normalize(response) === normalize(question.answerKey);
}

export type ScoredQuizQuestion = QuizQuestionFields & { id: string };

/** Grade a full attempt against the current question set (denominator = live gradable count). */
export function scoreQuiz(
  questions: ScoredQuizQuestion[],
  responses: Record<string, string>
): { correctCount: number; gradableCount: number; scorePercent: number } {
  const gradableQuestions = questions.filter(isGradable);
  const correctCount = gradableQuestions.filter((q) => isCorrect(q, responses[q.id] ?? "")).length;
  const gradableCount = gradableQuestions.length;
  return {
    correctCount,
    gradableCount,
    scorePercent: gradableCount > 0 ? Math.round((correctCount / gradableCount) * 100) : 0,
  };
}

/** Drop responses for removed questions and rescore against the live question list. */
export function reconcileQuizSubmission<T extends { responses: Record<string, string>; submittedAt: string }>(
  questions: ScoredQuizQuestion[],
  submission: T | null
): (T & { correctCount: number; gradableCount: number; scorePercent: number }) | null {
  if (!submission) return null;
  const responses: Record<string, string> = {};
  for (const question of questions) {
    if (question.id in submission.responses) {
      responses[question.id] = submission.responses[question.id];
    }
  }
  return {
    ...submission,
    ...scoreQuiz(questions, responses),
    responses,
  };
}
