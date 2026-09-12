import Anthropic from "@anthropic-ai/sdk";
import {
  asObjectChoices,
  asStringChoices,
  parseChoicesJson,
  resolveMultipleChoiceOptions,
} from "@/lib/quiz/parse";
import {
  orderingChoicesFromConfig,
  parseOrderingAnswerKey,
  parseOrderingChoices,
  sanitizeOrder,
} from "@/lib/quiz/ordering";
import {
  isAutogradableQuestionType,
  type AutogradableQuestionType,
  type QuestionChoices,
} from "@/lib/quiz/types";
import {
  VARIANT_COUNT,
  canonicalVariant,
  hashSeed,
  seededShuffle,
  shuffleAnswerOptions,
  type QuestionVariant,
  variantsToDbJson,
} from "@/lib/quiz/variants";

export type VariantSeed = {
  promptText: string;
  questionType: string;
  choices: QuestionChoices;
  answerKey: string | null;
};

type RawVariant = {
  promptText: string;
  choicesJson: string;
  answerKey: string;
};

const VARIANTS_SCHEMA = {
  type: "object",
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          promptText: { type: "string" },
          choicesJson: { type: "string" },
          answerKey: { type: "string" },
        },
        required: ["promptText", "choicesJson", "answerKey"],
        additionalProperties: false,
      },
    },
  },
  required: ["variants"],
  additionalProperties: false,
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function shuffleStringChoices(
  choices: QuestionChoices,
  offset: number
): QuestionChoices {
  const options = resolveMultipleChoiceOptions(choices) ?? asStringChoices(choices);
  if (!options || options.length < 2) return choices;
  return seededShuffle(options, offset + 1, true);
}

function shuffleOrderingChoices(choices: QuestionChoices, offset: number): QuestionChoices {
  const config = parseOrderingChoices(choices);
  if (!config || config.items.length < 2) return choices;
  const displayOrder = seededShuffle(config.items, offset + 11, true);
  return orderingChoicesFromConfig({ items: config.items, displayOrder });
}

function shuffleMatchingRight(choices: QuestionChoices, offset: number): QuestionChoices {
  const obj = asObjectChoices(choices);
  if (!obj) return choices;
  const left = Array.isArray(obj.left) ? obj.left.map(String) : null;
  const right = Array.isArray(obj.right) ? obj.right.map(String) : null;
  if (!left || !right || right.length < 2) return choices;
  return { ...obj, left, right: seededShuffle(right, offset + 23, true) };
}

function shuffleInlineDropdownOptions(
  choices: QuestionChoices,
  offset: number
): QuestionChoices {
  const obj = asObjectChoices(choices);
  if (!obj || !Array.isArray(obj.blanks)) return choices;
  const blanks = obj.blanks.map((blank, blankIndex) => {
    if (!blank || typeof blank !== "object") return blank;
    const b = blank as Record<string, unknown>;
    const options = Array.isArray(b.options) ? b.options.map(String) : [];
    if (options.length < 2) return blank;
    return { ...b, options: seededShuffle(options, offset + blankIndex * 17, true) };
  });
  return { ...obj, blanks };
}

/**
 * Deterministic surface change for a given offset — used as fallback when the
 * LLM returns too few / invalid paraphrases. Preserves answer semantics.
 */
export function deterministicVariantSurface(
  seed: VariantSeed,
  offset: number
): QuestionVariant {
  const type = seed.questionType;
  let choices = seed.choices;
  const answerKey = seed.answerKey;

  if (
    type === "multiple_choice" ||
    type === "multiple_select" ||
    type === "true_false"
  ) {
    choices = shuffleStringChoices(choices, offset);
  } else if (type === "ordering") {
    choices = shuffleOrderingChoices(choices, offset);
  } else if (type === "matching") {
    choices = shuffleMatchingRight(choices, offset);
  } else if (type === "inline_dropdown") {
    choices = shuffleInlineDropdownOptions(choices, offset);
  }

  return {
    promptText: seed.promptText,
    choices,
    answerKey,
  };
}

function answerCompatibleWithChoices(
  questionType: AutogradableQuestionType,
  choices: QuestionChoices,
  answerKey: string
): boolean {
  if (questionType === "multiple_choice" || questionType === "true_false") {
    const options = resolveMultipleChoiceOptions(choices) ?? asStringChoices(choices);
    if (!options || options.length === 0) return false;
    return options.some((c) => normalizeKey(c) === normalizeKey(answerKey));
  }
  if (questionType === "multiple_select") {
    const options = asStringChoices(choices);
    if (!options || options.length === 0) return false;
    try {
      const parsed = JSON.parse(answerKey) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) return false;
      return parsed.every((p) =>
        options.some((c) => normalizeKey(c) === normalizeKey(String(p)))
      );
    } catch {
      return false;
    }
  }
  if (questionType === "ordering") {
    const config = parseOrderingChoices(choices);
    const correct = parseOrderingAnswerKey(answerKey);
    if (!config || !correct) return false;
    return sanitizeOrder(correct, config.items).length === config.items.length;
  }
  return answerKey.trim().length > 0;
}

function normalizeAiVariant(
  seed: VariantSeed,
  raw: RawVariant
): QuestionVariant | null {
  if (!isAutogradableQuestionType(seed.questionType)) return null;
  const promptText = (raw.promptText ?? "").trim();
  if (!promptText) return null;

  let answerKey = (raw.answerKey ?? "").trim();
  if (!answerKey) answerKey = seed.answerKey?.trim() ?? "";
  if (!answerKey) return null;

  let choices = parseChoicesJson(raw.choicesJson);
  if (choices === null && seed.choices !== null) {
    choices = seed.choices;
  }

  const type = seed.questionType;

  if (type === "multiple_choice" || type === "true_false") {
    const options = resolveMultipleChoiceOptions(choices) ?? asStringChoices(choices);
    const seedOptions =
      resolveMultipleChoiceOptions(seed.choices) ?? asStringChoices(seed.choices);
    if (!options || options.length === 0) {
      choices = seed.choices;
    } else if (seedOptions && options.length === seedOptions.length) {
      const seedSet = new Set(seedOptions.map(normalizeKey));
      if (!options.every((o) => seedSet.has(normalizeKey(o)))) {
        choices = shuffleStringChoices(seed.choices, promptText.length % seedOptions.length || 1);
      }
      answerKey = seed.answerKey ?? answerKey;
    } else {
      answerKey = seed.answerKey ?? answerKey;
    }
  } else if (type === "multiple_select") {
    answerKey = seed.answerKey ?? answerKey;
    const options = asStringChoices(choices);
    const seedOptions = asStringChoices(seed.choices);
    if (!options || !seedOptions || options.length !== seedOptions.length) {
      choices = shuffleStringChoices(seed.choices, promptText.length % 3 || 1);
    }
  } else if (type === "ordering") {
    answerKey = seed.answerKey ?? answerKey;
    const config = parseOrderingChoices(choices);
    const seedConfig = parseOrderingChoices(seed.choices);
    if (!config || !seedConfig) {
      choices = seed.choices;
    } else {
      choices = orderingChoicesFromConfig({
        items: seedConfig.items,
        displayOrder: sanitizeOrder(config.displayOrder, seedConfig.items),
      });
    }
  } else {
    choices = seed.choices;
    answerKey = seed.answerKey ?? answerKey;
  }

  if (!answerCompatibleWithChoices(type, choices, answerKey)) {
    return null;
  }

  return { promptText, choices, answerKey };
}

async function fetchAiVariants(seed: VariantSeed): Promise<QuestionVariant[]> {
  if (!seed.promptText.trim()) return [];
  if (!isAutogradableQuestionType(seed.questionType)) return [];

  const client = new Anthropic();
  const needed = VARIANT_COUNT - 1;

  const response = await client.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      output_config: { format: { type: "json_schema", schema: VARIANTS_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Create exactly ${needed} student-facing variants of this quiz question.

Rules:
- Preserve questionType "${seed.questionType}" and the underlying correct answer.
- Lightly reword the prompt (synonyms, sentence structure) without changing meaning or difficulty.
- For multiple_choice / multiple_select / true_false: keep the SAME option texts, but MUST shuffle their display order differently for EVERY variant. answerKey must be the exact correct option text (or JSON array of texts for multiple_select) from the seed.
- For ordering: keep the same items and correct sequence in answerKey; MUST use a different shuffled displayOrder for every variant.
- For matching / categorization / inline_dropdown: keep answer mappings; MUST shuffle the student-facing option/item order.
- For other types: keep choicesJson and answerKey identical to the seed; only paraphrase promptText.
- choicesJson is ALWAYS a JSON-encoded string (use "null" when choices are null).
- Do NOT invent new facts, numbers, or answers.
- Each variant's option order must differ from the seed and from the other variants when possible.

Seed question:
${JSON.stringify(
  {
    promptText: seed.promptText,
    questionType: seed.questionType,
    choices: seed.choices,
    answerKey: seed.answerKey,
  },
  null,
  2
)}

Return { "variants": [ ... exactly ${needed} objects ... ] }.`,
        },
      ],
    },
    { timeout: 2 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `Variant generation returned no text (stop_reason: ${response.stop_reason ?? "unknown"})`
    );
  }

  const parsed = JSON.parse(textBlock.text) as { variants: RawVariant[] };
  const out: QuestionVariant[] = [];
  for (const raw of parsed.variants ?? []) {
    const normalized = normalizeAiVariant(seed, raw);
    if (normalized) out.push(normalized);
  }
  return out;
}

/**
 * Build a full pool of VARIANT_COUNT versions: index 0 = canonical seed,
 * indices 1..n-1 from Claude (padded with deterministic shuffles if needed).
 * Returns [] when the seed is not eligible.
 */
export async function generateQuestionVariants(
  seed: VariantSeed
): Promise<QuestionVariant[]> {
  if (!seed.promptText.trim()) return [];
  if (!isAutogradableQuestionType(seed.questionType)) return [];

  const canonical = canonicalVariant(seed);
  let ai: QuestionVariant[] = [];
  try {
    ai = await fetchAiVariants(seed);
  } catch (error) {
    console.warn(
      "generateQuestionVariants: Claude call failed, using deterministic fallbacks:",
      error instanceof Error ? error.message : error
    );
  }

  const pool: QuestionVariant[] = [canonical];
  for (const variant of ai) {
    if (pool.length >= VARIANT_COUNT) break;
    const samePrompt =
      normalizeKey(variant.promptText) === normalizeKey(canonical.promptText);
    const sameChoices =
      JSON.stringify(variant.choices) === JSON.stringify(canonical.choices);
    if (samePrompt && sameChoices) continue;
    // Always force a distinct option order for this pool slot.
    const slot = pool.length;
    pool.push({
      ...variant,
      choices: shuffleAnswerOptions(
        seed.questionType,
        variant.choices,
        hashSeed(`gen:${seed.promptText.slice(0, 48)}:${slot}`)
      ),
    });
  }

  let offset = 1;
  while (pool.length < VARIANT_COUNT) {
    const slot = pool.length;
    const surface = deterministicVariantSurface(seed, offset);
    pool.push({
      ...surface,
      choices: shuffleAnswerOptions(
        seed.questionType,
        surface.choices,
        hashSeed(`fallback:${seed.promptText.slice(0, 48)}:${slot}`)
      ),
    });
    offset += 1;
  }

  return pool.slice(0, VARIANT_COUNT);
}

/** DB-ready jsonb payload, or null when generation yields no pool. */
export async function generateQuestionVariantsForDb(
  seed: VariantSeed
): Promise<unknown[] | null> {
  const pool = await generateQuestionVariants(seed);
  if (pool.length !== VARIANT_COUNT) return null;
  return variantsToDbJson(pool);
}
