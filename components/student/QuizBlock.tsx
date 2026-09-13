"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, MinusCircle, RotateCcw, Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import QuestionInput from "@/components/quiz/QuestionInput";
import RichText from "@/components/quiz/RichText";
import { submitQuiz, previewGradeQuiz, rateGradingFeedback } from "@/lib/student/data/quiz-progress";
import { formatCorrectAnswer } from "@/lib/quiz/format-answer";
import { isGradable, isLlmGradable } from "@/lib/quiz/grading";
import { questionEmbedsPrompt } from "@/lib/quiz/question-layout";
import {
  applyQuestionVariants,
  nextVariantIndex,
  quizVariantPoolSize,
} from "@/lib/quiz/variants";
import type { StudentQuestion, QuizSubmissionStatus } from "@/lib/student/types";

function feedbackStateFor(fraction: number | undefined): "correct" | "partial" | "incorrect" | null {
  if (fraction === undefined) return null;
  if (fraction >= 1) return "correct";
  if (fraction <= 0) return "incorrect";
  return "partial";
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function QuizBlock({
  courseCode,
  lessonId,
  questions,
  initialSubmission,
  previewMode = false,
  allowReferenceAnswers = false,
  onSubmitted,
  onReset,
}: {
  courseCode?: string;
  lessonId?: string;
  questions: StudentQuestion[];
  initialSubmission: QuizSubmissionStatus | null;
  /** Instructor preview — grades the same way as a real submission, but does not persist. */
  previewMode?: boolean;
  /** Real students only: whether the instructor has enabled showing free_response reference answers for this quiz. Ignored in previewMode, which always allows revealing via the click-to-show button. */
  allowReferenceAnswers?: boolean;
  onSubmitted?: (status: QuizSubmissionStatus) => void;
  onReset?: () => void;
}) {
  const poolSize = quizVariantPoolSize(questions);
  const [variantIndex, setVariantIndex] = useState(
    initialSubmission?.variantIndex ?? 0
  );
  const [responses, setResponses] = useState<Record<string, string>>(
    initialSubmission?.responses ?? {}
  );
  const [submission, setSubmission] = useState<QuizSubmissionStatus | null>(initialSubmission);
  const [submitted, setSubmitted] = useState(initialSubmission !== null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /** Preview-mode only — free_response reference answers stay hidden here until the instructor clicks to reveal them, so checking a preview doesn't spoil the model answer by default. */
  const [revealedAnswers, setRevealedAnswers] = useState<Set<string>>(new Set());

  const activeQuestions = applyQuestionVariants(questions, variantIndex);
  const gradableQuestions = activeQuestions.filter((q) => isGradable(q) || isLlmGradable(q));
  const correctCount = submission?.correctCount ?? 0;

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const payload = activeQuestions.map((question) => ({
          questionId: question.id,
          responseText: responses[question.id] ?? "",
        }));

        if (previewMode || !courseCode || !lessonId) {
          const graded = await previewGradeQuiz(payload, activeQuestions);
          const local: QuizSubmissionStatus = {
            ...graded,
            submittedAt: new Date().toISOString(),
            variantIndex,
          };
          setSubmission(local);
          setResponses(graded.responses);
          setSubmitted(true);
          onSubmitted?.(local);
          return;
        }

        const result = await submitQuiz(
          courseCode,
          lessonId,
          payload,
          activeQuestions,
          variantIndex
        );
        setSubmission(result);
        setResponses(result.responses);
        setVariantIndex(result.variantIndex);
        setSubmitted(true);
        onSubmitted?.(result);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Could not save your answers."
        );
      }
    });
  };

  const handleRateFeedback = (questionId: string, rating: "up" | "down") => {
    if (!lessonId || !submission) return;
    const current = submission.scores[questionId];
    if (!current) return;
    const nextRating: "up" | "down" | null = current.feedbackRating === rating ? null : rating;

    setSubmission({
      ...submission,
      scores: { ...submission.scores, [questionId]: { ...current, feedbackRating: nextRating } },
    });

    void rateGradingFeedback(lessonId, questionId, nextRating).catch((err) => {
      console.error("Failed to save grading feedback rating:", err);
    });
  };

  const toggleRevealAnswer = (questionId: string) => {
    setRevealedAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const reset = () => {
    setResponses({});
    setSubmission(null);
    setSubmitted(false);
    setError(null);
    setRevealedAnswers(new Set());
    setVariantIndex((current) => nextVariantIndex(current, poolSize));
    onReset?.();
  };

  if (questions.length === 0) {
    return (
      <div className="px-8 py-6">
        <p className="text-sm text-gray-500">
          No gradable questions were found in this assignment.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      {previewMode && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2">
          Preview mode — answers are graded but not saved.
        </p>
      )}

      {submitted && (
        <div className="flex items-center gap-4 pb-2 border-b border-gray-100">
          <p className="text-sm font-bold">
            Score: {formatPoints(correctCount)} / {submission?.gradableCount ?? gradableQuestions.length}
            {submission && submission.gradableCount > 0 ? ` (${submission.scorePercent}%)` : ""}
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

      {activeQuestions.map((question, index) => {
        const response = responses[question.id] ?? "";
        const score = submitted ? submission?.scores?.[question.id] : undefined;
        const graded = submitted && score !== undefined;
        const feedbackState = feedbackStateFor(score?.fraction);
        const isFreeResponse = question.questionType === "free_response";

        const embedsPrompt = questionEmbedsPrompt(
          question.questionType,
          question.choices,
          question.promptText
        );

        const borderClass =
          feedbackState === "correct"
            ? "border-green-500"
            : feedbackState === "partial"
              ? "border-amber-500"
              : feedbackState === "incorrect"
                ? "border-red-500"
                : "border-gray-200";

        return (
          <div key={`${question.id}-v${variantIndex}`} className={`border p-4 ${borderClass}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs text-gray-400">Question {index + 1}</p>
              {feedbackState === "correct" && <CheckCircle2 size={16} className="text-green-600" />}
              {feedbackState === "partial" && <MinusCircle size={16} className="text-amber-600" />}
              {feedbackState === "incorrect" && <XCircle size={16} className="text-red-500" />}
            </div>
            {!embedsPrompt && <RichText className="font-medium mb-3">{question.promptText}</RichText>}

            <QuestionInput
              questionId={question.id}
              questionType={question.questionType}
              promptText={question.promptText}
              choices={question.choices}
              answerKey={question.answerKey}
              response={response}
              submitted={submitted}
              feedback={feedbackState}
              onChange={(value) => setResponses((prev) => ({ ...prev, [question.id]: value }))}
            />

            {graded && feedbackState === "partial" && (
              <p className="text-xs text-amber-700 mt-2">Partial credit: {Math.round((score?.fraction ?? 0) * 100)}%</p>
            )}
            {graded && score?.feedback && (
              <p className="text-xs text-gray-600 mt-2">{score.feedback}</p>
            )}
            {graded && isFreeResponse && !previewMode && lessonId && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-400">Was this grading fair?</span>
                <button
                  type="button"
                  onClick={() => handleRateFeedback(question.id, "up")}
                  aria-label="Grading feedback was fair"
                  aria-pressed={score?.feedbackRating === "up"}
                  className={`p-1 rounded ${
                    score?.feedbackRating === "up"
                      ? "text-green-600 bg-green-50"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRateFeedback(question.id, "down")}
                  aria-label="Grading feedback was unfair"
                  aria-pressed={score?.feedbackRating === "down"}
                  className={`p-1 rounded ${
                    score?.feedbackRating === "down"
                      ? "text-red-600 bg-red-50"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <ThumbsDown size={14} />
                </button>
              </div>
            )}
            {graded && feedbackState !== "correct" && question.answerKey && !isFreeResponse && (
              <div className="text-xs text-gray-600 mt-2">
                <span className="font-medium">Correct answer:</span> {formatCorrectAnswer(question)}
              </div>
            )}
            {graded && feedbackState !== "correct" && question.answerKey && isFreeResponse && previewMode && (
              revealedAnswers.has(question.id) ? (
                <div className="text-xs text-gray-600 mt-2">
                  <span className="font-medium">Reference answer:</span>{" "}
                  <RichText className="mt-1">{formatCorrectAnswer(question)}</RichText>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleRevealAnswer(question.id)}
                  className="text-xs text-gray-500 underline hover:text-gray-700 mt-2"
                >
                  Show reference answer
                </button>
              )
            )}
            {graded && feedbackState !== "correct" && question.answerKey && isFreeResponse && !previewMode && allowReferenceAnswers && (
              <div className="text-xs text-gray-600 mt-2">
                <span className="font-medium">Reference answer:</span>{" "}
                <RichText className="mt-1">{formatCorrectAnswer(question)}</RichText>
              </div>
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
