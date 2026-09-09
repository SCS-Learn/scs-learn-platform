import { asObjectChoices, parseJson } from "@/lib/quiz/parse";
import type { QuestionChoices } from "@/lib/quiz/types";

export type MatchingConfig = { left: string[]; right: string[] };
export type CategorizationConfig = { categories: string[]; items: string[] };
export type ChoiceGridConfig = { rows: string[]; cols: string[]; options: string[] };
export type HottextConfig = { passage: string; terms: string[] };

export function parseMatchingChoices(choices: QuestionChoices): MatchingConfig | null {
  const config = asObjectChoices(choices);
  if (!config) return null;
  const left = Array.isArray(config.left) ? config.left.map(String).filter(Boolean) : [];
  const right = Array.isArray(config.right) ? config.right.map(String).filter(Boolean) : [];
  return left.length > 0 || right.length > 0 ? { left, right } : null;
}

export function matchingChoicesFromConfig(config: MatchingConfig): QuestionChoices {
  return { left: config.left, right: config.right };
}

export function parseMappingAnswerKey(answerKey: string): Record<string, string> {
  const parsed = parseJson<Record<string, unknown>>(answerKey);
  if (!parsed || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function parseCategorizationChoices(choices: QuestionChoices): CategorizationConfig | null {
  const config = asObjectChoices(choices);
  if (!config) return null;
  const categories = Array.isArray(config.categories)
    ? config.categories.map(String).filter(Boolean)
    : [];
  const items = Array.isArray(config.items) ? config.items.map(String).filter(Boolean) : [];
  return categories.length > 0 || items.length > 0 ? { categories, items } : null;
}

export function categorizationChoicesFromConfig(config: CategorizationConfig): QuestionChoices {
  return { categories: config.categories, items: config.items };
}

export function parseChoiceGridChoices(choices: QuestionChoices): ChoiceGridConfig | null {
  const config = asObjectChoices(choices);
  if (!config) return null;
  const rows = Array.isArray(config.rows) ? config.rows.map(String).filter(Boolean) : [];
  const cols = Array.isArray(config.cols) ? config.cols.map(String).filter(Boolean) : [];
  const options = Array.isArray(config.options) ? config.options.map(String).filter(Boolean) : [];
  return rows.length > 0 ? { rows, cols, options } : null;
}

export function choiceGridChoicesFromConfig(config: ChoiceGridConfig): QuestionChoices {
  return { rows: config.rows, cols: config.cols, options: config.options };
}

export function parseChoiceGridAnswerKey(answerKey: string): Record<string, Record<string, string>> {
  const parsed = parseJson<Record<string, Record<string, unknown>>>(answerKey);
  if (!parsed || Array.isArray(parsed)) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [row, cols] of Object.entries(parsed)) {
    if (!cols || typeof cols !== "object" || Array.isArray(cols)) continue;
    out[row] = {};
    for (const [col, value] of Object.entries(cols)) {
      out[row][col] = String(value);
    }
  }
  return out;
}

export function parseHottextChoices(choices: QuestionChoices): HottextConfig | null {
  const config = asObjectChoices(choices);
  if (!config) return null;
  const passage = typeof config.passage === "string" ? config.passage : "";
  const terms = Array.isArray(config.terms) ? config.terms.map(String).filter(Boolean) : [];
  return { passage, terms };
}

export function hottextChoicesFromConfig(config: HottextConfig): QuestionChoices {
  return { passage: config.passage, terms: config.terms };
}

export function parseHottextAnswerKey(answerKey: string): string[] {
  const parsed = parseJson<string[]>(answerKey);
  return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
}

export function parseVectorAnswerKey(answerKey: string): { vector: number[] } | null {
  const parsed = parseJson<{ vector?: unknown }>(answerKey);
  if (!parsed || !Array.isArray(parsed.vector)) return null;
  const vector = parsed.vector.map(Number).filter((n) => Number.isFinite(n));
  return vector.length > 0 ? { vector } : null;
}

export function parseSignificantFiguresAnswerKey(
  answerKey: string
): { value: number; sigFigs: number } | null {
  const parsed = parseJson<{ value?: unknown; sigFigs?: unknown }>(answerKey);
  if (!parsed) return null;
  const value = Number(parsed.value);
  const sigFigs = Number(parsed.sigFigs);
  if (!Number.isFinite(value) || !Number.isFinite(sigFigs) || sigFigs < 1) return null;
  return { value, sigFigs: Math.round(sigFigs) };
}

export function parseMatrixWholeAnswerKey(answerKey: string): number[][] | null {
  const parsed = parseJson<{ matrix?: unknown }>(answerKey);
  if (!parsed || !Array.isArray(parsed.matrix)) return null;
  const matrix = parsed.matrix.map((row) =>
    Array.isArray(row) ? row.map(Number).filter((n) => Number.isFinite(n)) : []
  );
  return matrix.length > 0 ? matrix : null;
}

export function parseMatrixPerCellAnswerKey(
  answerKey: string
): Record<string, number> | null {
  const parsed = parseJson<{ cells?: unknown }>(answerKey);
  if (!parsed || !parsed.cells || typeof parsed.cells !== "object" || Array.isArray(parsed.cells)) {
    return null;
  }
  const cells: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed.cells as Record<string, unknown>)) {
    const n = Number(value);
    if (Number.isFinite(n)) cells[key] = n;
  }
  return Object.keys(cells).length > 0 ? cells : null;
}

export function updateStringList(list: string[], index: number, value: string): string[] {
  const next = [...list];
  next[index] = value;
  return next;
}

export function removeFromStringList(list: string[], index: number, min = 1): string[] {
  if (list.length <= min) return list;
  return list.filter((_, i) => i !== index);
}
