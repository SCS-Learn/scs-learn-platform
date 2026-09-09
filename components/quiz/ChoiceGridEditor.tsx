"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  choiceGridChoicesFromConfig,
  parseChoiceGridAnswerKey,
  parseChoiceGridChoices,
  removeFromStringList,
  updateStringList,
} from "@/lib/quiz/structured-choices";
import type { QuestionChoices } from "@/lib/quiz/types";

export default function ChoiceGridEditor({
  choices,
  answerKey,
  onChoicesChange,
  onAnswerKeyChange,
}: {
  choices: QuestionChoices;
  answerKey: string;
  onChoicesChange: (c: QuestionChoices) => void;
  onAnswerKeyChange: (k: string) => void;
}) {
  const config =
    parseChoiceGridChoices(choices) ??
    ({
      rows: ["Row 1"],
      cols: ["Column A", "Column B"],
      options: ["Option 1", "Option 2", "Option 3"],
    } as const);
  const gridAnswers = parseChoiceGridAnswerKey(answerKey);

  const sync = (
    rows: string[],
    cols: string[],
    options: string[],
    answers: Record<string, Record<string, string>>
  ) => {
    const cleanedRows = rows.map((s) => s.trim()).filter(Boolean);
    const cleanedCols = cols.map((s) => s.trim()).filter(Boolean);
    const cleanedOptions = options.map((s) => s.trim()).filter(Boolean);
    onChoicesChange(
      choiceGridChoicesFromConfig({
        rows: cleanedRows,
        cols: cleanedCols,
        options: cleanedOptions,
      })
    );
    const filtered: Record<string, Record<string, string>> = {};
    for (const row of cleanedRows) {
      filtered[row] = {};
      for (const col of cleanedCols) {
        const value = answers[row]?.[col];
        if (value && cleanedOptions.includes(value)) filtered[row][col] = value;
      }
    }
    onAnswerKeyChange(JSON.stringify(filtered));
  };

  const ListEditor = ({
    title,
    items,
    onChange,
    minItems = 1,
  }: {
    title: string;
    items: string[];
    onChange: (next: string[]) => void;
    minItems?: number;
  }) => (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      {items.map((item, index) => (
        <div key={`${title}-${index}`} className="flex items-center gap-3">
          <input
            type="text"
            value={item}
            onChange={(e) => onChange(updateStringList(items, index, e.target.value))}
            className="flex-1 text-base border border-gray-200 px-4 py-2.5 outline-none focus:border-iron-gray"
          />
          <button
            type="button"
            onClick={() => onChange(removeFromStringList(items, index, minItems))}
            disabled={items.length <= minItems}
            className="text-gray-400 hover:text-red-500 p-1.5 disabled:opacity-30"
            aria-label={`Remove ${title.toLowerCase()}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="self-start text-sm font-semibold text-iron-gray inline-flex items-center gap-1.5 hover:underline"
      >
        <Plus size={14} />
        Add {title.toLowerCase()}
      </button>
    </div>
  );

  const rows = config.rows.length > 0 ? config.rows : [""];
  const cols = config.cols.length > 0 ? config.cols : [""];
  const options = config.options.length > 0 ? config.options : [""];

  const setCell = (row: string, col: string, value: string) => {
    const next = {
      ...gridAnswers,
      [row]: { ...(gridAnswers[row] ?? {}), [col]: value },
    };
    sync(rows, cols, options, next);
  };

  return (
    <div className="flex flex-col gap-5">
      <ListEditor title="Rows" items={rows} onChange={(next) => sync(next, cols, options, gridAnswers)} />
      <ListEditor title="Columns" items={cols} onChange={(next) => sync(rows, next, options, gridAnswers)} />
      <ListEditor
        title="Options"
        items={options}
        onChange={(next) => sync(rows, cols, next, gridAnswers)}
        minItems={2}
      />

      {rows.filter(Boolean).length > 0 && cols.filter(Boolean).length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Correct selections
          </p>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr>
                  <th className="p-2" />
                  {cols.filter(Boolean).map((col) => (
                    <th key={col} className="p-2 text-left font-medium text-gray-600">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.filter(Boolean).map((row) => (
                  <tr key={row}>
                    <td className="p-2 font-medium">{row}</td>
                    {cols.filter(Boolean).map((col) => (
                      <td key={col} className="p-2">
                        <select
                          value={gridAnswers[row]?.[col] ?? ""}
                          onChange={(e) => setCell(row, col, e.target.value)}
                          className="text-sm border border-gray-200 px-2 py-1 bg-white w-full"
                        >
                          <option value="">—</option>
                          {options.filter(Boolean).map((opt) => (
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
        </div>
      )}
    </div>
  );
}
