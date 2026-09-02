import Anthropic from "@anthropic-ai/sdk";
import type { QuestionType } from "@/lib/quiz/types";

export type BuiltQuizQuestion = {
  position: number;
  promptText: string;
  questionType: QuestionType;
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

function normalizeBuiltQuestion(raw: BuiltQuizQuestion): BuiltQuizQuestion {
  let { questionType, choices, answerKey } = raw;
  const key = answerKey ?? "";

  if (questionType === "true_false") {
    choices = choices && choices.length >= 2 ? choices : ["True", "False"];
    if (key && !choices.some((c) => normalizeKey(c) === normalizeKey(key))) {
      const letter = key.trim().toLowerCase();
      if (letter === "t" || letter === "true") answerKey = "True";
      else if (letter === "f" || letter === "false") answerKey = "False";
    }
  }

  if (questionType === "multiple_select" && choices && choices.length > 0 && key) {
    try {
      const parsed = JSON.parse(key) as unknown;
      if (Array.isArray(parsed)) {
        answerKey = JSON.stringify(parsed.map(String));
      } else {
        const parts = key.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
        answerKey = JSON.stringify(parts);
      }
    } catch {
      const parts = key.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
      answerKey = JSON.stringify(parts);
    }
  }

  if (questionType === "multiple_choice" && choices && choices.length > 0 && key) {
    const letterMatch = key.trim().match(/^[\(\[]?\s*([A-Ea-e])\s*[\)\].:\-\s]*$/);
    if (letterMatch) {
      const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < choices.length) answerKey = choices[idx]!;
    }
  }

  return { ...raw, choices, answerKey: answerKey ?? key };
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Uses an LLM to turn raw quiz/assignment source content into structured,
 * auto-gradable question rows (prompt, type, choices, answer key).
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
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: QUESTIONS_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            ...contentBlocks,
            {
              type: "text",
              text: `This is a quiz, homework, or problem-set file ("${fileName}") from the course "${course.title}" (${course.department}). Read the full source above and produce structured, auto-gradable quiz questions a student can answer interactively in a web app.

Rules:
- Extract EVERY question that can be auto-graded. Skip purely instructional cover pages with no questions.
- Use ONLY these questionType values (all are auto-graded):
  - "multiple_choice": exactly one correct option. "choices" must list every option as plain text (without letter prefixes like "A)" — strip those). "answerKey" must be the exact text of the one correct choice.
  - "short_answer": a brief factual answer (one word, number, or short phrase). "choices" must be null. "answerKey" is the exact expected answer (case-insensitive match).
  - "true_false": a true/false statement. "choices" must be ["True", "False"]. "answerKey" must be exactly "True" or "False".
  - "multiple_select": two or more correct options from a list. "choices" lists every option. "answerKey" must be a JSON array string of the exact correct choice texts, e.g. "[\\"Option A\\",\\"Option C\\"]".
- Do NOT emit "free_response" or essay questions — omit anything that cannot be auto-graded from an answer key in the source.
- "promptText": the full question wording a student sees (include any necessary context from the source, but do not copy entire unrelated paragraphs).
- "answerKey": required for every question — pull from the source when present; if the source omits it but the answer is unambiguous (e.g. simple computation), derive it and set needsReview true.
- "needsReview": true when you inferred the answer key, paraphrased heavily, or are unsure — false when verbatim from the source.
- "position": 1-based order matching the source.

Return complete, student-ready questions — each must have a promptText, questionType, and answerKey so the app can render inputs and grade automatically.`,
            },
          ],
        },
      ],
    },
    { timeout: 3 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Quiz question build returned no text content");
  }

  const parsed = JSON.parse(textBlock.text) as { questions: BuiltQuizQuestion[] };
  return (parsed.questions ?? [])
    .sort((a, b) => a.position - b.position)
    .map(normalizeBuiltQuestion);
}
