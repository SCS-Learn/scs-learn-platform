import { asObjectChoices } from "@/lib/quiz/parse";
import type { QuestionChoices } from "@/lib/quiz/types";

export type InlineDropdownBlank = {
  id: string;
  options: string[];
};

export type InlineDropdownConfig = {
  blanks: InlineDropdownBlank[];
};

export function parseInlineDropdownChoices(choices: QuestionChoices): InlineDropdownConfig | null {
  const config = asObjectChoices(choices);
  if (!config || !Array.isArray(config.blanks)) return null;

  const blanks = (config.blanks as { id?: string; options?: unknown }[])
    .map((blank, index) => ({
      id: typeof blank.id === "string" && blank.id.trim() ? blank.id.trim() : `b${index + 1}`,
      options: Array.isArray(blank.options)
        ? blank.options.map((opt) => String(opt).trim()).filter(Boolean)
        : [],
    }))
    .filter((blank) => blank.id);

  return blanks.length > 0 ? { blanks } : null;
}

export function inlineDropdownChoicesFromConfig(config: InlineDropdownConfig): QuestionChoices {
  return {
    blanks: config.blanks.map((blank) => ({
      id: blank.id,
      options: blank.options,
    })),
  };
}

export function parseInlineDropdownAnswerKey(answerKey: string): Record<string, string> {
  try {
    const parsed = JSON.parse(answerKey) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function encodeInlineDropdownAnswerKey(answers: Record<string, string>): string {
  return JSON.stringify(answers);
}

export function defaultInlineDropdownConfig(): InlineDropdownConfig {
  return {
    blanks: [{ id: "b1", options: ["Option A", "Option B"] }],
  };
}

export function nextBlankId(blanks: InlineDropdownBlank[]): string {
  const used = new Set(blanks.map((b) => b.id));
  for (let i = 1; i <= blanks.length + 1; i += 1) {
    const id = `b${i}`;
    if (!used.has(id)) return id;
  }
  return `b${blanks.length + 1}`;
}
