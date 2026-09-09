"use client";

import { parseSignificantFiguresAnswerKey } from "@/lib/quiz/structured-choices";

export default function SignificantFiguresEditor({
  answerKey,
  onAnswerKeyChange,
}: {
  answerKey: string;
  onAnswerKeyChange: (k: string) => void;
}) {
  const key = parseSignificantFiguresAnswerKey(answerKey) ?? { value: 3.14, sigFigs: 2 };

  const update = (patch: Partial<{ value: number; sigFigs: number }>) => {
    const next = { ...key, ...patch };
    onAnswerKeyChange(JSON.stringify(next));
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Correct answer
      </p>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">Value</span>
          <input
            type="text"
            inputMode="decimal"
            value={String(key.value)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) update({ value: n });
            }}
            className="w-32 border border-gray-200 px-3 py-2 outline-none focus:border-iron-gray"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">Significant figures</span>
          <input
            type="number"
            min={1}
            max={12}
            value={key.sigFigs}
            onChange={(e) => update({ sigFigs: Math.max(1, Number(e.target.value) || 1) })}
            className="w-24 border border-gray-200 px-3 py-2 outline-none focus:border-iron-gray"
          />
        </label>
      </div>
      <p className="text-sm text-gray-400">
        Students are graded by rounding their answer to the required number of significant figures
        (e.g. 3.14 with 2 sig figs accepts 3.1).
      </p>
    </div>
  );
}
