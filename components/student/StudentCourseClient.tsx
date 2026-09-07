"use client";

import { useMemo, useState } from "react";
import StudentSidebar from "@/components/student/StudentSidebar";
import StudentLessonViewer from "@/components/student/StudentLessonViewer";
import type { StudentCourse, QuizSubmissionStatus } from "@/lib/student/types";

function initialQuizStatusByLessonId(course: StudentCourse): Record<string, QuizSubmissionStatus> {
  const map: Record<string, QuizSubmissionStatus> = {};
  for (const unit of course.units) {
    for (const lesson of unit.lessons) {
      if (lesson.quizSubmission) map[lesson.id] = lesson.quizSubmission;
    }
  }
  return map;
}

function initialCompletedByLessonId(course: StudentCourse): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const unit of course.units) {
    for (const lesson of unit.lessons) {
      if (lesson.completedAt) map[lesson.id] = lesson.completedAt;
    }
  }
  return map;
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
  const [quizStatusByLessonId, setQuizStatusByLessonId] = useState(initialQuizStatusByLessonId(course));
  const [completedByLessonId, setCompletedByLessonId] = useState(initialCompletedByLessonId(course));

  const unitsWithProgress = useMemo(
    () =>
      course.units.map((unit) => ({
        ...unit,
        lessons: unit.lessons.map((lesson) => ({
          ...lesson,
          quizSubmission: quizStatusByLessonId[lesson.id] ?? lesson.quizSubmission,
          completedAt:
            lesson.id in completedByLessonId ? completedByLessonId[lesson.id] : lesson.completedAt,
        })),
      })),
    [course.units, quizStatusByLessonId, completedByLessonId]
  );

  const selectedLesson = unitsWithProgress.flatMap((u) => u.lessons).find((l) => l.id === selectedLessonId);

  return (
    <main className="h-screen bg-gray-50 text-black flex overflow-hidden">
      <StudentSidebar
        courseCode={course.code}
        courseTitle={course.title}
        units={unitsWithProgress}
        selectedLessonId={selectedLessonId}
        onSelectLesson={setSelectedLessonId}
      />

      <div className="flex-1 min-w-0 min-h-0 h-full overflow-hidden">
        {selectedLesson ? (
          <StudentLessonViewer
            key={selectedLesson.id}
            courseCode={course.code}
            lesson={selectedLesson}
            onQuizSubmitted={(lessonId, status) =>
              setQuizStatusByLessonId((prev) => ({ ...prev, [lessonId]: status }))
            }
            onQuizReset={(lessonId) =>
              setQuizStatusByLessonId((prev) => {
                const next = { ...prev };
                delete next[lessonId];
                return next;
              })
            }
            onCompletionChange={(lessonId, completedAt) =>
              setCompletedByLessonId((prev) => ({ ...prev, [lessonId]: completedAt }))
            }
          />
        ) : (
          <div className="h-full bg-white flex items-center justify-center text-sm text-gray-400">
            This course has no published lessons yet.
          </div>
        )}
      </div>
    </main>
  );
}
