"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, FileText, CircleHelp, CheckCircle2 } from "lucide-react";
import type { StudentUnit, StudentLesson } from "@/lib/student/types";

function LessonIcon({ type }: { type: StudentLesson["type"] }) {
  return type === "quiz" ? (
    <CircleHelp size={14} className="text-gray-400 shrink-0" />
  ) : (
    <FileText size={14} className="text-gray-400 shrink-0" />
  );
}

export default function StudentSidebar({
  courseCode,
  courseTitle,
  units,
  selectedLessonId,
  moduleLabel,
  lessonLabel,
  onSelectLesson,
}: {
  courseCode: string;
  courseTitle: string;
  units: StudentUnit[];
  selectedLessonId: string;
  moduleLabel: string;
  lessonLabel: string;
  onSelectLesson: (lessonId: string) => void;
}) {
  return (
    <aside className="w-72 shrink-0 h-full min-h-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      <div className="px-3 py-4 border-b border-gray-100 flex flex-col gap-4">
        <Link
          href="/student"
          className="inline-flex items-center justify-center gap-1.5 w-full text-sm font-bold bg-white text-primary border border-primary px-4 py-2.5 hover:bg-primary/5"
        >
          <ArrowLeft size={15} />
          My courses
        </Link>

        <div className="min-w-0 pl-0.5">
          <p className="text-xs font-bold text-primary tracking-wide">{courseCode}</p>
          <p className="text-sm font-bold truncate">{courseTitle}</p>
        </div>

        {(moduleLabel || lessonLabel) && (
          <div className="flex items-center gap-1 text-xs text-gray-400 min-w-0 flex-wrap">
            {moduleLabel && <span className="truncate">{moduleLabel}</span>}
            {moduleLabel && lessonLabel && <ChevronRight size={12} className="shrink-0" />}
            {lessonLabel && <span className="text-gray-700 shrink-0">{lessonLabel}</span>}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        {units.map((unit) => (
          <div key={unit.id} className="mb-2">
            <p className="px-4 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              {unit.code} &middot; {unit.title}
            </p>
            <div className="flex flex-col">
              {unit.lessons.map((lesson) => {
                const isSelected = lesson.id === selectedLessonId;
                const hasAutolab = lesson.autolab !== null;
                const hasQuizSubmission = lesson.quizSubmission !== null;
                const isQuizLesson =
                  lesson.type === "quiz" || lesson.blocks.some((b) => (b.questions?.length ?? 0) > 0);
                const isComplete = lesson.completedAt != null;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => onSelectLesson(lesson.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm text-left ${
                      isSelected ? "bg-primary/10 text-primary font-bold" : "text-gray-700 hover:bg-gray-50"
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
          <p className="px-4 py-3 text-sm text-gray-400">No published lessons yet.</p>
        )}
      </div>
    </aside>
  );
}
