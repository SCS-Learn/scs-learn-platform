"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, RotateCcw, Loader2 } from "lucide-react";
import { submitQuiz } from "@/lib/student/data/quiz-progress";
import {
  decodeMultipleSelectResponse,
  encodeMultipleSelectResponse,
  isCorrect,
  isGradable,
} from "@/lib/quiz/grading";
import type { StudentQuestion, QuizSubmissionStatus } from "@/lib/student/types";

function gradeLocally(
  questions: StudentQuestion[],
  responses: Record<string, string>
): Pick<QuizSubmissionStatus, "correctCount" | "gradableCount" | "scorePercent" | "responses"> {
  const gradableQuestions = questions.filter(isGradable);
  const correctCount = gradableQuestions.filter((q) => isCorrect(q, responses[q.id] ?? "")).length;
  const gradableCount = gradableQuestions.length;
  return {
    correctCount,
    gradableCount,
    scorePercent: gradableCount > 0 ? Math.round((correctCount / gradableCount) * 100) : 0,
    responses,
  };
}

function QuestionInput({
  question,
  response,
  submitted,
  onChange,
}: {
  question: StudentQuestion;
  response: string;
  submitted: boolean;
  onChange: (value: string) => void;
}) {
  const type = question.questionType;
  const choices =
    type === "true_false" && (!question.choices || question.choices.length < 2)
      ? ["True", "False"]
      : question.choices;

  if (type === "multiple_select" && choices && choices.length > 0) {
    const selected = new Set(decodeMultipleSelectResponse(response));
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-gray-500 mb-1">Select all that apply</p>
        {choices.map((choice) => (
          <label
            key={choice}
            className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded border ${
              selected.has(choice) ? "border-primary/50 bg-primary/5" : "border-gray-200"
            } ${submitted ? "cursor-default" : "cursor-pointer hover:bg-gray-50"}`}
          >
            <input
              type="checkbox"
              checked={selected.has(choice)}
              disabled={submitted}
              onChange={() => {
                const next = new Set(selected);
                if (next.has(choice)) next.delete(choice);
                else next.add(choice);
                onChange(encodeMultipleSelectResponse([...next]));
              }}
            />
            {choice}
          </label>
        ))}
      </div>
    );
  }

  if (choices && choices.length > 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {choices.map((choice) => (
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
              onChange={() => onChange(choice)}
            />
            {choice}
          </label>
        ))}
      </div>
    );
  }

  return (
    <textarea
      value={response}
      disabled={submitted}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer..."
      rows={type === "short_answer" ? 2 : 3}
      className="w-full text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-primary/50 disabled:bg-white disabled:text-gray-700"
    />
  );
}

function formatCorrectAnswer(question: StudentQuestion): string {
  if (question.questionType === "multiple_select" && question.answerKey) {
    try {
      return (JSON.parse(question.answerKey) as string[]).join(", ");
    } catch {
      return question.answerKey;
    }
  }
  return question.answerKey ?? "";
}

export default function QuizBlock({
  courseCode,
  lessonId,
  questions,
  initialSubmission,
  previewMode = false,
  onSubmitted,
  onReset,
}: {
  courseCode?: string;
  lessonId?: string;
  questions: StudentQuestion[];
  initialSubmission: QuizSubmissionStatus | null;
  /** Instructor preview — grades locally, does not persist. */
  previewMode?: boolean;
  onSubmitted?: (status: QuizSubmissionStatus) => void;
  onReset?: () => void;
}) {
  const [responses, setResponses] = useState<Record<string, string>>(initialSubmission?.responses ?? {});
  const [submission, setSubmission] = useState<QuizSubmissionStatus | null>(initialSubmission);
  const [submitted, setSubmitted] = useState(initialSubmission !== null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const gradableQuestions = questions.filter(isGradable);
  const correctCount =
    submission?.correctCount ??
    gradableQuestions.filter((q) => isCorrect(q, responses[q.id] ?? "")).length;

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      try {
        if (previewMode || !courseCode || !lessonId) {
          const graded = gradeLocally(questions, responses);
          const local: QuizSubmissionStatus = {
            ...graded,
            submittedAt: new Date().toISOString(),
          };
          setSubmission(local);
          setSubmitted(true);
          onSubmitted?.(local);
          return;
        }

        const payload = questions.map((question) => ({
          questionId: question.id,
          responseText: responses[question.id] ?? "",
        }));
        const result = await submitQuiz(courseCode, lessonId, payload, questions);
        setSubmission(result);
        setResponses(result.responses);
        setSubmitted(true);
        onSubmitted?.(result);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Could not save your answers.");
      }
    });
  };

  const reset = () => {
    setResponses({});
    setSubmission(null);
    setSubmitted(false);
    setError(null);
    onReset?.();
  };

  if (questions.length === 0) {
    return (
      <div className="px-8 py-6">
        <p className="text-sm text-gray-500">
          No auto-gradable questions could be built from this assignment. Re-import the file or edit questions manually.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      {previewMode && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2">
          Preview mode — answers are graded locally and not saved.
        </p>
      )}

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

            <QuestionInput
              question={question}
              response={response}
              submitted={submitted}
              onChange={(value) => setResponses((prev) => ({ ...prev, [question.id]: value }))}
            />

            {graded && !correct && question.answerKey && (
              <p className="text-xs text-gray-600 mt-2">Correct answer: {formatCorrectAnswer(question)}</p>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-4">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="text-sm font-bold bg-primary text-white rounded px-4 py-2 hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            Check answers
          </button>
        ) : (
          <>
            <p className="text-sm font-bold">
              Score: {correctCount} / {submission?.gradableCount ?? gradableQuestions.length}
              {submission && submission.gradableCount > 0 ? ` (${submission.scorePercent}%)` : ""}
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

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
