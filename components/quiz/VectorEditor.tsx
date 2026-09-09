"use client";

import { asObjectChoices } from "@/lib/quiz/parse";
import { parseVectorAnswerKey } from "@/lib/quiz/structured-choices";
import type { QuestionChoices } from "@/lib/quiz/types";

export default function VectorEditor({
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
  const config = asObjectChoices(choices);
  const dims = Math.max(1, Math.min(8, (config?.dimensions as number) ?? 3));
  const key = parseVectorAnswerKey(answerKey);
  const vector = Array.from({ length: dims }, (_, i) => key?.vector[i] ?? 0);

  const setDims = (nextDims: number) => {
    const d = Math.max(1, Math.min(8, nextDims));
    const nextVector = Array.from({ length: d }, (_, i) => vector[i] ?? 0);
    onChoicesChange({ ...(config ?? {}), dimensions: d });
    onAnswerKeyChange(JSON.stringify({ vector: nextVector }));
  };

  const setComponent = (index: number, raw: string) => {
    const n = Number(raw);
    const next = vector.map((v, i) => (i === index ? (Number.isFinite(n) ? n : 0) : v));
    onAnswerKeyChange(JSON.stringify({ vector: next }));
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 font-semibold uppercase tracking-wide">Dimensions</span>
        <input
          type="number"
          min={1}
          max={8}
          value={dims}
          onChange={(e) => setDims(Number(e.target.value))}
          className="w-16 border border-gray-200 px-2 py-1"
        />
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Correct vector
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">[</span>
          {vector.map((v, i) => (
            <input
              key={i}
              type="text"
              inputMode="decimal"
              value={String(v)}
              onChange={(e) => setComponent(i, e.target.value)}
              className="w-20 text-sm border border-gray-200 px-2 py-1.5 text-center outline-none focus:border-iron-gray"
              aria-label={`Component ${i + 1}`}
            />
          ))}
          <span className="text-sm">]</span>
        </div>
      </div>
    </div>
  );
}
