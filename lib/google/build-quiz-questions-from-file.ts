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
  isAutogradableQuestionType,
  type AutogradableQuestionType,
  type QuestionChoices,
  type QuestionType,
} from "@/lib/quiz/types";

export type BuiltQuizQuestion = {
  position: number;
  promptText: string;
  questionType: QuestionType;
  choices: QuestionChoices;
  answerKey: string | null;
  needsReview: boolean;
};

/** Raw shape from the LLM — choicesJson avoids invalid object schemas in structured output. */
type RawBuiltQuizQuestion = {
  position: number;
  promptText: string;
  questionType: QuestionType;
  choicesJson: string;
  answerKey: string;
  needsReview: boolean;
};

const IMPORTABLE_QUESTION_TYPES: QuestionType[] = [...AUTOGRADABLE_QUESTION_TYPES, "free_response"];

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
            enum: IMPORTABLE_QUESTION_TYPES,
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

  if (questionType === "free_response") {
    const referenceAnswer = (raw.answerKey ?? "").trim();
    if (!referenceAnswer) return null;
    return {
      position,
      promptText,
      questionType,
      choices: null,
      answerKey: referenceAnswer,
      needsReview,
    };
  }

  if (!isAutogradableQuestionType(questionType)) return null;

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

const IMPORT_PROMPT = `Read the source and extract questions a student can answer interactively — either auto-gradable questions, or open-ended questions that come with a reference answer in the source.

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

Open-ended (only when a reference answer for that item is available somewhere in the source):
- free_response: for essay, short-answer-explanation, proof, or derivation questions that are NOT auto-gradable. choicesJson = "null". answerKey = a complete, well-written model answer to the question itself.

Rules:
- choicesJson is ALWAYS a JSON-encoded string: use "null" when there is no config, or a JSON array/object as above.
- answerKey is always a string (JSON-encoded when the type requires structured answers).
- Every question MUST have a usable answerKey. If you cannot determine the answer, OMIT the question.
- The source may span multiple files, each marked with a "--- Source file: ... ---" header — one is the problem set, others may be a separate answer key / solutions document. Match each question to its reference answer by problem number and wording across ALL provided files, not just the file the question text came from, before deciding an answer is unavailable.
- For open-ended questions specifically: only extract them as free_response if a reference answer/solution for that exact item exists somewhere in the provided source(s). Do NOT invent or guess a reference answer that isn't there — if none exists in any provided file, OMIT the question entirely rather than fabricating one.
- The free_response answerKey is shown to the student directly, as "the" answer — it is never TA-facing grading notes. If the source's reference material is written as grading instructions (e.g. "Award full credit if the student mentions X", "Look for Y and Z", a point-by-point rubric) rather than an actual answer, rewrite it into the direct model answer that rubric describes — do not copy rubric/grading language verbatim. If the source already gives a genuine model answer or worked solution, use it near-verbatim instead of rewriting it. Set needsReview = true whenever you had to rewrite rubric-style material into a direct answer, paraphrase, or condense — false when the source's own answer text is usable essentially as-is.
- promptText, and the free_response answerKey: preserve meaningful source formatting as GitHub-flavored Markdown — fence code/pseudocode with triple backticks (add a language hint when known), render tabular data as a Markdown pipe table, keep paragraph breaks and lists. Do not flatten code or a table into a single run-on line of prose.
- needsReview: true when you inferred the answer — false when verbatim from the source.
- position: 1-based order matching the source.

Empty "questions" is correct when no gradable items exist.`;

/**
 * Uses an LLM to turn quiz/assignment source content into gradable
 * question rows — either auto-gradable types, or free_response questions
 * that come with a reference answer somewhere in the source. Open-ended
 * items with no reference answer anywhere in the document are omitted; an
 * empty result means no gradable questions were found at all.
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
