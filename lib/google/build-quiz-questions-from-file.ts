import Anthropic from "@anthropic-ai/sdk";
import { AUTOGRADABLE_QUESTION_TYPES, type AutogradableQuestionType } from "@/lib/quiz/types";

export type BuiltQuizQuestion = {
  position: number;
  promptText: string;
  questionType: AutogradableQuestionType;
  choices: string[] | null;
  answerKey: string | null;
  needsReview: boolean;
};

const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "integer" },
          promptText: { type: "string" },
          questionType: {
            type: "string",
            enum: ["multiple_choice", "short_answer", "true_false", "multiple_select"],
          },
          choices: {
            type: ["array", "null"],
            items: { type: "string" },
          },
          answerKey: { type: "string" },
          needsReview: { type: "boolean" },
        },
        required: ["position", "promptText", "questionType", "choices", "answerKey", "needsReview"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

type ContentBlock =
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "text"; text: string };

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeBuiltQuestion(raw: BuiltQuizQuestion): BuiltQuizQuestion | null {
  let { questionType, choices, answerKey, needsReview } = raw;
  if (!(AUTOGRADABLE_QUESTION_TYPES as string[]).includes(questionType)) return null;

  let key = (answerKey ?? "").trim();
  if (!key) return null;

  if (questionType === "true_false") {
    choices = choices && choices.length >= 2 ? choices : ["True", "False"];
    if (!choices.some((c) => normalizeKey(c) === normalizeKey(key))) {
      const letter = key.toLowerCase();
      if (letter === "t" || letter === "true") key = "True";
      else if (letter === "f" || letter === "false") key = "False";
      else return null;
    }
  }

  if (questionType === "multiple_select") {
    if (!choices || choices.length === 0) return null;
    try {
      const parsed = JSON.parse(key) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        key = JSON.stringify(parsed.map(String));
      } else {
        const parts = key.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length === 0) return null;
        key = JSON.stringify(parts);
      }
    } catch {
      const parts = key.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) return null;
      key = JSON.stringify(parts);
    }
  }

  if (questionType === "multiple_choice") {
    if (!choices || choices.length === 0) return null;
    const letterMatch = key.match(/^[\(\[]?\s*([A-Ea-e])\s*[\)\].:\-\s]*$/);
    if (letterMatch) {
      const idx = letterMatch[1]!.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < choices.length) key = choices[idx]!;
    }
    if (!choices.some((c) => normalizeKey(c) === normalizeKey(key))) return null;
  }

  if (questionType === "short_answer") {
    choices = null;
    const normalized = key.trim().toLowerCase().replace(/\s+/g, " ");
    const words = normalized.split(" ").filter(Boolean);
    if (words.length < 1 || words.length > 2) return null;
    key = normalized;
  }

  return {
    ...raw,
    questionType,
    choices,
    answerKey: key,
    needsReview,
  };
}

/**
 * Uses an LLM to turn quiz/assignment source content into auto-gradable
 * question rows. Open-ended / free-response items are omitted — an empty
 * result means no auto-gradable questions were found.
 */
export async function buildQuizQuestionsFromContent(
  course: { title: string; department: string },
  fileName: string,
  contentBlocks: ContentBlock[]
): Promise<BuiltQuizQuestion[]> {
  if (contentBlocks.length === 0) return [];

  const client = new Anthropic();

  const response = await client.messages.create(
    {
      model: "claude-opus-5",
      max_tokens: 32000,
      output_config: { format: { type: "json_schema", schema: QUESTIONS_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            ...contentBlocks,
            {
              type: "text",
              text: `This is a quiz, homework, exam, or practice-problem file ("${fileName}") from the course "${course.title}" (${course.department}). Read the source above and extract ONLY auto-gradable questions a student can answer interactively.

ONLY these questionType values are allowed:
- "multiple_choice": exactly one correct option. "choices" = option texts without letter prefixes. "answerKey" = exact correct choice text.
- "short_answer": exactly one or two words only, all lowercase, space allowed between words (e.g. "overlap" or "de bruijn"). "choices" = null. "answerKey" = that 1–2 word answer. Omit the question if the answer would need more than two words.
- "true_false": "choices" = ["True","False"]. "answerKey" = "True" or "False".
- "multiple_select": two or more correct options. "choices" = all options. "answerKey" = JSON array string of the correct choice texts.

Rules:
- Every question MUST have a usable answerKey from the source (or an unambiguous derivation). If you cannot determine the answer, OMIT the question.
- Do NOT invent free-response / essay / open-ended / coding / prove-style questions. If the file only has those, return an empty "questions" array.
- "promptText": full student-facing wording.
- "needsReview": true when you inferred the answer or are unsure — false when verbatim from the source.
- "position": 1-based order matching the source.

Empty "questions" is the correct outcome when no auto-gradable items exist.`,
            },
          ],
        },
      ],
    },
    { timeout: 5 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `Quiz question build returned no text content (stop_reason: ${response.stop_reason ?? "unknown"})`
    );
  }

  const parsed = JSON.parse(textBlock.text) as { questions: BuiltQuizQuestion[] };
  return (parsed.questions ?? [])
    .filter((q) => q.promptText?.trim())
    .sort((a, b) => a.position - b.position)
    .map(normalizeBuiltQuestion)
    .filter((q): q is BuiltQuizQuestion => q !== null);
}
