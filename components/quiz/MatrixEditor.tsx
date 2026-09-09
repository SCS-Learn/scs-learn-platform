"use client";

import { asObjectChoices } from "@/lib/quiz/parse";
import {
  parseMatrixPerCellAnswerKey,
  parseMatrixWholeAnswerKey,
} from "@/lib/quiz/structured-choices";
import type { QuestionChoices } from "@/lib/quiz/types";

type MatrixMode = "matrix_whole" | "matrix_per_cell";

export default function MatrixEditor({
  mode,
  choices,
  answerKey,
  onChoicesChange,
  onAnswerKeyChange,
}: {
  mode: MatrixMode;
  choices: QuestionChoices;
  answerKey: string;
  onChoicesChange: (c: QuestionChoices) => void;
  onAnswerKeyChange: (k: string) => void;
}) {
  const config = asObjectChoices(choices);
  const wholeMatrix = parseMatrixWholeAnswerKey(answerKey);
  const perCell = parseMatrixPerCellAnswerKey(answerKey) ?? {};

  const rows =
    wholeMatrix?.length ??
    (() => {
      let max = (config?.rows as number) ?? 2;
      for (const key of Object.keys(perCell)) {
        const r = Number(key.split(",")[0]);
        if (Number.isFinite(r)) max = Math.max(max, r + 1);
      }
      return max;
    })();

  const cols =
    wholeMatrix?.[0]?.length ??
    (() => {
      let max = (config?.cols as number) ?? 2;
      for (const key of Object.keys(perCell)) {
        const c = Number(key.split(",")[1]);
        if (Number.isFinite(c)) max = Math.max(max, c + 1);
      }
      return max;
    })();

  const setSize = (nextRows: number, nextCols: number) => {
    const r = Math.max(1, Math.min(8, nextRows));
    const c = Math.max(1, Math.min(8, nextCols));
    onChoicesChange({
      ...(config ?? {}),
      rows: r,
      cols: c,
      rowLabels: Array.from({ length: r }, (_, i) => `R${i + 1}`),
      colLabels: Array.from({ length: c }, (_, i) => `C${i + 1}`),
    });

    if (mode === "matrix_whole") {
      const matrix = Array.from({ length: r }, (_, ri) =>
        Array.from({ length: c }, (_, ci) => wholeMatrix?.[ri]?.[ci] ?? 0)
      );
      onAnswerKeyChange(JSON.stringify({ matrix }));
    } else {
      const cells: Record<string, number> = {};
      for (let ri = 0; ri < r; ri += 1) {
        for (let ci = 0; ci < c; ci += 1) {
          const key = `${ri},${ci}`;
          cells[key] = perCell[key] ?? 0;
        }
      }
      onAnswerKeyChange(JSON.stringify({ cells }));
    }
  };

  const setCell = (rowIndex: number, colIndex: number, raw: string) => {
    const n = Number(raw);
    const value = Number.isFinite(n) ? n : 0;

    if (mode === "matrix_whole") {
      const matrix = Array.from({ length: rows }, (_, ri) =>
        Array.from({ length: cols }, (_, ci) => {
          if (ri === rowIndex && ci === colIndex) return value;
          return wholeMatrix?.[ri]?.[ci] ?? 0;
        })
      );
      onAnswerKeyChange(JSON.stringify({ matrix }));
      return;
    }

    onAnswerKeyChange(
      JSON.stringify({
        cells: { ...perCell, [`${rowIndex},${colIndex}`]: value },
      })
    );
  };

  const cellValue = (rowIndex: number, colIndex: number): string => {
    if (mode === "matrix_whole") {
      const v = wholeMatrix?.[rowIndex]?.[colIndex];
      return v === undefined ? "" : String(v);
    }
    const v = perCell[`${rowIndex},${colIndex}`];
    return v === undefined ? "" : String(v);
  };

  const rowLabels = Array.from({ length: rows }, (_, i) => `R${i + 1}`);
  const colLabels = Array.from({ length: cols }, (_, i) => `C${i + 1}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Rows</span>
          <input
            type="number"
            min={1}
            max={8}
            value={rows}
            onChange={(e) => setSize(Number(e.target.value), cols)}
            className="w-16 border border-gray-200 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Columns</span>
          <input
            type="number"
            min={1}
            max={8}
            value={cols}
            onChange={(e) => setSize(rows, Number(e.target.value))}
            className="w-16 border border-gray-200 px-2 py-1"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Correct values
        </p>
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th />
              {colLabels.map((label) => (
                <th key={label} className="p-1 text-gray-600 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((rowLabel, rowIndex) => (
              <tr key={rowLabel}>
                <td className="p-1 font-medium text-gray-700">{rowLabel}</td>
                {colLabels.map((_, colIndex) => (
                  <td key={`${rowIndex}-${colIndex}`} className="p-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cellValue(rowIndex, colIndex)}
                      onChange={(e) => setCell(rowIndex, colIndex, e.target.value)}
                      className="w-16 text-sm border border-gray-200 px-1 py-0.5 text-center outline-none focus:border-iron-gray"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
