"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import TopicLessonViewer, { type TopicLessonBlock } from "@/components/lesson/TopicLessonViewer";
import type { StudentLesson, QuizSubmissionStatus } from "@/lib/student/types";
import { markLessonComplete, unmarkLessonComplete } from "@/lib/student/data/lesson-progress";
import QuizBlock from "@/components/student/QuizBlock";
import AutogradedAssignmentCard from "@/components/student/AutogradedAssignmentCard";
import ExternalActivity from "@/components/lti/ExternalActivity";

type ExternalTab = "assignment" | "writeup";

const EXTERNAL_TAB_LABELS: Record<ExternalTab, string> = {
  assignment: "Assignment",
  writeup: "Writeup",
};

function allQuestionsFromLesson(lesson: StudentLesson) {
  return lesson.blocks.flatMap((block) => block.questions ?? []);
}

function CompletionFooter({
  isComplete,
  isPending,
  canMarkComplete,
  hasQuizQuestions,
  thresholdMessage,
  error,
  onToggle,
}: {
  isComplete: boolean;
  isPending: boolean;
  canMarkComplete: boolean;
  hasQuizQuestions: boolean;
  thresholdMessage: string;
  error: string | null;
  onToggle: () => void;
}) {
  return (
    <div className="shrink-0 px-8 py-5 border-t border-gray-100 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={isPending || (!isComplete && !canMarkComplete)}
          className={`text-sm font-bold px-4 py-2 flex items-center gap-2 disabled:opacity-50 ${
            isComplete
              ? "border border-green-500 text-green-800 hover:bg-gray-50"
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
        {hasQuizQuestions && !isComplete && !canMarkComplete && (
          <p className="text-xs text-gray-500">{thresholdMessage}</p>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
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
  const isExternal = lesson.type === "external" || lesson.lti !== null;
  const isAssessment = !isExternal && (lesson.type === "quiz" || questions.length > 0);
  const [completedAt, setCompletedAt] = useState(lesson.completedAt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const writeupBlock = useMemo(
    () => lesson.blocks.find((block) => block.kind === "course_notes" && block.bodyHtml),
    [lesson.blocks]
  );
  const hasWriteup = Boolean(writeupBlock?.bodyHtml);
  const hasAssignment = Boolean(lesson.lti) || Boolean(lesson.autolab);

  const externalTabs = useMemo(() => {
    const tabs: ExternalTab[] = [];
    if (hasAssignment) tabs.push("assignment");
    if (hasWriteup) tabs.push("writeup");
    return tabs;
  }, [hasAssignment, hasWriteup]);

  const [externalTab, setExternalTab] = useState<ExternalTab>(
    () => externalTabs[0] ?? "assignment"
  );

  useEffect(() => {
    if (!externalTabs.includes(externalTab)) {
      setExternalTab(externalTabs[0] ?? "assignment");
    }
  }, [externalTab, externalTabs]);

  const completionThreshold = lesson.quizCompletionThreshold;
  const hasQuizQuestions = questions.length > 0;
  const quizMeetsThreshold =
    (lesson.quizSubmission?.scorePercent ?? 0) >= completionThreshold;
  const canMarkComplete = !hasQuizQuestions || quizMeetsThreshold;
  const isComplete = completedAt != null;
  const thresholdMessage =
    completionThreshold === 100
      ? "Score 100% to mark this quiz complete."
      : `Score at least ${completionThreshold}% to mark this quiz complete.`;
  const thresholdErrorMessage = thresholdMessage.replace(
    " to mark this quiz complete.",
    " before marking it complete."
  );

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
          setError(thresholdErrorMessage);
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

  const completionProps = {
    isComplete,
    isPending,
    canMarkComplete,
    hasQuizQuestions,
    thresholdMessage,
    error,
    onToggle: handleToggleComplete,
  };

  if (isExternal) {
    const showTabBar = externalTabs.length > 1;
    const activeTab = externalTabs.includes(externalTab)
      ? externalTab
      : (externalTabs[0] ?? "assignment");

    return (
      <div className="h-full min-h-0 min-w-0 overflow-hidden bg-white flex flex-col">
        <div className="topic-lesson-header shrink-0">
          <h1 className="topic-lesson-title">{lesson.title}</h1>
          {showTabBar && (
            <div className="lesson-tab-bar" role="tablist" aria-label="External assignment sections">
              {externalTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`lesson-tab${activeTab === tab ? " is-active" : ""}`}
                  onClick={() => setExternalTab(tab)}
                >
                  {EXTERNAL_TAB_LABELS[tab]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {activeTab === "assignment" && (
            <div className="flex-1 min-h-0 flex flex-col gap-4 px-8 py-4 overflow-hidden">
              {lesson.lti && (
                <ExternalActivity
                  lessonId={lesson.id}
                  title={lesson.lti.title}
                  kind="lti"
                  url={`/api/lti/launch/${lesson.lti.linkId}`}
                  initialScore={lesson.lti.score}
                  pointsPossible={lesson.lti.pointsPossible}
                  hideTitle
                  fillAvailableHeight
                />
              )}
              {lesson.autolab && (
                <div className="overflow-y-auto">
                  <AutogradedAssignmentCard lessonId={lesson.id} autolab={lesson.autolab} />
                </div>
              )}
              {!lesson.lti && !lesson.autolab && (
                <p className="text-sm text-gray-400">
                  This external assignment is not linked to an activity yet.
                </p>
              )}
            </div>
          )}

          {activeTab === "writeup" && writeupBlock?.bodyHtml && (
            <div
              className="flex-1 min-h-0 overflow-y-auto lesson-tab-panel"
              role="tabpanel"
              aria-label="Writeup"
            >
              <div
                className="course-notes-content lesson-content-editor"
                dangerouslySetInnerHTML={{ __html: writeupBlock.bodyHtml }}
              />
            </div>
          )}
        </div>

        <CompletionFooter {...completionProps} />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden bg-white flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
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

        <CompletionFooter {...completionProps} />
      </div>
    </div>
  );
}
