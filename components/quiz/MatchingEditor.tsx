"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  matchingChoicesFromConfig,
  parseMappingAnswerKey,
  parseMatchingChoices,
  removeFromStringList,
  updateStringList,
} from "@/lib/quiz/structured-choices";
import type { QuestionChoices } from "@/lib/quiz/types";

export default function MatchingEditor({
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
    parseMatchingChoices(choices) ?? { left: ["Item 1", "Item 2"], right: ["Match A", "Match B"] };
  const mapping = parseMappingAnswerKey(answerKey);

  const sync = (left: string[], right: string[], nextMapping: Record<string, string>) => {
    const cleanedLeft = left.map((s) => s.trim()).filter(Boolean);
    const cleanedRight = right.map((s) => s.trim()).filter(Boolean);
    onChoicesChange(matchingChoicesFromConfig({ left: cleanedLeft, right: cleanedRight }));
    const filtered: Record<string, string> = {};
    for (const item of cleanedLeft) {
      const match = nextMapping[item];
      if (match && cleanedRight.includes(match)) filtered[item] = match;
    }
    onAnswerKeyChange(JSON.stringify(filtered));
  };

  const ListEditor = ({
    title,
    items,
    onChange,
    minItems = 2,
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
            placeholder={`${title} ${index + 1}`}
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

  const left = config.left.length > 0 ? config.left : [""];
  const right = config.right.length > 0 ? config.right : [""];

  return (
    <div className="flex flex-col gap-5">
      <ListEditor
        title="Left column"
        items={left}
        onChange={(nextLeft) => sync(nextLeft, right, mapping)}
      />
      <ListEditor
        title="Right column"
        items={right}
        onChange={(nextRight) => sync(left, nextRight, mapping)}
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Correct matches
        </p>
        {left.filter(Boolean).map((item) => (
          <div key={item} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="text-sm sm:min-w-[8rem]">{item}</span>
            <select
              value={mapping[item] ?? ""}
              onChange={(e) =>
                sync(left, right, { ...mapping, [item]: e.target.value })
              }
              className="flex-1 text-sm border border-gray-200 px-3 py-2 bg-white"
            >
              <option value="">Select match…</option>
              {right.filter(Boolean).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
