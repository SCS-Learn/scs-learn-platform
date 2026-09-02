import { isAutogradableQuestionType, type QuizQuestionFields } from "@/lib/quiz/types";

export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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

  return normalize(response) === normalize(question.answerKey);
}

export function encodeMultipleSelectResponse(selected: string[]): string {
  return JSON.stringify([...selected].sort());
}

export function decodeMultipleSelectResponse(response: string): string[] {
  return parseJsonStringArray(response) ?? [];
}
