import { asObjectChoices } from "@/lib/quiz/parse";
import type { QuestionChoices, QuestionType } from "@/lib/quiz/types";

/** Placeholder patterns: {{b1}}, ___, ..., ______ */
export const INLINE_PLACEHOLDER_RE = /(\{\{([^}]+)\}\}|_{3,}|\.\.\.)/g;

export function promptHasInlinePlaceholders(promptText: string): boolean {
  return /\{\{[^}]+\}\}|_{3,}|\.\.\./.test(promptText);
}

/** Question types where the stem is rendered inside QuestionInput, not above it. */
export function questionEmbedsPrompt(
  questionType: QuestionType,
  choices: QuestionChoices,
  promptText: string
): boolean {
  const config = asObjectChoices(choices);

  switch (questionType) {
    case "inline_dropdown":
    case "multi_blank":
      return promptHasInlinePlaceholders(promptText);
    case "cloze":
      return Array.isArray(config?.segments) && (config.segments as unknown[]).length > 0;
    default:
      return false;
  }
}

export type ResolvedBlank = {
  id: string;
  options?: string[];
  inputType?: "text" | "dropdown";
};

/** Map placeholder occurrences in prompt to blank definitions (by id or sequential). */
export function resolveBlanksForPrompt(
  promptText: string,
  blanks: ResolvedBlank[]
): { parts: string[]; slots: ({ kind: "text"; value: string } | { kind: "blank"; blank: ResolvedBlank })[] } {
  const byId = new Map(blanks.map((b) => [b.id, b]));
  const slots: ({ kind: "text"; value: string } | { kind: "blank"; blank: ResolvedBlank })[] = [];
  let blankIndex = 0;

  const re = new RegExp(INLINE_PLACEHOLDER_RE.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(promptText)) !== null) {
    if (match.index > lastIndex) {
      slots.push({ kind: "text", value: promptText.slice(lastIndex, match.index) });
    }

    const token = match[0];
    const explicitId = match[2];
    let blank: ResolvedBlank | undefined;

    if (explicitId && byId.has(explicitId)) {
      blank = byId.get(explicitId);
    } else if (explicitId) {
      blank = { id: explicitId, inputType: "dropdown", options: [] };
    } else {
      blank = blanks[blankIndex] ?? { id: `b${blankIndex + 1}`, inputType: "text" };
      blankIndex += 1;
    }

    slots.push({ kind: "blank", blank: blank! });
    lastIndex = match.index + token.length;
  }

  if (lastIndex < promptText.length) {
    slots.push({ kind: "text", value: promptText.slice(lastIndex) });
  }

  return { parts: [], slots };
}
