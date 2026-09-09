import Anthropic from "@anthropic-ai/sdk";
import { isValidShortAnswer, normalizeShortAnswer } from "@/lib/quiz/grading";
import { parseChoicesJson, asStringChoices } from "@/lib/quiz/parse";
import {
  orderingChoicesFromConfig,
  parseOrderingAnswerKey,
  parseOrderingChoices,
  sanitizeOrder,
  shuffledDisplayOrder,
} from "@/lib/quiz/ordering";
import {
  AUTOGRADABLE_QUESTION_TYPES,
  type AutogradableQuestionType,
  type QuestionChoices,
} from "@/lib/quiz/types";

export type BuiltQuizQuestion = {
  position: number;
  promptText: string;
  questionType: AutogradableQuestionType;
  choices: QuestionChoices;
  answerKey: string | null;
  needsReview: boolean;
};

/** Raw shape from the LLM — choicesJson avoids invalid object schemas in structured output. */
type RawBuiltQuizQuestion = {
  position: number;
  promptText: string;
  questionType: AutogradableQuestionType;
  choicesJson: string;
  answerKey: string;
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
            enum: AUTOGRADABLE_QUESTION_TYPES,
          },
          choicesJson: { type: "string" },
          answerKey: { type: "string" },
          needsReview: { type: "boolean" },
        },
        required: [
          "position",
          "promptText",
          "questionType",
          "choicesJson",
          "answerKey",
          "needsReview",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

const STRING_ARRAY_CHOICE_TYPES = new Set<AutogradableQuestionType>([
  "multiple_choice",
  "multiple_select",
  "true_false",
]);

const PLAIN_ANSWER_TYPES = new Set<AutogradableQuestionType>([
  "short_answer",
  "symbolic_expression",
  "equation_input",
]);

type ContentBlock =
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "text"; text: string };

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeBuiltQuestion(raw: RawBuiltQuizQuestion): BuiltQuizQuestion | null {
  const { questionType, needsReview, promptText, position } = raw;
  if (!(AUTOGRADABLE_QUESTION_TYPES as string[]).includes(questionType)) return null;

  let key = (raw.answerKey ?? "").trim();
  if (!key) return null;

  let choices = parseChoicesJson(raw.choicesJson);
  const stringChoices = asStringChoices(choices);

  if (questionType === "true_false") {
    choices = stringChoices && stringChoices.length >= 2 ? stringChoices : ["True", "False"];
    const tfChoices = asStringChoices(choices)!;
    if (!tfChoices.some((c) => normalizeKey(c) === normalizeKey(key))) {
      const letter = key.toLowerCase();
      if (letter === "t" || letter === "true") key = "True";
      else if (letter === "f" || letter === "false") key = "False";
      else return null;
    }
  }

  if (questionType === "multiple_select") {
    if (!stringChoices || stringChoices.length === 0) return null;
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
    const options =
      stringChoices ??
      (choices && typeof choices === "object" && !Array.isArray(choices)
        ? (choices as { options?: string[] }).options
        : null);
    if (!options || options.length === 0) return null;
    choices = options;
    const letterMatch = key.match(/^[\(\[]?\s*([A-Ea-e])\s*[\)\].:\-\s]*$/);
    if (letterMatch) {
      const idx = letterMatch[1]!.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) key = options[idx]!;
    }
    if (!options.some((c) => normalizeKey(c) === normalizeKey(key))) {
      return null;
    }
  }

  if (questionType === "ordering") {
    const config = parseOrderingChoices(choices);
    if (!config || config.items.length < 2) return null;
    const correct = parseOrderingAnswerKey(key);
    if (!correct || correct.length < 2) return null;
    const sanitizedCorrect = sanitizeOrder(correct, config.items);
    let displayOrder = sanitizeOrder(config.displayOrder, config.items);
    if (
      displayOrder.length === sanitizedCorrect.length &&
      displayOrder.every((v, i) => v === sanitizedCorrect[i])
    ) {
      displayOrder = shuffledDisplayOrder(config.items, sanitizedCorrect);
    }
    choices = orderingChoicesFromConfig({ items: config.items, displayOrder });
    key = JSON.stringify(sanitizedCorrect);
  }

  if (PLAIN_ANSWER_TYPES.has(questionType)) {
    choices = null;
    const trimmed = normalizeShortAnswer(key);
    if (!isValidShortAnswer(trimmed)) return null;
    key = trimmed;
  }

  if (STRING_ARRAY_CHOICE_TYPES.has(questionType) && questionType !== "multiple_choice" && questionType !== "multiple_select" && questionType !== "true_false") {
    if (!stringChoices || stringChoices.length === 0) return null;
  }

  if (!PLAIN_ANSWER_TYPES.has(questionType) && !STRING_ARRAY_CHOICE_TYPES.has(questionType)) {
    if (
      questionType !== "multiple_choice" &&
      questionType !== "multiple_select" &&
      questionType !== "true_false" &&
      questionType !== "short_answer"
    ) {
      if (!isValidJson(key)) return null;
    }
  }

  return {
    position,
    promptText,
    questionType,
    choices,
    answerKey: key,
    needsReview,
  };
}

const IMPORT_PROMPT = `Read the source and extract ONLY auto-gradable questions a student can answer interactively.

Use any of these questionType values — pick the best fit for each item's format:

Selection & arrangement:
- multiple_choice: one correct option. choicesJson = JSON array of option texts. answerKey = exact correct option text.
- true_false: choicesJson = ["True","False"]. answerKey = "True" or "False".
- multiple_select: choicesJson = all options. answerKey = JSON array string of correct option texts.
- inline_dropdown: promptText MUST include {{b1}}, {{b2}}, etc. matching blank ids. choicesJson = {"blanks":[{"id":"b1","options":["a","b"]}]}. answerKey = JSON object mapping blank id → correct option.
- multi_blank: promptText MUST include {{b1}}, {{b2}}, or ___ for each blank. choicesJson = {"blankIds":["b1","b2"]}. answerKey = JSON object blankId→answer.
- matching: choicesJson = {"left":["L1"],"right":["R1"]}. answerKey = JSON object mapping left → right.
- categorization: choicesJson = {"categories":["Cat A"],"items":["Item 1"]}. answerKey = JSON object mapping item → category.
- ordering: choicesJson = {"items":["Step A","Step B","Step C"],"displayOrder":["Step C","Step A","Step B"]} (displayOrder = shuffled order shown to student). answerKey = JSON array of correct sequence e.g. ["Step A","Step B","Step C"]. Legacy: choicesJson may be a JSON array of items — displayOrder will be auto-shuffled if it matches the answer.
- hottext: choicesJson = {"passage":"...","terms":["word1"]}. answerKey = JSON array of correct highlighted terms.
- choice_grid: choicesJson = {"rows":["R1"],"cols":["C1"],"options":["O1"]}. answerKey = JSON object row→{col:option}.

Text entry:
- short_answer: choicesJson = "null". answerKey = regex pattern (plain text or | alternates, case-insensitive).
- multi_blank: choicesJson = {"blankIds":["b1"]}. answerKey = JSON object blankId→answer (regex per blank).
- cloze: choicesJson = {"segments":[{"type":"text","value":"..."},{"type":"blank","id":"b1"}]}. answerKey = JSON object.
- keyword_scored: choicesJson = "null". answerKey = {"keywords":["term1"],"minKeywords":1} as JSON string.

Numeric:
- numeric_tolerance: choicesJson = "null". answerKey = {"value":3.14,"tolerance":0.01}.
- matrix_whole: choicesJson = {"rows":2,"cols":2}. answerKey = {"matrix":[[1,2],[3,4]]}.
- matrix_per_cell: choicesJson = {"rows":2,"cols":2}. answerKey = {"cells":{"0,0":1}}.
- vector: choicesJson = {"dimensions":3}. answerKey = {"vector":[1,2,3]}.
- integer: choicesJson = "null". answerKey = {"value":42}.
- significant_figures: choicesJson = "null". answerKey = {"value":3.14,"sigFigs":3}.
- number_with_units: choicesJson = "null". answerKey = {"value":9.8,"unit":"m/s^2"}.
- slider: choicesJson = {"min":0,"max":100,"step":1}. answerKey = {"value":50,"tolerance":1}.

Symbolic & math:
- symbolic_expression / equation_input: choicesJson = "null". answerKey = canonical expression string.
- form_constrained_algebra: choicesJson = "null". answerKey = {"pattern":"...","example":"2x^2+1"}.
- antiderivative: choicesJson = "null". answerKey = {"expression":"x^2 + C","allowConstant":true}.
- interval_set_list: choicesJson = "null". answerKey = {"type":"interval","value":"(0,1)"}.

Rules:
- choicesJson is ALWAYS a JSON-encoded string: use "null" when there is no config, or a JSON array/object as above.
- answerKey is always a string (JSON-encoded when the type requires structured answers).
- Every question MUST have a usable answerKey. If you cannot determine the answer, OMIT the question.
- Do NOT invent free-response / essay / open-ended / prove-style questions.
- promptText: full student-facing wording.
- needsReview: true when you inferred the answer — false when verbatim from the source.
- position: 1-based order matching the source.

Empty "questions" is correct when no auto-gradable items exist.`;

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
              text: `This is a quiz, homework, exam, or practice-problem file ("${fileName}") from the course "${course.title}" (${course.department}).\n\n${IMPORT_PROMPT}`,
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

  const parsed = JSON.parse(textBlock.text) as { questions: RawBuiltQuizQuestion[] };
  return (parsed.questions ?? [])
    .filter((q) => q.promptText?.trim())
    .sort((a, b) => a.position - b.position)
    .map(normalizeBuiltQuestion)
    .filter((q): q is BuiltQuizQuestion => q !== null);
}
