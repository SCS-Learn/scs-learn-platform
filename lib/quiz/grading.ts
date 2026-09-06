import { isAutogradableQuestionType, type QuizQuestionFields } from "@/lib/quiz/types";

export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Trim and collapse whitespace before regex matching. Case is handled by the pattern. */
export function normalizeShortAnswer(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when the stored value likely uses intentional regex syntax. */
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

/** Resolve stored answer text into a regex source string (escaped literal or intentional pattern). */
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

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => normalize(value) === normalize(b[index] ?? ""));
}

export function isCorrect(question: QuizQuestionFields, response: string): boolean {
  if (!question.answerKey) return false;

  if (question.questionType === "multiple_select") {
    const expected = parseJsonStringArray(question.answerKey);
    const actual = parseJsonStringArray(response);
    if (!expected || !actual) return false;
    return arraysEqual(expected, actual);
  }

  if (question.questionType === "short_answer") {
    return matchesShortAnswer(response, question.answerKey);
  }

  return normalize(response) === normalize(question.answerKey);
}

export function encodeMultipleSelectResponse(selected: string[]): string {
  return JSON.stringify([...selected].sort());
}

export function decodeMultipleSelectResponse(response: string): string[] {
  return parseJsonStringArray(response) ?? [];
}
