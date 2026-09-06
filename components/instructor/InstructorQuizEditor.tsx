"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { updateQuestion } from "@/lib/instructor/data/questions";
import {
  decodeMultipleSelectResponse,
  encodeMultipleSelectResponse,
  isValidShortAnswer,
} from "@/lib/quiz/grading";
import { AUTOGRADABLE_QUESTION_TYPES, type AutogradableQuestionType } from "@/lib/quiz/types";
import type { QuestionView } from "@/lib/instructor/mock-data";

const TYPE_LABELS: Record<AutogradableQuestionType, string> = {
  multiple_choice: "Multiple choice",
  multiple_select: "Select all that apply",
  true_false: "True / False",
  short_answer: "Short answer",
};

function asAutogradable(type: string): AutogradableQuestionType {
  if ((AUTOGRADABLE_QUESTION_TYPES as string[]).includes(type)) {
    return type as AutogradableQuestionType;
  }
  return "short_answer";
}

function QuestionEditorCard({
  courseCode,
  question,
  index,
  onSaved,
}: {
  courseCode: string;
  question: QuestionView;
  index: number;
  onSaved: (next: QuestionView) => void;
}) {
  const [promptText, setPromptText] = useState(question.promptText);
  const [questionType, setQuestionType] = useState<AutogradableQuestionType>(
    asAutogradable(question.questionType)
  );
  const [choices, setChoices] = useState<string[]>(
    question.choices && question.choices.length > 0
      ? [...question.choices]
      : questionType === "true_false"
        ? ["True", "False"]
        : ["", ""]
  );
  const [answerKey, setAnswerKey] = useState(question.answerKey ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [isPending, startTransition] = useTransition();

  const usesChoices =
    questionType === "multiple_choice" ||
    questionType === "multiple_select" ||
    questionType === "true_false";

  const changeType = (next: AutogradableQuestionType) => {
    setQuestionType(next);
    if (next === "true_false") {
      setChoices(["True", "False"]);
      setAnswerKey((prev) => (prev === "True" || prev === "False" ? prev : "True"));
    } else if (next === "short_answer") {
      setChoices([]);
    } else if (choices.length < 2) {
      setChoices(["", ""]);
    }
  };

  const save = () => {
    setError(null);
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt) {
      setError("Question text is required.");
      return;
    }

    let nextChoices: string[] | null = null;
    let nextAnswer = answerKey.trim();

    if (usesChoices) {
      const cleaned = (questionType === "true_false" ? ["True", "False"] : choices)
        .map((c) => c.trim())
        .filter(Boolean);
      if (cleaned.length < 2) {
        setError("Add at least two options.");
        return;
      }
      nextChoices = cleaned;

      if (questionType === "multiple_select") {
        const selected = decodeMultipleSelectResponse(answerKey).filter((s) =>
          cleaned.includes(s)
        );
        if (selected.length === 0) {
          setError("Select at least one correct option.");
          return;
        }
        nextAnswer = encodeMultipleSelectResponse(selected);
      } else if (!cleaned.includes(nextAnswer)) {
        setError("Select the correct answer from the options.");
        return;
      }
    } else {
      nextAnswer = answerKey.trim();
      if (!isValidShortAnswer(nextAnswer)) {
        setError("Enter a valid answer pattern (plain text like ATGGCC, or regex like overlap|overlapping).");
        return;
      }
    }

    startTransition(async () => {
      try {
        const updated = await updateQuestion(courseCode, question.id, {
          promptText: trimmedPrompt,
          questionType,
          choices: nextChoices,
          answerKey: nextAnswer,
          needsReview: false,
        });
        onSaved({
          id: updated.id,
          promptText: updated.promptText,
          choices: updated.choices,
          answerKey: updated.answerKey,
          questionType: updated.questionType,
          needsReview: updated.needsReview,
        });
        setAnswerKey(updated.answerKey ?? "");
        setChoices(updated.choices ?? (questionType === "true_false" ? ["True", "False"] : []));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not save question.");
      }
    });
  };

  const selectedMulti = new Set(decodeMultipleSelectResponse(answerKey));

  return (
    <div className="border border-gray-200 rounded-md p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400">Question {index + 1}</p>
        <select
          value={questionType}
          onChange={(e) => changeType(e.target.value as AutogradableQuestionType)}
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
        >
          {AUTOGRADABLE_QUESTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={promptText}
        onChange={(e) => setPromptText(e.target.value)}
        rows={3}
        className="w-full text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-iron-gray"
        placeholder="Question text"
      />

      {usesChoices ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Options — mark the correct answer
          </p>
          {choices.map((choice, choiceIndex) => (
            <div key={choiceIndex} className="flex items-center gap-2">
              {questionType === "multiple_select" ? (
                <input
                  type="checkbox"
                  checked={selectedMulti.has(choice) && choice.trim() !== ""}
                  disabled={!choice.trim()}
                  onChange={() => {
                    const next = new Set(selectedMulti);
                    if (next.has(choice)) next.delete(choice);
                    else next.add(choice);
                    setAnswerKey(encodeMultipleSelectResponse([...next]));
                  }}
                />
              ) : (
                <input
                  type="radio"
                  name={`answer-${question.id}`}
                  checked={answerKey === choice && choice.trim() !== ""}
                  disabled={!choice.trim()}
                  onChange={() => setAnswerKey(choice)}
                />
              )}
              <input
                type="text"
                value={choice}
                disabled={questionType === "true_false"}
                onChange={(e) => {
                  const next = [...choices];
                  const prev = next[choiceIndex] ?? "";
                  next[choiceIndex] = e.target.value;
                  setChoices(next);
                  if (questionType === "multiple_choice" && answerKey === prev) {
                    setAnswerKey(e.target.value);
                  }
                  if (questionType === "multiple_select" && selectedMulti.has(prev)) {
                    const selected = [...selectedMulti].map((s) => (s === prev ? e.target.value : s));
                    setAnswerKey(encodeMultipleSelectResponse(selected.filter(Boolean)));
                  }
                }}
                className="flex-1 text-sm border border-gray-200 rounded px-3 py-1.5 outline-none focus:border-iron-gray disabled:bg-gray-50"
                placeholder={`Option ${choiceIndex + 1}`}
              />
              {questionType !== "true_false" && (
                <button
                  type="button"
                  onClick={() => {
                    const removed = choices[choiceIndex];
                    const next = choices.filter((_, i) => i !== choiceIndex);
                    setChoices(next.length >= 2 ? next : [...next, ""]);
                    if (questionType === "multiple_choice" && answerKey === removed) {
                      setAnswerKey("");
                    }
                    if (questionType === "multiple_select" && removed) {
                      const selected = [...selectedMulti].filter((s) => s !== removed);
                      setAnswerKey(encodeMultipleSelectResponse(selected));
                    }
                  }}
                  className="text-gray-400 hover:text-red-500 p-1"
                  aria-label="Remove option"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {questionType !== "true_false" && (
            <button
              type="button"
              onClick={() => setChoices((prev) => [...prev, ""])}
              className="self-start text-xs font-semibold text-iron-gray inline-flex items-center gap-1 hover:underline"
            >
              <Plus size={12} />
              Add option
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Correct answer
          </label>
          <input
            type="text"
            value={answerKey}
            onChange={(e) => setAnswerKey(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 outline-none focus:border-iron-gray"
            placeholder="ATGGCC or overlap|overlapping"
          />
          <p className="text-xs text-gray-400">
            Matched case-insensitively via regex. Plain text matches exactly; use | for alternates.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="text-sm font-bold text-black border border-black rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center gap-2"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          Save question
        </button>
        {savedFlash && <span className="text-xs text-green-700">Saved</span>}
        {question.needsReview && !savedFlash && (
          <span className="text-xs text-amber-700">Needs review</span>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function InstructorQuizEditor({
  courseCode,
  lessonTitle,
  questions,
  onQuestionSaved,
}: {
  courseCode: string;
  lessonTitle: string;
  questions: QuestionView[];
  onQuestionSaved: (question: QuestionView) => void;
}) {
  return (
    <div className="topic-lesson min-h-full flex flex-col">
      <div className="px-8 pt-6 pb-2">
        <h1 className="topic-lesson-title">{lessonTitle}</h1>
      </div>

      {questions.length === 0 ? (
        <div className="px-8 py-6">
          <p className="text-sm text-gray-500">
            No auto-gradable questions were found in this file. Source attachments remain in the
            lesson settings panel if you want to write questions manually later.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-8 py-4 pb-10">
          <p className="text-xs text-gray-500">
            Edit question text, options, and the correct answer. Changes save to the course.
          </p>
          {questions.map((question, index) => (
            <QuestionEditorCard
              key={question.id}
              courseCode={courseCode}
              question={question}
              index={index}
              onSaved={onQuestionSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
