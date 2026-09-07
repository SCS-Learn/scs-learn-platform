"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  addOrderingItem,
  moveInOrder,
  orderingChoicesFromConfig,
  parseOrderingAnswerKey,
  parseOrderingChoices,
  removeOrderingItem,
  renameOrderingItem,
  sanitizeOrder,
} from "@/lib/quiz/ordering";
import type { QuestionChoices } from "@/lib/quiz/types";

function ReorderList({
  title,
  hint,
  order,
  onReorder,
}: {
  title: string;
  hint: string;
  order: string[];
  onReorder: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        <p className="text-sm text-gray-400 mt-1">{hint}</p>
      </div>
      {order.map((item, index) => (
        <div
          key={`${item}-${index}`}
          className="flex items-center gap-3 text-base border border-gray-200 px-4 py-2.5 bg-white"
        >
          <span className="text-sm text-gray-400 w-5 shrink-0">{index + 1}.</span>
          <span className="flex-1">{item}</span>
          <button
            type="button"
            onClick={() => onReorder(moveInOrder(order, index, index - 1))}
            disabled={index === 0}
            className="text-sm text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1.5"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onReorder(moveInOrder(order, index, index + 1))}
            disabled={index === order.length - 1}
            className="text-sm text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1.5"
            aria-label="Move down"
          >
            ↓
          </button>
        </div>
      ))}
    </div>
  );
}

export default function OrderingEditor({
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
    parseOrderingChoices(choices) ??
    ({
      items: ["Step 1", "Step 2", "Step 3"],
      displayOrder: ["Step 3", "Step 1", "Step 2"],
    } as const);

  const correctOrder = sanitizeOrder(
    parseOrderingAnswerKey(answerKey) ?? [...config.items],
    config.items
  );

  const sync = (nextItems: string[], displayOrder: string[], correct: string[]) => {
    const items = nextItems.map((s) => s.trim()).filter(Boolean);
    const nextConfig = {
      items,
      displayOrder: sanitizeOrder(displayOrder, items),
    };
    onChoicesChange(orderingChoicesFromConfig(nextConfig));
    onAnswerKeyChange(JSON.stringify(sanitizeOrder(correct, items)));
  };

  const [newItem, setNewItem] = useState("");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Items</p>
        {config.items.map((item, index) => (
          <div key={`item-${index}`} className="flex items-center gap-3">
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const renamed = renameOrderingItem(config, item, e.target.value);
                const renamedCorrect = correctOrder.map((s) =>
                  s === item ? e.target.value.trim() : s
                );
                sync(renamed.items, renamed.displayOrder, renamedCorrect);
              }}
              className="flex-1 text-base border border-gray-200 px-4 py-2.5 outline-none focus:border-iron-gray"
            />
            <button
              type="button"
              onClick={() => {
                const next = removeOrderingItem(config, item);
                sync(
                  next.items,
                  next.displayOrder,
                  correctOrder.filter((s) => s !== item)
                );
              }}
              disabled={config.items.length <= 2}
              className="text-gray-400 hover:text-red-500 p-1.5 disabled:opacity-30"
              aria-label="Remove item"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="New item"
            className="flex-1 text-base border border-gray-200 px-4 py-2.5 outline-none focus:border-iron-gray"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newItem.trim()) {
                e.preventDefault();
                const label = newItem.trim();
                const next = addOrderingItem(config, label);
                sync(next.items, next.displayOrder, [...correctOrder, label]);
                setNewItem("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!newItem.trim()) return;
              const label = newItem.trim();
              const next = addOrderingItem(config, label);
              sync(next.items, next.displayOrder, [...correctOrder, label]);
              setNewItem("");
            }}
            className="text-sm font-semibold text-iron-gray inline-flex items-center gap-1.5 hover:underline shrink-0"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      <ReorderList
        title="Display order"
        hint="Order shown to the student when they first open the question."
        order={config.displayOrder}
        onReorder={(displayOrder) => sync(config.items, displayOrder, correctOrder)}
      />

      <ReorderList
        title="Correct order"
        hint="Sequence that earns full credit when the student submits."
        order={correctOrder}
        onReorder={(order) => sync(config.items, config.displayOrder, order)}
      />
    </div>
  );
}
