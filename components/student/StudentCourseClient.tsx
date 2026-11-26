"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import StudentSidebar from "@/components/student/StudentSidebar";
import StudentLessonViewer from "@/components/student/StudentLessonViewer";
import type { StudentCourse, StudentLesson, QuizSubmissionStatus } from "@/lib/student/types";

type LessonSelection = {
  id: string;
  lesson?: StudentLesson;
  failed?: boolean;
};

export default function StudentCourseClient({
  course,
  initialLesson,
  header,
}: {
  course: StudentCourse;
  initialLesson: StudentLesson | null;
  header?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [selection, setSelection] = useState<LessonSelection>({ id: initialLesson?.id ?? "" });
  const [quizChanges, setQuizChanges] = useState<Record<string, QuizSubmissionStatus | null>>({});
  const [completionChanges, setCompletionChanges] = useState<Record<string, string | null>>({});
  const lessonRequests = useRef(new Map<string, Promise<StudentLesson>>());
  const selectionVersion = useRef(0);

  useEffect(() => {
    if (initialLesson) lessonRequests.current.set(initialLesson.id, Promise.resolve(initialLesson));
  }, [initialLesson]);

  const loadLesson = useCallback((lessonId: string) => {
    const cached = lessonRequests.current.get(lessonId);
    if (cached) return cached;

    const pending = fetch(`/student/${encodeURIComponent(course.code)}/learn/${encodeURIComponent(lessonId)}`, {
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok || response.redirected) throw new Error("Could not load this lesson");
        return response.json() as Promise<StudentLesson>;
      })
      .catch((error: unknown) => {
        lessonRequests.current.delete(lessonId);
        throw error;
      });
    lessonRequests.current.set(lessonId, pending);
    return pending;
  }, [course.code]);

  const selectLesson = useCallback((lessonId: string) => {
    const version = ++selectionVersion.current;
    const params = new URLSearchParams(window.location.search);
    params.set("lesson", lessonId);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    setSelection({ id: lessonId });
    if (lessonId === initialLesson?.id) return;

    void loadLesson(lessonId).then(
      (lesson) => {
        if (selectionVersion.current === version) setSelection({ id: lessonId, lesson });
      },
      () => {
        if (selectionVersion.current === version) setSelection({ id: lessonId, failed: true });
      }
    );
  }, [initialLesson?.id, loadLesson, pathname]);

  const units = useMemo(() => course.units.map((unit) => ({
    ...unit,
    lessons: unit.lessons.map((lesson) => ({
      ...lesson,
      quizScore: lesson.id in quizChanges ? (quizChanges[lesson.id]?.scorePercent ?? null) : lesson.quizScore,
      completedAt: lesson.id in completionChanges ? completionChanges[lesson.id] : lesson.completedAt,
    })),
  })), [course.units, quizChanges, completionChanges]);

  const loadedLesson = selection.id === initialLesson?.id ? initialLesson : selection.lesson;
  const lessons = units.flatMap((unit) => unit.lessons);
  const activeIndex = lessons.findIndex((lesson) => lesson.id === selection.id);
  const nextLessonId = loadedLesson && activeIndex >= 0 ? lessons[activeIndex + 1]?.id : undefined;

  useEffect(() => {
    if (nextLessonId) void loadLesson(nextLessonId).catch(() => undefined);
  }, [loadLesson, nextLessonId]);

  return (
    <div className="h-screen bg-gray-50 text-black flex flex-col overflow-hidden">
      {header}
      <main className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        <StudentSidebar
          courseCode={course.code}
          courseTitle={course.title}
          units={units}
          selectedLessonId={selection.id}
          onSelectLesson={selectLesson}
        />

        <div className="flex-1 min-w-0 min-h-0 md:h-full overflow-hidden">
          {loadedLesson ? (
            <StudentLessonViewer
              key={loadedLesson.id}
              courseCode={course.code}
              lesson={{
                ...loadedLesson,
                completedAt: lessons[activeIndex]?.completedAt ?? null,
                quizSubmission: loadedLesson.id in quizChanges ? quizChanges[loadedLesson.id] : loadedLesson.quizSubmission,
              }}
              onQuizSubmitted={(lessonId, status) =>
                setQuizChanges((prev) => ({ ...prev, [lessonId]: status }))
              }
              onQuizReset={(lessonId) =>
                setQuizChanges((prev) => ({ ...prev, [lessonId]: null }))
              }
              onCompletionChange={(lessonId, completedAt) =>
                setCompletionChanges((prev) => ({ ...prev, [lessonId]: completedAt }))
              }
            />
          ) : (
            <div className="h-full bg-white flex items-center justify-center gap-2 text-sm text-gray-500" role="status">
              {selection.failed ? (
                <>
                  Could not load this lesson.
                  <button className="underline" onClick={() => selectLesson(selection.id)}>Retry</button>
                </>
              ) : selection.id ? "Loading lesson…" : "This courseware has no published lessons yet."}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
