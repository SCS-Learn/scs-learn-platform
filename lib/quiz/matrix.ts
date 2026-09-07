import { asObjectChoices, parseJson } from "@/lib/quiz/parse";
import type { QuestionChoices } from "@/lib/quiz/types";

export type MatrixShape = {
  rows: number;
  cols: number;
  rowLabels: string[];
  colLabels: string[];
};

export function matrixShapeFromAnswerKey(
  questionType: "matrix_whole" | "matrix_per_cell",
  answerKey: string | null
): { rows: number; cols: number } | null {
  if (!answerKey) return null;

  if (questionType === "matrix_whole") {
    const key = parseJson<{ matrix: number[][] }>(answerKey);
    if (!key?.matrix?.length) return null;
    const rows = key.matrix.length;
    const cols = Math.max(...key.matrix.map((row) => row.length), 0);
    return rows > 0 && cols > 0 ? { rows, cols } : null;
  }

  const key = parseJson<{ cells: Record<string, number> }>(answerKey);
  if (!key?.cells) return null;

  let maxRow = -1;
  let maxCol = -1;
  for (const cell of Object.keys(key.cells)) {
    const [row, col] = cell.split(",").map((part) => Number(part.trim()));
    if (Number.isFinite(row)) maxRow = Math.max(maxRow, row);
    if (Number.isFinite(col)) maxCol = Math.max(maxCol, col);
  }

  if (maxRow < 0 || maxCol < 0) return null;
  return { rows: maxRow + 1, cols: maxCol + 1 };
}

export function resolveMatrixShape(
  questionType: "matrix_whole" | "matrix_per_cell",
  answerKey: string | null,
  choices: QuestionChoices
): MatrixShape {
  const config = asObjectChoices(choices);
  const fromKey = matrixShapeFromAnswerKey(questionType, answerKey);
  const rows = fromKey?.rows ?? (config?.rows as number) ?? 2;
  const cols = fromKey?.cols ?? (config?.cols as number) ?? 2;

  const configRowLabels = config?.rowLabels as string[] | undefined;
  const configColLabels = config?.colLabels as string[] | undefined;

  return {
    rows,
    cols,
    rowLabels:
      configRowLabels?.length === rows
        ? configRowLabels
        : Array.from({ length: rows }, (_, i) => `R${i + 1}`),
    colLabels:
      configColLabels?.length === cols
        ? configColLabels
        : Array.from({ length: cols }, (_, i) => `C${i + 1}`),
  };
}

export function parseWholeMatrixResponse(
  response: string,
  rows: number,
  cols: number
): string[][] {
  const parsed = parseJson<number[][]>(response);
  return Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) => {
      const value = parsed?.[rowIndex]?.[colIndex];
      return value === undefined || value === null ? "" : String(value);
    })
  );
}

export function serializeWholeMatrix(matrix: string[][]): string {
  return JSON.stringify(
    matrix.map((row) =>
      row.map((cell) => {
        const trimmed = cell.trim();
        if (!trimmed) return 0;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : 0;
      })
    )
  );
}
