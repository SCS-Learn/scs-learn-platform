"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, RotateCcw, Loader2 } from "lucide-react";
import QuestionInput from "@/components/quiz/QuestionInput";
import { submitQuiz } from "@/lib/student/data/quiz-progress";
import { formatCorrectAnswer } from "@/lib/quiz/format-answer";
import { isCorrect, isGradable, scoreQuiz } from "@/lib/quiz/grading";
import { questionEmbedsPrompt } from "@/lib/quiz/question-layout";
import type { StudentQuestion, QuizSubmissionStatus } from "@/lib/student/types";

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
  const [submitted, setSubmitted] = useState(initialSubmission !== null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Always score against the current question list so add/delete updates the denominator.
  const liveScore = scoreQuiz(questions, responses);

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      try {
        if (previewMode || !courseCode || !lessonId) {
          const graded = scoreQuiz(questions, responses);
          const local: QuizSubmissionStatus = {
            ...graded,
            submittedAt: new Date().toISOString(),
            responses,
          };
          setSubmitted(true);
          onSubmitted?.(local);
          return;
        }

        const payload = questions.map((question) => ({
          questionId: question.id,
          responseText: responses[question.id] ?? "",
        }));
        const result = await submitQuiz(courseCode, lessonId, payload, questions);
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
    setSubmitted(false);
    setError(null);
    onReset?.();
  };

  if (questions.length === 0) {
    return (
      <div className="px-8 py-6">
        <p className="text-sm text-gray-500">
          No auto-gradable questions were found in this assignment.
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

      {submitted && (
        <div className="flex items-center gap-4 pb-2 border-b border-gray-100">
          <p className="text-sm font-bold">
            Score: {liveScore.correctCount} / {liveScore.gradableCount}
            {liveScore.gradableCount > 0 ? ` (${liveScore.scorePercent}%)` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw size={13} />
            Try again
          </button>
        </div>
      )}

      {questions.map((question, index) => {
        const response = responses[question.id] ?? "";
        const graded = submitted && isGradable(question);
        const correct = graded && isCorrect(question, response);

        const embedsPrompt = questionEmbedsPrompt(
          question.questionType,
          question.choices,
          question.promptText
        );

        return (
          <div
            key={question.id}
            className={`border p-4 ${
              graded ? (correct ? "border-green-500" : "border-red-500") : "border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs text-gray-400">Question {index + 1}</p>
              {graded && (correct ? <CheckCircle2 size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-500" />)}
            </div>
            {!embedsPrompt && (
              <p className="text-sm font-medium whitespace-pre-wrap mb-3">{question.promptText}</p>
            )}

            <QuestionInput
              questionId={question.id}
              questionType={question.questionType}
              promptText={question.promptText}
              choices={question.choices}
              answerKey={question.answerKey}
              response={response}
              submitted={submitted}
              feedback={graded ? (correct ? "correct" : "incorrect") : null}
              onChange={(value) => setResponses((prev) => ({ ...prev, [question.id]: value }))}
            />

            {graded && !correct && question.answerKey && (
              <p className="text-xs text-gray-600 mt-2">
                Correct answer: {formatCorrectAnswer(question)}
              </p>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-4">
        {!submitted && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="text-sm font-bold bg-primary text-white px-4 py-2 hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            Check answers
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
