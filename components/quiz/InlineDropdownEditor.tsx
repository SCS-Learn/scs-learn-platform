"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  defaultInlineDropdownConfig,
  encodeInlineDropdownAnswerKey,
  inlineDropdownChoicesFromConfig,
  nextBlankId,
  parseInlineDropdownAnswerKey,
  parseInlineDropdownChoices,
  type InlineDropdownBlank,
} from "@/lib/quiz/inline-dropdown";
import type { QuestionChoices } from "@/lib/quiz/types";

export default function InlineDropdownEditor({
  choices,
  answerKey,
  onChoicesChange,
  onAnswerKeyChange,
  questionId,
}: {
  choices: QuestionChoices;
  answerKey: string;
  onChoicesChange: (c: QuestionChoices) => void;
  onAnswerKeyChange: (k: string) => void;
  questionId: string;
}) {
  const config = parseInlineDropdownChoices(choices) ?? defaultInlineDropdownConfig();
  const answers = parseInlineDropdownAnswerKey(answerKey);
  const [newOptionByBlank, setNewOptionByBlank] = useState<Record<string, string>>({});

  const sync = (blanks: InlineDropdownBlank[], nextAnswers: Record<string, string>) => {
    const cleaned = blanks.map((blank) => ({
      id: blank.id.trim() || "b1",
      options: blank.options.map((opt) => opt.trim()).filter(Boolean),
    }));
    onChoicesChange(inlineDropdownChoicesFromConfig({ blanks: cleaned }));

    const pruned: Record<string, string> = {};
    for (const blank of cleaned) {
      const current = nextAnswers[blank.id];
      if (current && blank.options.includes(current)) {
        pruned[blank.id] = current;
      } else if (blank.options[0]) {
        pruned[blank.id] = blank.options[0];
      }
    }
    onAnswerKeyChange(encodeInlineDropdownAnswerKey(pruned));
  };

  const updateBlank = (index: number, patch: Partial<InlineDropdownBlank>) => {
    const blanks = config.blanks.map((blank, i) => (i === index ? { ...blank, ...patch } : blank));
    const nextAnswers = { ...answers };
    const prevId = config.blanks[index]?.id;
    if (patch.id && prevId && patch.id !== prevId && nextAnswers[prevId]) {
      nextAnswers[patch.id] = nextAnswers[prevId];
      delete nextAnswers[prevId];
    }
    sync(blanks, nextAnswers);
  };

  const updateOption = (blankIndex: number, optionIndex: number, value: string) => {
    const blank = config.blanks[blankIndex];
    const prev = blank.options[optionIndex] ?? "";
    const options = blank.options.map((opt, i) => (i === optionIndex ? value : opt));
    const nextAnswers = { ...answers };
    if (nextAnswers[blank.id] === prev) {
      nextAnswers[blank.id] = value.trim();
    }
    sync(
      config.blanks.map((b, i) => (i === blankIndex ? { ...b, options } : b)),
      nextAnswers
    );
  };

  const removeOption = (blankIndex: number, optionIndex: number) => {
    const blank = config.blanks[blankIndex];
    const removed = blank.options[optionIndex];
    const options = blank.options.filter((_, i) => i !== optionIndex);
    const nextAnswers = { ...answers };
    if (nextAnswers[blank.id] === removed) {
      delete nextAnswers[blank.id];
    }
    sync(
      config.blanks.map((b, i) => (i === blankIndex ? { ...b, options } : b)),
      nextAnswers
    );
  };

  const addOption = (blankIndex: number, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const blank = config.blanks[blankIndex];
    if (blank.options.includes(trimmed)) return;
    const options = [...blank.options, trimmed];
    const nextAnswers = { ...answers };
    if (!nextAnswers[blank.id]) {
      nextAnswers[blank.id] = trimmed;
    }
    sync(
      config.blanks.map((b, i) => (i === blankIndex ? { ...b, options } : b)),
      nextAnswers
    );
    setNewOptionByBlank((prev) => ({ ...prev, [blank.id]: "" }));
  };

  const addBlank = () => {
    const id = nextBlankId(config.blanks);
    sync(
      [...config.blanks, { id, options: ["Option A", "Option B"] }],
      { ...answers, [id]: "Option A" }
    );
  };

  const removeBlank = (index: number) => {
    const removed = config.blanks[index];
    const blanks = config.blanks.filter((_, i) => i !== index);
    const nextAnswers = { ...answers };
    delete nextAnswers[removed.id];
    sync(blanks, nextAnswers);
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-gray-400">
        Use {"{{b1}}"}, {"{{b2}}"}, or ___ in the question text for each dropdown. Blank ids below
        must match the placeholders.
      </p>

      {config.blanks.map((blank, blankIndex) => (
        <div key={`${blank.id}-${blankIndex}`} className="border border-gray-200 rounded-md p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide shrink-0">
              Blank
            </label>
            <input
              type="text"
              value={blank.id}
              onChange={(e) => updateBlank(blankIndex, { id: e.target.value })}
              className="w-24 text-sm border border-gray-200 px-3 py-2 font-mono outline-none focus:border-iron-gray"
              placeholder="b1"
            />
            {config.blanks.length > 1 && (
              <button
                type="button"
                onClick={() => removeBlank(blankIndex)}
                className="ml-auto text-gray-400 hover:text-red-500 p-1.5"
                aria-label="Remove blank"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Dropdown options — mark the correct answer
            </p>
            {blank.options.map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-3">
                <input
                  type="radio"
                  name={`inline-dropdown-${questionId}-${blank.id}`}
                  checked={answers[blank.id] === option && option.trim() !== ""}
                  disabled={!option.trim()}
                  onChange={() =>
                    sync(config.blanks, { ...answers, [blank.id]: option })
                  }
                />
                <input
                  type="text"
                  value={option}
                  onChange={(e) => updateOption(blankIndex, optionIndex, e.target.value)}
                  className="flex-1 text-base border border-gray-200 px-4 py-2.5 outline-none focus:border-iron-gray"
                  placeholder={`Option ${optionIndex + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeOption(blankIndex, optionIndex)}
                  disabled={blank.options.length <= 2}
                  className="text-gray-400 hover:text-red-500 p-1.5 disabled:opacity-30"
                  aria-label="Remove option"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newOptionByBlank[blank.id] ?? ""}
                onChange={(e) =>
                  setNewOptionByBlank((prev) => ({ ...prev, [blank.id]: e.target.value }))
                }
                placeholder="New option"
                className="flex-1 text-base border border-gray-200 px-4 py-2.5 outline-none focus:border-iron-gray"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption(blankIndex, newOptionByBlank[blank.id] ?? "");
                  }
                }}
              />
              <button
                type="button"
                onClick={() => addOption(blankIndex, newOptionByBlank[blank.id] ?? "")}
                className="text-sm font-semibold text-iron-gray inline-flex items-center gap-1.5 hover:underline shrink-0"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addBlank}
        className="self-start text-sm font-semibold text-iron-gray inline-flex items-center gap-1.5 hover:underline"
      >
        <Plus size={14} />
        Add blank
      </button>
    </div>
  );
}
