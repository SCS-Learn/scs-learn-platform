import type { QuestionChoices } from "@/lib/quiz/types";

/** Number of student-facing versions per question when variants are generated. */
export const VARIANT_COUNT = 10;

export type QuestionVariant = {
  promptText: string;
  choices: QuestionChoices;
  answerKey: string | null;
};

export type QuestionWithVariants = {
  id: string;
  promptText: string;
  choices: QuestionChoices;
  answerKey: string | null;
  questionType: string;
  variants?: QuestionVariant[];
};

/** True when the question has a full rotation pool. */
export function hasVariantPool(variants: QuestionVariant[] | null | undefined): boolean {
  return Array.isArray(variants) && variants.length === VARIANT_COUNT;
}

export function parseVariants(raw: unknown): QuestionVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: QuestionVariant[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const promptText =
      typeof row.prompt_text === "string"
        ? row.prompt_text
        : typeof row.promptText === "string"
          ? row.promptText
          : null;
    if (promptText === null) continue;
    const answerKey =
      row.answer_key === null || row.answer_key === undefined
        ? row.answerKey === null || row.answerKey === undefined
          ? null
          : String(row.answerKey)
        : String(row.answer_key);
    const choices = ("choices" in row ? row.choices : null) as QuestionChoices;
    out.push({ promptText, choices, answerKey });
  }
  return out;
}

/** Serialize for DB jsonb (snake_case keys matching other question columns). */
export function variantsToDbJson(variants: QuestionVariant[]): unknown[] {
  return variants.map((v) => ({
    prompt_text: v.promptText,
    choices: v.choices,
    answer_key: v.answerKey,
  }));
}

export function canonicalVariant(question: {
  promptText: string;
  choices: QuestionChoices;
  answerKey: string | null;
}): QuestionVariant {
  return {
    promptText: question.promptText,
    choices: question.choices,
    answerKey: question.answerKey,
  };
}

export function clampVariantIndex(index: number, poolSize: number): number {
  if (poolSize <= 0) return 0;
  const n = Math.trunc(index);
  return ((n % poolSize) + poolSize) % poolSize;
}

export function nextVariantIndex(current: number, poolSize: number): number {
  if (poolSize <= 1) return 0;
  return clampVariantIndex(current + 1, poolSize);
}

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string → 32-bit seed. */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Fisher–Yates shuffle with a deterministic seed.
 * When `avoidIdentity` is true and length > 1, re-roll until the order differs
 * from the input (or a small attempt limit is hit).
 */
export function seededShuffle<T>(
  items: T[],
  seed: number,
  avoidIdentity = false
): T[] {
  if (items.length <= 1) return [...items];

  const shuffleOnce = (s: number): T[] => {
    const out = [...items];
    const rand = mulberry32(s >>> 0);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  };

  let result = shuffleOnce(seed);
  if (!avoidIdentity) return result;

  const sameOrder = (a: T[], b: T[]) => a.every((v, i) => v === b[i]);
  let attempt = 0;
  while (sameOrder(result, items) && attempt < 8) {
    attempt += 1;
    result = shuffleOnce(seed + attempt * 0x9e3779b9);
  }
  if (sameOrder(result, items)) {
    // Guaranteed non-identity for length >= 2: rotate by 1.
    return [...items.slice(1), items[0]!];
  }
  return result;
}

/** Reorder quiz questions for a given variant index (index 0 = original order). */
export function shuffleQuestionOrder<T extends { id: string }>(
  questions: T[],
  variantIndex: number
): T[] {
  if (questions.length < 2 || variantIndex <= 0) return [...questions];
  const seed = hashSeed(`quiz-order:${variantIndex}:${questions.map((q) => q.id).join(",")}`);
  return seededShuffle(questions, seed, true);
}

/**
 * Shuffle answer-option / display order for selection-style questions.
 * Preserves answerKey semantics (option text / mappings stay the same).
 */
export function shuffleAnswerOptions(
  questionType: string,
  choices: QuestionChoices,
  seed: number
): QuestionChoices {
  if (!choices) return choices;

  if (Array.isArray(choices) && choices.every((c) => typeof c === "string")) {
    if (choices.length < 2) return choices;
    return seededShuffle(choices, seed, true);
  }

  if (typeof choices !== "object" || Array.isArray(choices)) return choices;
  const obj = { ...choices };

  if (questionType === "ordering") {
    const items = Array.isArray(obj.items) ? obj.items.map(String) : [];
    if (items.length < 2) return choices;
    const displayOrder = seededShuffle(items, seed, true);
    return { ...obj, items, displayOrder };
  }

  if (questionType === "matching") {
    const left = Array.isArray(obj.left) ? obj.left.map(String) : [];
    const right = Array.isArray(obj.right) ? obj.right.map(String) : [];
    if (right.length < 2) return choices;
    return { ...obj, left, right: seededShuffle(right, seed, true) };
  }

  if (questionType === "categorization") {
    const items = Array.isArray(obj.items) ? obj.items.map(String) : [];
    if (items.length < 2) return choices;
    return { ...obj, items: seededShuffle(items, seed + 1, true) };
  }

  if (questionType === "inline_dropdown" && Array.isArray(obj.blanks)) {
    const blanks = obj.blanks.map((blank, blankIndex) => {
      if (!blank || typeof blank !== "object") return blank;
      const b = blank as Record<string, unknown>;
      const options = Array.isArray(b.options) ? b.options.map(String) : [];
      if (options.length < 2) return blank;
      return {
        ...b,
        options: seededShuffle(options, seed + blankIndex * 17, true),
      };
    });
    return { ...obj, blanks };
  }

  if (questionType === "hottext") {
    const terms = Array.isArray(obj.terms) ? obj.terms.map(String) : [];
    if (terms.length < 2) return choices;
    return { ...obj, terms: seededShuffle(terms, seed, true) };
  }

  if (Array.isArray(obj.options) && obj.options.every((o) => typeof o === "string")) {
    const options = obj.options as string[];
    if (options.length < 2) return choices;
    return { ...obj, options: seededShuffle(options, seed, true) };
  }

  return choices;
}

/**
 * Apply the active variant surface onto a question. When there is no full
 * pool, returns the question unchanged (canonical columns).
 * For index > 0, also re-shuffles answer option order.
 */
export function applyQuestionVariant<T extends QuestionWithVariants>(
  question: T,
  variantIndex: number
): T {
  const pool = question.variants;
  if (!hasVariantPool(pool)) return question;

  const index = clampVariantIndex(variantIndex, pool!.length);
  const variant = pool![index]!;
  let choices = variant.choices;
  if (index > 0) {
    choices = shuffleAnswerOptions(
      question.questionType,
      choices,
      hashSeed(`${question.id}:opts:${index}`)
    );
  }
  return {
    ...question,
    promptText: variant.promptText,
    choices,
    answerKey: variant.answerKey,
  };
}

/**
 * Apply per-question variant surfaces, then (for index > 0) reorder questions.
 */
export function applyQuestionVariants<T extends QuestionWithVariants>(
  questions: T[],
  variantIndex: number
): T[] {
  const poolSize = quizVariantPoolSize(questions);
  const index = poolSize <= 1 ? 0 : clampVariantIndex(variantIndex, poolSize);
  const surfaced = questions.map((q) => applyQuestionVariant(q, index));
  return shuffleQuestionOrder(surfaced, index);
}

/** Pool size for a quiz: VARIANT_COUNT if any question has a full pool; else 1. */
export function quizVariantPoolSize(questions: QuestionWithVariants[]): number {
  const withPools = questions.filter((q) => hasVariantPool(q.variants));
  if (withPools.length === 0) return 1;
  return VARIANT_COUNT;
}
