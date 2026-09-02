"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import type { StudentQuestion } from "@/lib/student/types";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** free_response has no reliable auto-comparison, so it's shown but never marked right/wrong — only multiple_choice/short_answer count toward the score. */
function isGradable(question: StudentQuestion): boolean {
  return question.answerKey !== null && question.questionType !== "free_response";
}

function isCorrect(question: StudentQuestion, response: string): boolean {
  if (!question.answerKey) return false;
  return normalize(response) === normalize(question.answerKey);
}

export default function QuizBlock({ questions }: { questions: StudentQuestion[] }) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const gradableQuestions = questions.filter(isGradable);
  const correctCount = gradableQuestions.filter((q) => isCorrect(q, responses[q.id] ?? "")).length;

  const setResponse = (questionId: string, value: string) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  const reset = () => {
    setResponses({});
    setSubmitted(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {questions.map((question, index) => {
        const response = responses[question.id] ?? "";
        const graded = submitted && isGradable(question);
        const correct = graded && isCorrect(question, response);

        return (
          <div
            key={question.id}
            className={`border rounded-md p-4 ${
              graded ? (correct ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50") : "border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs text-gray-400">Question {index + 1}</p>
              {graded && (correct ? <CheckCircle2 size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-500" />)}
            </div>
            <p className="text-sm font-medium whitespace-pre-wrap mb-3">{question.promptText}</p>

            {question.choices ? (
              <div className="flex flex-col gap-1.5">
                {question.choices.map((choice) => (
                  <label
                    key={choice}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded border ${
                      response === choice ? "border-primary/50 bg-primary/5" : "border-gray-200"
                    } ${submitted ? "cursor-default" : "cursor-pointer hover:bg-gray-50"}`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={choice}
                      checked={response === choice}
                      disabled={submitted}
                      onChange={() => setResponse(question.id, choice)}
                    />
                    {choice}
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                value={response}
                disabled={submitted}
                onChange={(e) => setResponse(question.id, e.target.value)}
                placeholder="Type your answer..."
                rows={2}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-primary/50 disabled:bg-white disabled:text-gray-700"
              />
            )}

            {graded && !correct && question.answerKey && (
              <p className="text-xs text-gray-600 mt-2">Correct answer: {question.answerKey}</p>
            )}
            {submitted && question.questionType === "free_response" && (
              <p className="text-xs text-gray-400 mt-2">Free response — not auto-graded.</p>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-4">
        {!submitted ? (
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            className="text-sm font-bold bg-primary text-white rounded px-4 py-2 hover:opacity-90"
          >
            Check answers
          </button>
        ) : (
          <>
            <p className="text-sm font-bold">
              Score: {correctCount} / {gradableQuestions.length}
            </p>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw size={13} />
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
