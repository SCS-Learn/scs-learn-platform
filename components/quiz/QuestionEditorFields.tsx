"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  decodeMultipleSelectResponse,
  encodeMultipleSelectResponse,
  isValidShortAnswer,
} from "@/lib/quiz/grading";
import OrderingEditor from "@/components/quiz/OrderingEditor";
import InlineDropdownEditor from "@/components/quiz/InlineDropdownEditor";
import MatchingEditor from "@/components/quiz/MatchingEditor";
import CategorizationEditor from "@/components/quiz/CategorizationEditor";
import ChoiceGridEditor from "@/components/quiz/ChoiceGridEditor";
import HottextEditor from "@/components/quiz/HottextEditor";
import MatrixEditor from "@/components/quiz/MatrixEditor";
import VectorEditor from "@/components/quiz/VectorEditor";
import SignificantFiguresEditor from "@/components/quiz/SignificantFiguresEditor";
import {
  parseInlineDropdownAnswerKey,
  parseInlineDropdownChoices,
} from "@/lib/quiz/inline-dropdown";
import {
  parseCategorizationChoices,
  parseChoiceGridAnswerKey,
  parseChoiceGridChoices,
  parseHottextAnswerKey,
  parseHottextChoices,
  parseMappingAnswerKey,
  parseMatchingChoices,
  parseMatrixPerCellAnswerKey,
  parseMatrixWholeAnswerKey,
  parseSignificantFiguresAnswerKey,
  parseVectorAnswerKey,
} from "@/lib/quiz/structured-choices";
import {
  parseOrderingAnswerKey,
  parseOrderingChoices,
  sanitizeOrder,
} from "@/lib/quiz/ordering";
import {
  asStringChoices,
  defaultAnswerKeyForType,
  defaultChoicesForType,
} from "@/lib/quiz/parse";
import {
  COMMON_QUESTION_TYPES,
  QUESTION_CATEGORIES,
  QUESTION_TYPE_DROPDOWN_ORDER,
  QUESTION_TYPE_META,
  type AutogradableQuestionType,
  type QuestionChoices,
} from "@/lib/quiz/types";

export type EditorState = {
  promptText: string;
  questionType: AutogradableQuestionType;
  choices: QuestionChoices;
  answerKey: string;
};

const USES_STRING_CHOICES: AutogradableQuestionType[] = [
  "multiple_choice",
  "multiple_select",
  "true_false",
];

const USES_JSON_ANSWER: AutogradableQuestionType[] = [
  "inline_dropdown",
  "matching",
  "categorization",
  "hottext",
  "choice_grid",
  "multi_blank",
  "cloze",
  "keyword_scored",
  "numeric_tolerance",
  "matrix_whole",
  "matrix_per_cell",
  "vector",
  "integer",
  "significant_figures",
  "number_with_units",
  "slider",
  "form_constrained_algebra",
  "antiderivative",
  "interval_set_list",
];

function usesStringChoices(type: AutogradableQuestionType): boolean {
  return USES_STRING_CHOICES.includes(type);
}

const PROMPT_PLACEHOLDERS: Partial<Record<AutogradableQuestionType, string>> = {
  inline_dropdown: "The process of ___ replication starts at the origin. (use {{b1}} or ___ for each blank)",
  multi_blank: "DNA polymerase adds nucleotides in the {{b1}} direction. (use {{b1}}, {{b2}}, or ___)",
  cloze: "Enter the full question sentence — blanks are configured automatically.",
  hottext: "Enter a short intro or leave blank if the passage is in the imported question.",
  short_answer: "What is the complementary strand of ATGGCC?",
  ordering: "Put these steps in the correct order:",
  matching: "Match each term on the left to its definition on the right.",
};

const ANSWER_HINTS: Partial<Record<AutogradableQuestionType, string>> = {
  inline_dropdown: 'JSON mapping each blank id to the correct option, e.g. {"b1":"5\' to 3\'"}',
  multi_blank: 'JSON mapping each blank id to the answer, e.g. {"b1":"5\' to 3\'"}',
  cloze: 'JSON mapping each blank id to the answer, e.g. {"b1":"Paris"}',
  matching: 'JSON mapping left items to right matches, e.g. {"Term A":"Definition 1"}',
  categorization: 'JSON mapping items to categories, e.g. {"Item 1":"Category A"}',
  hottext: 'JSON array of correct highlighted terms, e.g. ["quick","fox"]',
  choice_grid: 'JSON mapping rows to column selections',
  keyword_scored: 'JSON with keywords and minimum count, e.g. {"keywords":["mitosis"],"minKeywords":1}',
  numeric_tolerance: 'JSON with value and tolerance, e.g. {"value":3.14,"tolerance":0.01}',
  integer: 'JSON with the correct integer, e.g. {"value":42}',
  significant_figures: 'JSON with value and sig figs, e.g. {"value":3.14,"sigFigs":3}',
  number_with_units: 'JSON with value and unit, e.g. {"value":9.8,"unit":"m/s^2"}',
  matrix_whole: 'JSON with the correct matrix, e.g. {"matrix":[[1,2],[3,4]]}',
  matrix_per_cell: 'JSON with per-cell answers, e.g. {"cells":{"0,0":1}}',
  vector: 'JSON with the correct vector, e.g. {"vector":[1,2,3]}',
  slider: 'JSON with the correct value, e.g. {"value":50}',
  form_constrained_algebra: 'JSON answer key for the expected form',
  antiderivative: 'JSON with the expected antiderivative (up to a constant)',
  interval_set_list: 'JSON with the expected interval, set, or list',
};

function promptPlaceholder(type: AutogradableQuestionType): string {
  return PROMPT_PLACEHOLDERS[type] ?? "Enter the question text students will see";
}

function answerHint(type: AutogradableQuestionType): string | undefined {
  return ANSWER_HINTS[type];
}

function AnswerKeyField({
  value,
  onChange,
  hint,
  placeholder,
  multiline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const className =
    "w-full text-base border border-gray-200 px-4 py-2.5 outline-none focus:border-iron-gray font-mono";

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Correct answer
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={className}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          placeholder={placeholder}
        />
      )}
      {hint && <p className="text-sm text-gray-400">{hint}</p>}
    </div>
  );
}

function StringChoicesEditor({
  questionType,
  choices,
  answerKey,
  questionId,
  onChoicesChange,
  onAnswerKeyChange,
}: {
  questionType: AutogradableQuestionType;
  choices: string[];
  answerKey: string;
  questionId: string;
  onChoicesChange: (c: string[]) => void;
  onAnswerKeyChange: (k: string) => void;
}) {
  const selectedMulti = new Set(decodeMultipleSelectResponse(answerKey));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Options — mark the correct answer
      </p>
      {choices.map((choice, choiceIndex) => (
        <div key={choiceIndex} className="flex items-center gap-3">
          {questionType === "multiple_select" ? (
            <input
              type="checkbox"
              checked={selectedMulti.has(choice) && choice.trim() !== ""}
              disabled={!choice.trim()}
              onChange={() => {
                const next = new Set(selectedMulti);
                if (next.has(choice)) next.delete(choice);
                else next.add(choice);
                onAnswerKeyChange(encodeMultipleSelectResponse([...next]));
              }}
            />
          ) : (
            <input
              type="radio"
              name={`answer-${questionId}`}
              checked={answerKey === choice && choice.trim() !== ""}
              disabled={!choice.trim()}
              onChange={() => onAnswerKeyChange(choice)}
            />
          )}
          <input
            type="text"
            value={choice}
            disabled={questionType === "true_false"}
            onChange={(e) => {
              const next = [...choices];
              const prev = next[choiceIndex] ?? "";
              next[choiceIndex] = e.target.value;
              onChoicesChange(next);
              if (questionType === "multiple_choice" && answerKey === prev) {
                onAnswerKeyChange(e.target.value);
              }
              if (questionType === "multiple_select" && selectedMulti.has(prev)) {
                const selected = [...selectedMulti].map((s) => (s === prev ? e.target.value : s));
                onAnswerKeyChange(encodeMultipleSelectResponse(selected.filter(Boolean)));
              }
            }}
            className="flex-1 text-base border border-gray-200 px-4 py-2.5 outline-none focus:border-iron-gray disabled:bg-gray-50"
            placeholder={`Option ${choiceIndex + 1}`}
          />
          {questionType !== "true_false" && (
            <button
              type="button"
              onClick={() => {
                const removed = choices[choiceIndex];
                const next = choices.filter((_, i) => i !== choiceIndex);
                onChoicesChange(next.length >= 2 ? next : [...next, ""]);
                if (questionType === "multiple_choice" && answerKey === removed) {
                  onAnswerKeyChange("");
                }
              }}
              className="text-gray-400 hover:text-red-500 p-1.5"
              aria-label="Remove option"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      {questionType !== "true_false" && (
        <button
          type="button"
          onClick={() => onChoicesChange([...choices, ""])}
          className="self-start text-sm font-semibold text-iron-gray inline-flex items-center gap-1.5 hover:underline"
        >
          <Plus size={14} />
          Add option
        </button>
      )}
    </div>
  );
}

export function createDefaultEditorState(
  questionType: AutogradableQuestionType = "short_answer"
): EditorState {
  return {
    promptText: "",
    questionType,
    choices: defaultChoicesForType(questionType),
    answerKey: defaultAnswerKeyForType(questionType),
  };
}

export function editorStateFromQuestion(question: {
  promptText: string;
  questionType: string;
  choices: QuestionChoices;
  answerKey: string | null;
}): EditorState {
  const type = QUESTION_TYPE_DROPDOWN_ORDER.includes(question.questionType as AutogradableQuestionType)
    ? (question.questionType as AutogradableQuestionType)
    : "short_answer";
  return {
    promptText: question.promptText,
    questionType: type,
    choices: question.choices ?? defaultChoicesForType(type),
    answerKey: question.answerKey ?? defaultAnswerKeyForType(type),
  };
}

export function validateEditorState(state: EditorState): string | null {
  const trimmedPrompt = state.promptText.trim();
  const { questionType, choices, answerKey } = state;

  if (!trimmedPrompt) {
    if (questionType === "hottext") {
      const config = parseHottextChoices(choices);
      if (!config?.passage.trim()) return "Question text or passage is required.";
    } else {
      return "Question text is required.";
    }
  }

  let nextAnswer = answerKey.trim();
  if (!nextAnswer) return "Answer key is required.";

  if (usesStringChoices(questionType)) {
    const stringChoices = asStringChoices(choices) ?? [];
    const cleaned =
      questionType === "true_false"
        ? ["True", "False"]
        : stringChoices.map((c) => c.trim()).filter(Boolean);
    if (cleaned.length < 2) {
      return "Add at least two options.";
    }
    if (questionType === "multiple_select") {
      const selected = decodeMultipleSelectResponse(nextAnswer).filter((s) => cleaned.includes(s));
      if (selected.length === 0) return "Select at least one correct option.";
    } else if (!cleaned.includes(nextAnswer)) {
      return "Select the correct answer from the options.";
    }
  } else if (questionType === "ordering") {
    const config = parseOrderingChoices(choices);
    if (!config || config.items.length < 2) return "Add at least two items to sequence.";
    const correct = parseOrderingAnswerKey(nextAnswer);
    if (!correct || correct.length < 2) return "Set a correct order with at least two items.";
    const sanitized = sanitizeOrder(correct, config.items);
    if (sanitized.length !== config.items.length) {
      return "Correct order must include every item exactly once.";
    }
  } else if (questionType === "inline_dropdown") {
    const config = parseInlineDropdownChoices(choices);
    if (!config || config.blanks.length === 0) return "Add at least one dropdown blank.";
    for (const blank of config.blanks) {
      if (blank.options.length < 2) {
        return `Blank ${blank.id} needs at least two options.`;
      }
    }
    const answers = parseInlineDropdownAnswerKey(nextAnswer);
    for (const blank of config.blanks) {
      if (!answers[blank.id] || !blank.options.includes(answers[blank.id])) {
        return `Select the correct option for blank ${blank.id}.`;
      }
    }
  } else if (questionType === "matching") {
    const config = parseMatchingChoices(choices);
    if (!config || config.left.length < 2 || config.right.length < 2) {
      return "Add at least two items in each column.";
    }
    const mapping = parseMappingAnswerKey(nextAnswer);
    for (const item of config.left) {
      if (!mapping[item] || !config.right.includes(mapping[item])) {
        return `Select the correct match for "${item}".`;
      }
    }
  } else if (questionType === "categorization") {
    const config = parseCategorizationChoices(choices);
    if (!config || config.categories.length < 1 || config.items.length < 1) {
      return "Add at least one category and one item.";
    }
    const mapping = parseMappingAnswerKey(nextAnswer);
    for (const item of config.items) {
      if (!mapping[item] || !config.categories.includes(mapping[item])) {
        return `Select the correct category for "${item}".`;
      }
    }
  } else if (questionType === "choice_grid") {
    const config = parseChoiceGridChoices(choices);
    if (!config || config.rows.length < 1 || config.cols.length < 1 || config.options.length < 2) {
      return "Add rows, columns, and at least two options.";
    }
    const answers = parseChoiceGridAnswerKey(nextAnswer);
    for (const row of config.rows) {
      for (const col of config.cols) {
        const value = answers[row]?.[col];
        if (!value || !config.options.includes(value)) {
          return `Select the correct option for ${row} / ${col}.`;
        }
      }
    }
  } else if (questionType === "hottext") {
    const config = parseHottextChoices(choices);
    if (!config || !config.passage.trim()) return "Passage is required.";
    if (config.terms.length < 1) return "Add at least one clickable term.";
    const correct = parseHottextAnswerKey(nextAnswer);
    if (correct.length === 0) return "Select at least one correct term.";
  } else if (questionType === "matrix_whole") {
    const matrix = parseMatrixWholeAnswerKey(nextAnswer);
    if (!matrix || matrix.length < 1) return "Set correct matrix values.";
  } else if (questionType === "matrix_per_cell") {
    const cells = parseMatrixPerCellAnswerKey(nextAnswer);
    if (!cells || Object.keys(cells).length === 0) return "Set correct cell values.";
  } else if (questionType === "vector") {
    const key = parseVectorAnswerKey(nextAnswer);
    if (!key || key.vector.length < 1) return "Set the correct vector components.";
  } else if (questionType === "significant_figures") {
    if (!parseSignificantFiguresAnswerKey(nextAnswer)) {
      return "Enter a valid value and significant figure count.";
    }
  } else if (questionType === "short_answer") {
    if (!isValidShortAnswer(nextAnswer)) {
      return "Enter a valid answer pattern (plain text or regex with | alternates).";
    }
  } else if (
    questionType === "symbolic_expression" ||
    questionType === "equation_input"
  ) {
    if (!nextAnswer) return "Enter the correct expression.";
  } else if (USES_JSON_ANSWER.includes(questionType)) {
    try {
      JSON.parse(nextAnswer);
    } catch {
      return "Correct answer must be valid JSON for this question type.";
    }
  }

  return null;
}

export function QuestionTypeSelect({
  value,
  onChange,
}: {
  value: AutogradableQuestionType;
  onChange: (type: AutogradableQuestionType) => void;
}) {
  const commonSet = new Set(COMMON_QUESTION_TYPES);
  const moreTypes = QUESTION_TYPE_DROPDOWN_ORDER.filter((type) => !commonSet.has(type));

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AutogradableQuestionType)}
      className="text-sm border border-gray-200 px-3 py-2 bg-white max-w-xs"
    >
      <optgroup label="Common">
        {COMMON_QUESTION_TYPES.map((type) => (
          <option key={type} value={type}>
            {QUESTION_TYPE_META[type].label}
          </option>
        ))}
      </optgroup>
      {QUESTION_CATEGORIES.map((cat) => {
        const types = moreTypes.filter((type) => QUESTION_TYPE_META[type].category === cat.id);
        if (types.length === 0) return null;

        return (
          <optgroup key={cat.id} label={cat.label}>
            {types.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_META[type].label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

export function QuestionEditorFields({
  state,
  questionId,
  onChange,
}: {
  state: EditorState;
  questionId: string;
  onChange: (patch: Partial<EditorState>) => void;
}) {
  const { questionType, choices, answerKey } = state;
  const stringChoices = asStringChoices(choices);

  const changeType = (next: AutogradableQuestionType) => {
    onChange({
      questionType: next,
      choices: defaultChoicesForType(next),
      answerKey: defaultAnswerKeyForType(next),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <QuestionTypeSelect value={questionType} onChange={changeType} />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Question text
        </label>
        <textarea
          value={state.promptText}
          onChange={(e) => onChange({ promptText: e.target.value })}
          rows={4}
          className="w-full text-base border border-gray-200 px-4 py-3 outline-none focus:border-iron-gray"
          placeholder={promptPlaceholder(questionType)}
        />
      </div>

      {questionType === "ordering" ? (
        <OrderingEditor
          choices={choices}
          answerKey={answerKey}
          onChoicesChange={(c) => onChange({ choices: c })}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : questionType === "inline_dropdown" ? (
        <InlineDropdownEditor
          choices={choices}
          answerKey={answerKey}
          questionId={questionId}
          onChoicesChange={(c) => onChange({ choices: c })}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : questionType === "matching" ? (
        <MatchingEditor
          choices={choices}
          answerKey={answerKey}
          onChoicesChange={(c) => onChange({ choices: c })}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : questionType === "categorization" ? (
        <CategorizationEditor
          choices={choices}
          answerKey={answerKey}
          onChoicesChange={(c) => onChange({ choices: c })}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : questionType === "choice_grid" ? (
        <ChoiceGridEditor
          choices={choices}
          answerKey={answerKey}
          onChoicesChange={(c) => onChange({ choices: c })}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : questionType === "hottext" ? (
        <HottextEditor
          choices={choices}
          answerKey={answerKey}
          onChoicesChange={(c) => onChange({ choices: c })}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : questionType === "matrix_whole" || questionType === "matrix_per_cell" ? (
        <MatrixEditor
          mode={questionType}
          choices={choices}
          answerKey={answerKey}
          onChoicesChange={(c) => onChange({ choices: c })}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : questionType === "vector" ? (
        <VectorEditor
          choices={choices}
          answerKey={answerKey}
          onChoicesChange={(c) => onChange({ choices: c })}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : questionType === "significant_figures" ? (
        <SignificantFiguresEditor
          answerKey={answerKey}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : usesStringChoices(questionType) && stringChoices ? (
        <StringChoicesEditor
          questionType={questionType}
          choices={stringChoices}
          answerKey={answerKey}
          questionId={questionId}
          onChoicesChange={(c) => onChange({ choices: c })}
          onAnswerKeyChange={(k) => onChange({ answerKey: k })}
        />
      ) : questionType === "short_answer" ? (
        <AnswerKeyField
          value={answerKey}
          onChange={(k) => onChange({ answerKey: k })}
          placeholder="ATGGCC or overlap|overlapping"
          hint="Matched case-insensitively. Plain text matches exactly; use | for alternates."
        />
      ) : questionType === "symbolic_expression" || questionType === "equation_input" ? (
        <AnswerKeyField
          value={answerKey}
          onChange={(k) => onChange({ answerKey: k })}
          placeholder="e.g. x^2 + 1"
        />
      ) : (
        <AnswerKeyField
          value={answerKey}
          onChange={(k) => onChange({ answerKey: k })}
          placeholder={defaultAnswerKeyForType(questionType)}
          hint={answerHint(questionType)}
          multiline={USES_JSON_ANSWER.includes(questionType)}
        />
      )}
    </div>
  );
}
