"use client";

import { useMemo } from "react";
import { InlineStem, inlineSelectClass, inlineTextInputClass } from "@/components/quiz/InlineStem";
import {
  decodeMultipleSelectResponse,
  encodeMultipleSelectResponse,
} from "@/lib/quiz/grading";
import { resolveBlanksForPrompt } from "@/lib/quiz/question-layout";
import { moveInOrder, parseOrderingChoices } from "@/lib/quiz/ordering";
import {
  parseWholeMatrixResponse,
  resolveMatrixShape,
  serializeWholeMatrix,
} from "@/lib/quiz/matrix";
import { asObjectChoices, asStringChoices, parseJson, resolveMultipleChoiceOptions } from "@/lib/quiz/parse";
import type { QuestionChoices, QuestionType } from "@/lib/quiz/types";

export type QuestionInputProps = {
  questionId: string;
  questionType: QuestionType;
  promptText: string;
  choices: QuestionChoices;
  /** Used to size matrix grids — values are never shown in the input UI. */
  answerKey?: string | null;
  response: string;
  submitted: boolean;
  /** When set after submit, styles the student's response green (correct) or red (incorrect). */
  feedback?: "correct" | "incorrect" | null;
  onChange: (value: string) => void;
};

function selectedChoiceClass(
  selected: boolean,
  submitted: boolean,
  feedback?: "correct" | "incorrect" | null
): string {
  if (selected && submitted && feedback === "correct") {
    return "border-green-500 bg-green-50";
  }
  if (selected && submitted && feedback === "incorrect") {
    return "border-red-500 bg-red-50";
  }
  if (selected) {
    return "border-gray-400 bg-gray-100";
  }
  return "border-gray-200";
}

function textFieldClass(submitted: boolean, feedback?: "correct" | "incorrect" | null): string {
  const base =
    "w-full text-sm border px-3 py-2 outline-none disabled:bg-white disabled:text-gray-700";
  if (submitted && feedback === "correct") {
    return `${base} border-green-500 bg-green-50`;
  }
  if (submitted && feedback === "incorrect") {
    return `${base} border-red-500 bg-red-50`;
  }
  return `${base} border-gray-200 focus:border-primary/50`;
}

function parseResponseObject(response: string): Record<string, string> {
  return parseJson<Record<string, string>>(response) ?? {};
}

function setResponseField(
  response: string,
  key: string,
  value: string,
  onChange: (value: string) => void
) {
  const current = parseResponseObject(response);
  onChange(JSON.stringify({ ...current, [key]: value }));
}

function TextField({
  value,
  disabled,
  onChange,
  placeholder,
  hint,
  feedback,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  feedback?: "correct" | "incorrect" | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Type your answer..."}
        className={textFieldClass(disabled, feedback)}
      />
      {hint && !disabled && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function RadioChoices({
  questionId,
  choices,
  response,
  submitted,
  feedback,
  onChange,
}: {
  questionId: string;
  choices: string[];
  response: string;
  submitted: boolean;
  feedback?: "correct" | "incorrect" | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {choices.map((choice) => (
        <label
          key={choice}
          className={`flex items-center gap-2 text-sm px-3 py-1.5 border ${selectedChoiceClass(
            response === choice,
            submitted,
            feedback
          )} ${submitted ? "cursor-default" : "cursor-pointer hover:bg-gray-50"}`}
        >
          <input
            type="radio"
            name={questionId}
            value={choice}
            checked={response === choice}
            disabled={submitted}
            onChange={() => onChange(choice)}
          />
          {choice}
        </label>
      ))}
    </div>
  );
}

function InlineDropdownInput({
  promptText,
  choices,
  response,
  submitted,
  onChange,
}: Omit<QuestionInputProps, "questionId" | "questionType">) {
  const config = asObjectChoices(choices);
  const blanks = (config?.blanks as { id: string; options: string[] }[]) ?? [];
  const values = parseResponseObject(response);
  const { slots } = resolveBlanksForPrompt(
    promptText,
    blanks.map((b) => ({ id: b.id, options: b.options, inputType: "dropdown" as const }))
  );

  if (slots.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium whitespace-pre-wrap">{promptText}</p>
        <p className="text-xs text-amber-700">
          Add {"{{b1}}"} or ___ placeholders in the question text for each dropdown.
        </p>
      </div>
    );
  }

  return (
    <InlineStem>
      {slots.map((slot, i) => {
        if (slot.kind === "text") {
          return <span key={i}>{slot.value}</span>;
        }
        const { blank } = slot;
        const options = blank.options ?? blanks.find((b) => b.id === blank.id)?.options ?? [];
        return (
          <select
            key={`${blank.id}-${i}`}
            value={values[blank.id] ?? ""}
            disabled={submitted}
            onChange={(e) => setResponseField(response, blank.id, e.target.value, onChange)}
            className={inlineSelectClass(submitted)}
            aria-label={blank.id}
          >
            <option value="">…</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      })}
    </InlineStem>
  );
}

function MatchingInput({
  choices,
  response,
  submitted,
  onChange,
}: Omit<QuestionInputProps, "questionId" | "questionType" | "promptText">) {
  const config = asObjectChoices(choices);
  const left = (config?.left as string[]) ?? [];
  const right = (config?.right as string[]) ?? [];
  const values = parseResponseObject(response);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-x-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <span>Item</span>
        <span className="hidden sm:block" />
        <span>Match</span>
      </div>
      {left.map((item) => (
        <div key={item} className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-x-4">
          <span className="text-sm">{item}</span>
          <span className="hidden sm:inline text-gray-300">→</span>
          <select
            value={values[item] ?? ""}
            disabled={submitted}
            onChange={(e) => setResponseField(response, item, e.target.value, onChange)}
            className="w-full text-sm border border-gray-200 px-2 py-1.5 bg-white"
          >
            <option value="">Select a match…</option>
            {right.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function CategorizationInput({
  choices,
  response,
  submitted,
  onChange,
}: Omit<QuestionInputProps, "questionId" | "questionType" | "promptText">) {
  const config = asObjectChoices(choices);
  const categories = (config?.categories as string[]) ?? [];
  const items = (config?.items as string[]) ?? [];
  const values = parseResponseObject(response);

  return (
    <div className="flex flex-col gap-2">
      {categories.length > 0 && (
        <p className="text-xs text-gray-500 mb-1">
          Categories: {categories.join(" · ")}
        </p>
      )}
      {items.map((item) => (
        <div key={item} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
          <span className="text-sm sm:min-w-[8rem]">{item}</span>
          <select
            value={values[item] ?? ""}
            disabled={submitted}
            onChange={(e) => setResponseField(response, item, e.target.value, onChange)}
            className="flex-1 text-sm border border-gray-200 px-2 py-1.5 bg-white"
          >
            <option value="">Choose category…</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function OrderingInput({
  choices,
  response,
  submitted,
  onChange,
}: Omit<QuestionInputProps, "questionId" | "questionType" | "promptText">) {
  const config = parseOrderingChoices(choices);
  const displayOrder = config?.displayOrder ?? [];

  const ordered = useMemo(() => {
    const parsed = parseJson<string[]>(response);
    if (parsed && parsed.length === displayOrder.length) return parsed;
    return [...displayOrder];
  }, [response, displayOrder]);

  const move = (from: number, to: number) => {
    if (submitted || to < 0 || to >= ordered.length) return;
    const next = moveInOrder(ordered, from, to);
    onChange(JSON.stringify(next));
  };

  if (!config || displayOrder.length === 0) {
    return <p className="text-sm text-gray-500">No items configured for this ordering question.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-gray-500">Drag into the correct sequence using the arrows.</p>
      {ordered.map((item, index) => (
        <div
          key={`${item}-${index}`}
          className="flex items-center gap-2 text-sm border border-gray-200 px-3 py-2 bg-white"
        >
          <span className="text-xs text-gray-400 w-5 shrink-0">{index + 1}.</span>
          <span className="flex-1">{item}</span>
          {!submitted && (
            <>
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === ordered.length - 1}
                className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1"
                aria-label="Move down"
              >
                ↓
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HottextInput({
  choices,
  response,
  submitted,
  onChange,
}: Omit<QuestionInputProps, "questionId" | "questionType" | "promptText">) {
  const config = asObjectChoices(choices);
  const passage = (config?.passage as string) ?? "";
  const terms = (config?.terms as string[]) ?? [];
  const selected = new Set(parseJson<string[]>(response) ?? []);

  const toggle = (term: string) => {
    if (submitted) return;
    const next = new Set(selected);
    if (next.has(term)) next.delete(term);
    else next.add(term);
    onChange(JSON.stringify([...next].sort()));
  };

  const tokens = useMemo(() => {
    if (!passage) return [];
    if (terms.length === 0) return [{ text: passage, term: null as string | null }];

    const escaped = [...terms].sort((a, b) => b.length - a.length).map(escapeRegexLiteral);
    const re = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts: { text: string; term: string | null }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    const regex = new RegExp(re.source, re.flags);

    while ((m = regex.exec(passage)) !== null) {
      if (m.index > last) {
        parts.push({ text: passage.slice(last, m.index), term: null });
      }
      const matched = m[1]!;
      const canonical = terms.find((t) => t.toLowerCase() === matched.toLowerCase()) ?? matched;
      parts.push({ text: matched, term: canonical });
      last = m.index + matched.length;
    }
    if (last < passage.length) {
      parts.push({ text: passage.slice(last), term: null });
    }
    return parts.length > 0 ? parts : [{ text: passage, term: null }];
  }, [passage, terms]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">Click words in the passage to highlight them.</p>
      <InlineStem>
        {tokens.map((token, i) => {
          if (!token.term) {
            return <span key={i}>{token.text}</span>;
          }
          const isSelected = selected.has(token.term);
          return (
            <button
              key={i}
              type="button"
              disabled={submitted}
              onClick={() => toggle(token.term!)}
              className={`inline font-medium px-0.5 border-b-2 ${
                isSelected
                  ? "bg-yellow-200 border-yellow-500 text-gray-900"
                  : "border-transparent hover:bg-yellow-50 hover:border-yellow-300"
              } ${submitted ? "cursor-default" : "cursor-pointer"}`}
            >
              {token.text}
            </button>
          );
        })}
      </InlineStem>
    </div>
  );
}

function ChoiceGridInput({
  choices,
  response,
  submitted,
  onChange,
}: Omit<QuestionInputProps, "questionId" | "questionType" | "promptText">) {
  const config = asObjectChoices(choices);
  const rows = (config?.rows as string[]) ?? [];
  const cols = (config?.cols as string[]) ?? [];
  const options = (config?.options as string[]) ?? [];
  const values = parseJson<Record<string, Record<string, string>>>(response) ?? {};

  const setCell = (row: string, col: string, value: string) => {
    const next = { ...values, [row]: { ...(values[row] ?? {}), [col]: value } };
    onChange(JSON.stringify(next));
  };

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse w-full">
        <thead>
          <tr>
            <th className="p-2" />
            {cols.map((col) => (
              <th key={col} className="p-2 text-left font-medium text-gray-600">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <td className="p-2 font-medium">{row}</td>
              {cols.map((col) => (
                <td key={col} className="p-2">
                  <select
                    value={values[row]?.[col] ?? ""}
                    disabled={submitted}
                    onChange={(e) => setCell(row, col, e.target.value)}
                    className="text-sm border border-gray-200 px-2 py-1 bg-white"
                  >
                    <option value="">—</option>
                    {options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MultiBlankInput({
  choices,
  promptText,
  response,
  submitted,
  onChange,
}: Omit<QuestionInputProps, "questionId" | "questionType">) {
  const config = asObjectChoices(choices);
  const blankIds = (config?.blankIds as string[]) ?? [];
  const values = parseResponseObject(response);

  const blanks = blankIds.map((id) => ({ id, inputType: "text" as const }));
  const { slots } = resolveBlanksForPrompt(promptText, blanks);

  if (slots.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium whitespace-pre-wrap">{promptText}</p>
        <p className="text-xs text-amber-700">
          Add {"{{b1}}"} or ___ placeholders in the question text for each blank.
        </p>
      </div>
    );
  }

  return (
    <InlineStem>
      {slots.map((slot, i) => {
        if (slot.kind === "text") {
          return <span key={i}>{slot.value}</span>;
        }
        const { id } = slot.blank;
        return (
          <input
            key={`${id}-${i}`}
            type="text"
            value={values[id] ?? ""}
            disabled={submitted}
            onChange={(e) => setResponseField(response, id, e.target.value, onChange)}
            className={inlineTextInputClass(submitted)}
            aria-label={id}
          />
        );
      })}
    </InlineStem>
  );
}

function ClozeInput({
  choices,
  response,
  submitted,
  onChange,
}: Omit<QuestionInputProps, "questionId" | "questionType" | "promptText">) {
  const config = asObjectChoices(choices);
  const segments = (config?.segments as { type: string; value?: string; id?: string; inputType?: string; options?: string[] }[]) ?? [];
  const values = parseResponseObject(response);

  return (
    <InlineStem>
      {segments.map((seg, i) => {
        if (seg.type === "text") return <span key={i}>{seg.value}</span>;
        if (seg.inputType === "dropdown" && seg.options) {
          return (
            <select
              key={i}
              value={values[seg.id ?? ""] ?? ""}
              disabled={submitted}
              onChange={(e) => setResponseField(response, seg.id ?? "", e.target.value, onChange)}
              className={inlineSelectClass(submitted)}
            >
              <option value="">…</option>
              {seg.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          );
        }
        return (
          <input
            key={i}
            type="text"
            value={values[seg.id ?? ""] ?? ""}
            disabled={submitted}
            onChange={(e) => setResponseField(response, seg.id ?? "", e.target.value, onChange)}
            className={inlineTextInputClass(submitted)}
          />
        );
      })}
    </InlineStem>
  );
}

function MatrixCellInput({
  choices,
  answerKey,
  response,
  submitted,
  onChange,
  perCell,
}: Omit<QuestionInputProps, "questionId" | "questionType" | "promptText"> & { perCell?: boolean }) {
  const mode = perCell ? "matrix_per_cell" : "matrix_whole";
  const { rows, cols, rowLabels, colLabels } = resolveMatrixShape(mode, answerKey ?? null, choices);

  const matrixValues = useMemo(
    () => parseWholeMatrixResponse(response, rows, cols),
    [response, rows, cols]
  );

  const perCellValues = parseJson<Record<string, string>>(response) ?? {};

  const updateWholeCell = (rowIndex: number, colIndex: number, value: string) => {
    const next = matrixValues.map((row, ri) =>
      ri === rowIndex ? row.map((cell, ci) => (ci === colIndex ? value : cell)) : row
    );
    onChange(serializeWholeMatrix(next));
  };

  return (
    <table className="text-sm border-collapse">
      <thead>
        <tr>
          <th />
          {colLabels.map((label) => (
            <th key={label} className="p-1 text-gray-600 font-medium">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rowLabels.map((rowLabel, rowIndex) => (
          <tr key={rowLabel}>
            <td className="p-1 font-medium text-gray-700">{rowLabel}</td>
            {colLabels.map((_, colIndex) => {
              const key = `${rowIndex},${colIndex}`;
              const value = perCell
                ? (perCellValues[key] ?? "")
                : (matrixValues[rowIndex]?.[colIndex] ?? "");

              return (
                <td key={key} className="p-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    disabled={submitted}
                    onChange={(e) => {
                      if (perCell) {
                        onChange(JSON.stringify({ ...perCellValues, [key]: e.target.value }));
                      } else {
                        updateWholeCell(rowIndex, colIndex, e.target.value);
                      }
                    }}
                    className="w-16 text-sm border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-iron-gray"
                    aria-label={`${rowLabel}, ${colLabels[colIndex]}`}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function parseVectorResponse(response: string, dims: number): number[] {
  const parsed = parseJson<unknown>(response);
  if (Array.isArray(parsed)) {
    return Array.from({ length: dims }, (_, i) => {
      const n = Number(parsed[i]);
      return Number.isFinite(n) ? n : 0;
    });
  }
  if (parsed && typeof parsed === "object" && "vector" in parsed) {
    const vector = (parsed as { vector: unknown }).vector;
    if (Array.isArray(vector)) {
      return Array.from({ length: dims }, (_, i) => {
        const n = Number(vector[i]);
        return Number.isFinite(n) ? n : 0;
      });
    }
  }
  return Array(dims).fill(0);
}

function VectorInput({ response, submitted, onChange, choices }: Omit<QuestionInputProps, "questionId" | "questionType" | "promptText">) {
  const config = asObjectChoices(choices);
  const dims = Math.max(1, (config?.dimensions as number) ?? 3);
  const values = parseVectorResponse(response, dims);

  const setComponent = (index: number, value: string) => {
    const next = [...values];
    next[index] = Number(value) || 0;
    onChange(JSON.stringify(next));
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span>[</span>
      {values.map((v, i) => (
        <input
          key={i}
          type="text"
          value={String(v)}
          disabled={submitted}
          onChange={(e) => setComponent(i, e.target.value)}
          className="w-16 text-sm border border-gray-200 px-2 py-1 text-center"
        />
      ))}
      <span>]</span>
    </div>
  );
}

function SliderInput({ choices, response, submitted, onChange }: Omit<QuestionInputProps, "questionId" | "questionType" | "promptText">) {
  const config = asObjectChoices(choices);
  const min = (config?.min as number) ?? 0;
  const max = (config?.max as number) ?? 100;
  const step = (config?.step as number) ?? 1;
  const value = response ? Number(response) : min;

  return (
    <div className="flex flex-col gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={submitted}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      />
      <p className="text-sm text-gray-600 text-center">{value}</p>
    </div>
  );
}

export default function QuestionInput(props: QuestionInputProps) {
  const { questionId, questionType, promptText, choices, response, submitted, feedback, onChange } = props;
  const stringChoices = asStringChoices(choices);
  const mcOptions = resolveMultipleChoiceOptions(choices);

  if (questionType === "multiple_select" && stringChoices && stringChoices.length > 0) {
    const selected = new Set(decodeMultipleSelectResponse(response));
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-gray-500 mb-1">Select all that apply</p>
        {stringChoices.map((choice) => (
          <label
            key={choice}
            className={`flex items-center gap-2 text-sm px-3 py-1.5 border ${selectedChoiceClass(
              selected.has(choice),
              submitted,
              feedback
            )} ${submitted ? "cursor-default" : "cursor-pointer hover:bg-gray-50"}`}
          >
            <input
              type="checkbox"
              checked={selected.has(choice)}
              disabled={submitted}
              onChange={() => {
                const next = new Set(selected);
                if (next.has(choice)) next.delete(choice);
                else next.add(choice);
                onChange(encodeMultipleSelectResponse([...next]));
              }}
            />
            {choice}
          </label>
        ))}
      </div>
    );
  }

  if (
    (questionType === "multiple_choice" || questionType === "true_false") &&
    mcOptions && mcOptions.length > 0
  ) {
    return (
      <RadioChoices questionId={questionId} choices={mcOptions} response={response} submitted={submitted} feedback={feedback} onChange={onChange} />
    );
  }

  if (questionType === "true_false" && (!stringChoices || stringChoices.length < 2)) {
    return <RadioChoices questionId={questionId} choices={["True", "False"]} response={response} submitted={submitted} feedback={feedback} onChange={onChange} />;
  }

  switch (questionType) {
    case "inline_dropdown":
      return <InlineDropdownInput {...props} />;
    case "matching":
      return <MatchingInput {...props} />;
    case "categorization":
      return <CategorizationInput {...props} />;
    case "ordering":
      return <OrderingInput {...props} />;
    case "hottext":
      return <HottextInput {...props} />;
    case "choice_grid":
      return <ChoiceGridInput {...props} />;
    case "multi_blank":
      return <MultiBlankInput {...props} />;
    case "cloze":
      return <ClozeInput {...props} />;
    case "matrix_whole":
      return <MatrixCellInput {...props} />;
    case "matrix_per_cell":
      return <MatrixCellInput {...props} perCell />;
    case "vector":
      return <VectorInput {...props} />;
    case "slider":
      return <SliderInput {...props} />;
    case "keyword_scored":
      return <TextField value={response} disabled={submitted} feedback={feedback} onChange={onChange} hint="Include required keywords in your answer." />;
    case "short_answer":
      return <TextField value={response} disabled={submitted} feedback={feedback} onChange={onChange} hint="Short answer — capitalization does not matter." />;
    case "numeric_tolerance":
    case "integer":
    case "significant_figures":
    case "number_with_units":
      return <TextField value={response} disabled={submitted} feedback={feedback} onChange={onChange} />;
    case "symbolic_expression":
    case "equation_input":
    case "form_constrained_algebra":
    case "antiderivative":
    case "interval_set_list":
      return <TextField value={response} disabled={submitted} feedback={feedback} onChange={onChange} />;
    default:
      if (stringChoices && stringChoices.length > 0) {
        return <RadioChoices questionId={questionId} choices={stringChoices} response={response} submitted={submitted} feedback={feedback} onChange={onChange} />;
      }
      return <TextField value={response} disabled={submitted} feedback={feedback} onChange={onChange} />;
  }
}
