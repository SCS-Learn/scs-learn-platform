"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import TopicLessonViewer, { type TopicLessonBlock } from "@/components/lesson/TopicLessonViewer";
import type { StudentLesson, QuizSubmissionStatus } from "@/lib/student/types";
import { markLessonComplete, unmarkLessonComplete } from "@/lib/student/data/lesson-progress";
import QuizBlock from "@/components/student/QuizBlock";
import AutogradedAssignmentCard from "@/components/student/AutogradedAssignmentCard";

function allQuestionsFromLesson(lesson: StudentLesson) {
  return lesson.blocks.flatMap((block) => block.questions ?? []);
}

export default function StudentLessonViewer({
  courseCode,
  lesson,
  onQuizSubmitted,
  onQuizReset,
  onCompletionChange,
}: {
  courseCode: string;
  lesson: StudentLesson;
  onQuizSubmitted?: (lessonId: string, status: QuizSubmissionStatus) => void;
  onQuizReset?: (lessonId: string) => void;
  onCompletionChange?: (lessonId: string, completedAt: string | null) => void;
}) {
  const questions = allQuestionsFromLesson(lesson);
  const isAssessment = lesson.type === "quiz" || questions.length > 0;
  const [completedAt, setCompletedAt] = useState(lesson.completedAt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const requiresPerfectScore = questions.length > 0;
  const quizPerfect = lesson.quizSubmission?.scorePercent === 100;
  const canMarkComplete = !requiresPerfectScore || quizPerfect;
  const isComplete = completedAt != null;

  const handleToggleComplete = () => {
    setError(null);
    startTransition(async () => {
      try {
        if (isComplete) {
          await unmarkLessonComplete(courseCode, lesson.id);
          setCompletedAt(null);
          onCompletionChange?.(lesson.id, null);
          return;
        }
        if (!canMarkComplete) {
          setError("Score 100% on this quiz before marking it complete.");
          return;
        }
        const next = await markLessonComplete(courseCode, lesson.id);
        setCompletedAt(next);
        onCompletionChange?.(lesson.id, next);
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : "Could not update completion.");
      }
    });
  };

  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden bg-white flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {lesson.autolab && (
          <AutogradedAssignmentCard lessonId={lesson.id} autolab={lesson.autolab} />
        )}

        {lesson.contentSource === "blocks" ? (
          lesson.blocks.length === 0 ? (
            <p className="px-8 py-6 text-sm text-gray-400">This lesson has no content yet.</p>
          ) : isAssessment ? (
            <>
              <div className="px-8 pt-6 pb-2">
                <h1 className="topic-lesson-title">{lesson.title}</h1>
              </div>
              <QuizBlock
                courseCode={courseCode}
                lessonId={lesson.id}
                questions={questions}
                initialSubmission={lesson.quizSubmission}
                onSubmitted={(status) => onQuizSubmitted?.(lesson.id, status)}
                onReset={() => onQuizReset?.(lesson.id)}
              />
            </>
          ) : (
            <TopicLessonViewer blocks={lesson.blocks as TopicLessonBlock[]} lessonTitle={lesson.title} />
          )
        ) : (
          <div className="lesson-tab-panel">
            <div
              className="course-notes-content lesson-content-editor"
              dangerouslySetInnerHTML={{ __html: lesson.contentHtml }}
            />
          </div>
        )}

        <div className="px-8 py-5 border-t border-gray-100 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleComplete}
              disabled={isPending || (!isComplete && !canMarkComplete)}
              className={`text-sm font-bold rounded px-4 py-2 flex items-center gap-2 disabled:opacity-50 ${
                isComplete
                  ? "border border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
                  : "bg-primary text-white hover:opacity-90"
              }`}
            >
              {isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              {isComplete ? "Completed" : "Mark as complete"}
            </button>
            {requiresPerfectScore && !isComplete && !canMarkComplete && (
              <p className="text-xs text-gray-500">Score 100% to mark this quiz complete.</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
