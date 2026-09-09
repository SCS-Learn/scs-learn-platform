"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  categorizationChoicesFromConfig,
  parseCategorizationChoices,
  parseMappingAnswerKey,
  removeFromStringList,
  updateStringList,
} from "@/lib/quiz/structured-choices";
import type { QuestionChoices } from "@/lib/quiz/types";

export default function CategorizationEditor({
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
    parseCategorizationChoices(choices) ??
    ({ categories: ["Category A", "Category B"], items: ["Item 1", "Item 2"] } as const);
  const mapping = parseMappingAnswerKey(answerKey);

  const sync = (
    categories: string[],
    items: string[],
    nextMapping: Record<string, string>
  ) => {
    const cleanedCategories = categories.map((s) => s.trim()).filter(Boolean);
    const cleanedItems = items.map((s) => s.trim()).filter(Boolean);
    onChoicesChange(
      categorizationChoicesFromConfig({ categories: cleanedCategories, items: cleanedItems })
    );
    const filtered: Record<string, string> = {};
    for (const item of cleanedItems) {
      const cat = nextMapping[item];
      if (cat && cleanedCategories.includes(cat)) filtered[item] = cat;
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

  const categories = config.categories.length > 0 ? config.categories : [""];
  const items = config.items.length > 0 ? config.items : [""];

  return (
    <div className="flex flex-col gap-5">
      <ListEditor
        title="Categories"
        items={categories}
        onChange={(next) => sync(next, items, mapping)}
      />
      <ListEditor
        title="Items"
        items={items}
        onChange={(next) => sync(categories, next, mapping)}
        minItems={1}
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Correct categories
        </p>
        {items.filter(Boolean).map((item) => (
          <div key={item} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="text-sm sm:min-w-[8rem]">{item}</span>
            <select
              value={mapping[item] ?? ""}
              onChange={(e) => sync(categories, items, { ...mapping, [item]: e.target.value })}
              className="flex-1 text-sm border border-gray-200 px-3 py-2 bg-white"
            >
              <option value="">Select category…</option>
              {categories.filter(Boolean).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
