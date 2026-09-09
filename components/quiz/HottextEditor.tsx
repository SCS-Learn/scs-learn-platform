"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  hottextChoicesFromConfig,
  parseHottextAnswerKey,
  parseHottextChoices,
  removeFromStringList,
  updateStringList,
} from "@/lib/quiz/structured-choices";
import type { QuestionChoices } from "@/lib/quiz/types";

export default function HottextEditor({
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
    parseHottextChoices(choices) ??
    ({
      passage: "The quick brown fox jumps over the lazy dog.",
      terms: ["quick", "brown", "fox"],
    } as const);
  const correctTerms = new Set(parseHottextAnswerKey(answerKey));
  const [newTerm, setNewTerm] = useState("");

  const sync = (passage: string, terms: string[], correct: Set<string>) => {
    const cleanedTerms = terms.map((s) => s.trim()).filter(Boolean);
    onChoicesChange(hottextChoicesFromConfig({ passage, terms: cleanedTerms }));
    onAnswerKeyChange(
      JSON.stringify([...correct].filter((t) => cleanedTerms.includes(t)).sort())
    );
  };

  const terms = config.terms.length > 0 ? config.terms : [""];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Passage
        </label>
        <textarea
          value={config.passage}
          onChange={(e) => sync(e.target.value, terms, correctTerms)}
          rows={4}
          className="w-full text-base border border-gray-200 px-4 py-3 outline-none focus:border-iron-gray"
          placeholder="Enter the passage students will highlight words in."
        />
        <p className="text-sm text-gray-400">
          Question text above is shown separately as the intro. Add clickable terms below that appear in this passage.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Clickable terms
        </p>
        {terms.map((term, index) => (
          <div key={`term-${index}`} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={correctTerms.has(term) && term.trim() !== ""}
              disabled={!term.trim()}
              onChange={() => {
                const next = new Set(correctTerms);
                if (next.has(term)) next.delete(term);
                else next.add(term);
                sync(config.passage, terms, next);
              }}
              title="Mark as correct answer"
            />
            <input
              type="text"
              value={term}
              onChange={(e) => {
                const nextTerms = updateStringList(terms, index, e.target.value);
                const nextCorrect = new Set(
                  [...correctTerms].map((t) => (t === term ? e.target.value.trim() : t))
                );
                sync(config.passage, nextTerms, nextCorrect);
              }}
              className="flex-1 text-base border border-gray-200 px-4 py-2.5 outline-none focus:border-iron-gray"
              placeholder="Word or phrase in passage"
            />
            <button
              type="button"
              onClick={() => {
                const nextTerms = removeFromStringList(terms, index, 1);
                const nextCorrect = new Set(correctTerms);
                nextCorrect.delete(term);
                sync(config.passage, nextTerms, nextCorrect);
              }}
              disabled={terms.length <= 1}
              className="text-gray-400 hover:text-red-500 p-1.5 disabled:opacity-30"
              aria-label="Remove term"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            placeholder="New term"
            className="flex-1 text-base border border-gray-200 px-4 py-2.5 outline-none focus:border-iron-gray"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTerm.trim()) {
                e.preventDefault();
                sync(config.passage, [...terms, newTerm.trim()], correctTerms);
                setNewTerm("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!newTerm.trim()) return;
              sync(config.passage, [...terms, newTerm.trim()], correctTerms);
              setNewTerm("");
            }}
            className="text-sm font-semibold text-iron-gray inline-flex items-center gap-1.5 hover:underline shrink-0"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        <p className="text-sm text-gray-400">Check the boxes for terms that earn credit.</p>
      </div>
    </div>
  );
}
