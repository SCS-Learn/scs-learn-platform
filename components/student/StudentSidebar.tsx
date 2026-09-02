"use client";

import { FileText, CircleHelp, CheckCircle2 } from "lucide-react";
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
  onSelectLesson,
}: {
  courseCode: string;
  courseTitle: string;
  units: StudentUnit[];
  selectedLessonId: string;
  onSelectLesson: (lessonId: string) => void;
}) {
  return (
    <aside className="w-72 shrink-0 border border-gray-200 rounded-md bg-white flex flex-col max-h-[calc(100vh-140px)]">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-bold text-primary tracking-wide">{courseCode}</p>
        <p className="text-sm font-bold truncate">{courseTitle}</p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {units.map((unit) => (
          <div key={unit.id} className="mb-2">
            <p className="px-4 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              {unit.code} &middot; {unit.title}
            </p>
            <div className="flex flex-col">
              {unit.lessons.map((lesson) => {
                const isSelected = lesson.id === selectedLessonId;
                const hasAutolab = lesson.autolab !== null;
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
                    {hasAutolab && lesson.autolab?.score != null && (
                      <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                    )}
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
