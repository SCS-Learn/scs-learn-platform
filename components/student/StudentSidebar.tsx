"use client";

import Link from "next/link";
import { ArrowLeft, FileText, CircleHelp, CheckCircle2, ExternalLink } from "lucide-react";
import type { StudentUnit, StudentLesson } from "@/lib/student/types";

function LessonIcon({ type }: { type: StudentLesson["type"] }) {
  if (type === "quiz") {
    return <CircleHelp size={14} className="text-gray-400 shrink-0" />;
  }
  if (type === "external") {
    return <ExternalLink size={14} className="text-gray-400 shrink-0" />;
  }
  return <FileText size={14} className="text-gray-400 shrink-0" />;
}

export default function StudentSidebar({
  courseCode,
  courseTitle,
  units,
  selectedLessonId,
  onSelectLesson,
}: {
  courseCode: string;
  courseTitle: string;
  units: StudentUnit[];
  selectedLessonId: string;
  onSelectLesson: (lessonId: string) => void;
}) {
  const allLessons = units.flatMap((u) => u.lessons);
  const percentComplete =
    allLessons.length === 0
      ? 0
      : Math.round((allLessons.filter((l) => l.completedAt != null).length / allLessons.length) * 100);

  return (
    <aside className="w-80 shrink-0 h-full min-h-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <Link
          href={`/student/${courseCode}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-black"
        >
          <ArrowLeft size={14} />
          Course home
        </Link>
        <p className="mt-3 text-xs font-bold text-primary">{courseCode}</p>
        <p className="font-serif text-lg font-semibold leading-snug line-clamp-2">{courseTitle}</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-green-600 transition-[width]" style={{ width: `${percentComplete}%` }} />
          </div>
          <span className="text-xs font-bold tabular-nums text-gray-600">{percentComplete}%</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-4">
        {units.map((unit) => (
          <div key={unit.id} className="mb-5">
            <p className="px-5 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              {unit.code} &middot; {unit.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {unit.lessons.map((lesson) => {
                const isSelected = lesson.id === selectedLessonId;
                const hasAutolab = lesson.autolab !== null;
                const hasLti = lesson.lti !== null;
                const hasQuizSubmission = lesson.quizSubmission !== null;
                const isQuizLesson =
                  !hasLti &&
                  (lesson.type === "quiz" || lesson.blocks.some((b) => (b.questions?.length ?? 0) > 0));
                const isComplete = lesson.completedAt != null;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => onSelectLesson(lesson.id)}
                    aria-current={isSelected ? "page" : undefined}
                    className={`flex items-center gap-3 mx-2 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${
                      isSelected
                        ? "bg-primary/[0.07] text-primary font-semibold shadow-[inset_3px_0_0_var(--color-primary)]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <LessonIcon type={lesson.type} />
                    <span className="truncate flex-1">
                      {lesson.code} {lesson.title}
                    </span>
                    {isComplete ? (
                      <CheckCircle2 size={13} className="text-green-500 shrink-0" aria-label="Completed" />
                    ) : hasAutolab && lesson.autolab?.score != null ? (
                      <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                    ) : hasLti && lesson.lti?.score != null ? (
                      <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                    ) : !hasAutolab && isQuizLesson && hasQuizSubmission ? (
                      <span className="text-[10px] font-bold text-green-600 shrink-0">
                        {lesson.quizSubmission!.scorePercent}%
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {units.length === 0 && (
          <p className="px-6 py-4 text-sm text-gray-400">No published lessons yet.</p>
        )}
      </div>
    </aside>
  );
}
