"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import StudentHeader from "@/components/student/StudentHeader";
import StudentSidebar from "@/components/student/StudentSidebar";
import StudentLessonViewer from "@/components/student/StudentLessonViewer";
import type { StudentCourse } from "@/lib/student/types";

function moduleLabel(units: StudentCourse["units"], lessonId: string) {
  const unit = units.find((u) => u.lessons.some((l) => l.id === lessonId));
  return unit ? `${unit.code} — ${unit.title}` : "";
}

export default function StudentCourseClient({
  course,
  initialLessonId,
}: {
  course: StudentCourse;
  initialLessonId?: string;
}) {
  const firstLessonId = course.units.find((u) => u.lessons.length > 0)?.lessons[0]?.id ?? "";
  const [selectedLessonId, setSelectedLessonId] = useState(initialLessonId || firstLessonId);

  const selectedLesson = course.units
    .flatMap((u) => u.lessons)
    .find((l) => l.id === selectedLessonId);

  return (
    <main className="min-h-screen bg-gray-50 text-black flex flex-col">
      <StudentHeader backHref="/student" backLabel="My courses" />

      <div className="flex-1 px-6 py-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
          <span>{course.code}</span>
          <ChevronRight size={12} />
          <span className="truncate">{moduleLabel(course.units, selectedLessonId)}</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">{selectedLesson ? `Lesson ${selectedLesson.code}` : ""}</span>
        </div>

        <div className="flex gap-4 items-start">
          <StudentSidebar
            courseCode={course.code}
            courseTitle={course.title}
            units={course.units}
            selectedLessonId={selectedLessonId}
            onSelectLesson={setSelectedLessonId}
          />

          {selectedLesson ? (
            <StudentLessonViewer key={selectedLesson.id} lesson={selectedLesson} />
          ) : (
            <div className="flex-[3] min-w-0 border border-gray-200 rounded-md bg-white flex items-center justify-center min-h-[400px] text-sm text-gray-400">
              This course has no published lessons yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
