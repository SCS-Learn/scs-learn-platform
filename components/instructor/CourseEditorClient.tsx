"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ContentSidebar from "@/components/instructor/ContentSidebar";
import LessonSettingsSidebar from "@/components/instructor/LessonSettingsSidebar";
import LessonEditor from "@/components/instructor/LessonEditor";
import BlockLessonViewer from "@/components/instructor/BlockLessonViewer";
import { lessonTypeOptions, type InstructorCourse, type Unit } from "@/lib/instructor/mock-data";
import { formatRelativeTime } from "@/lib/instructor/format";
import {
  addUnit as addUnitAction,
  deleteUnit as deleteUnitAction,
  reorderUnits as reorderUnitsAction,
  addLesson as addLessonAction,
  deleteLesson as deleteLessonAction,
  reorderLessons as reorderLessonsAction,
  updateLessonContent,
  publishLesson as publishLessonAction,
  updateQuizCompletionThreshold,
} from "@/lib/instructor/data/lessons";
import { deleteCourse as deleteCourseAction } from "@/lib/instructor/data/courses";

function wordCountOf(html: string) {
  const text = html.replace(/<[^>]*>/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function moduleLabel(unit: Unit | undefined) {
  return unit ? `${unit.code} — ${unit.title}` : "";
}

const AUTOSAVE_DELAY_MS = 800;

export default function CourseEditorClient({ course }: { course: InstructorCourse }) {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>(course.units);

  const firstLessonId = units.find((u) => u.lessons.length > 0)?.lessons[0]?.id ?? "";
  const [selectedLessonId, setSelectedLessonId] = useState(firstLessonId);
  const [selectedType, setSelectedType] = useState(lessonTypeOptions[0]);
  const [, startTransition] = useTransition();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ lessonId: string; title: string; contentHtml: string } | null>(
    null
  );

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.lessons.some((l) => l.id === selectedLessonId)),
    [units, selectedLessonId]
  );

  const selectedLesson = selectedUnit?.lessons.find((l) => l.id === selectedLessonId);

  const wordCount = useMemo(
    () => wordCountOf(selectedLesson?.contentHtml ?? ""),
    [selectedLesson?.contentHtml]
  );

  const flushPendingSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    startTransition(async () => {
      await updateLessonContent(pending.lessonId, {
        title: pending.title,
        contentHtml: pending.contentHtml,
      });
    });
  };

  const discardPendingSaveFor = (lessonIds: string[]) => {
    if (pendingSaveRef.current && lessonIds.includes(pendingSaveRef.current.lessonId)) {
      pendingSaveRef.current = null;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    }
  };

  const applySelection = (unit: Unit | undefined, lessonId: string) => {
    flushPendingSave();
    setSelectedLessonId(lessonId);
  };

  const selectLesson = (lessonId: string) => {
    const unit = units.find((u) => u.lessons.some((l) => l.id === lessonId));
    applySelection(unit, lessonId);
  };

  const updateSelectedLesson = (patch: Partial<{ title: string; contentHtml: string }>) => {
    if (!selectedLesson) return;
    const nextTitle = patch.title ?? selectedLesson.title;
    const nextHtml = patch.contentHtml ?? selectedLesson.contentHtml;

    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) => (l.id === selectedLessonId ? { ...l, ...patch } : l)),
      }))
    );

    pendingSaveRef.current = { lessonId: selectedLessonId, title: nextTitle, contentHtml: nextHtml };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushPendingSave, AUTOSAVE_DELAY_MS);
  };

  const addLesson = (unitId: string) => {
    startTransition(async () => {
      const newLesson = await addLessonAction(course.code, unitId);
      const unit = units.find((u) => u.id === unitId);
      setUnits((prev) =>
        prev.map((u) => (u.id === unitId ? { ...u, lessons: [...u.lessons, newLesson] } : u))
      );
      applySelection(unit, newLesson.id);
    });
  };

  const deleteLesson = (unitId: string, lessonId: string) => {
    const unit = units.find((u) => u.id === unitId);
    const lesson = unit?.lessons.find((l) => l.id === lessonId);
    if (!unit || !lesson) return;
    if (!window.confirm(`Delete "${lesson.title}"? This cannot be undone.`)) return;

    discardPendingSaveFor([lessonId]);

    setUnits((prev) =>
      prev.map((u) =>
        u.id === unitId ? { ...u, lessons: u.lessons.filter((l) => l.id !== lessonId) } : u
      )
    );

    if (selectedLessonId === lessonId) {
      const fallback =
        unit.lessons.find((l) => l.id !== lessonId) ??
        units.find((u) => u.id !== unitId)?.lessons[0];
      if (fallback) {
        const fallbackUnit = units.find((u) => u.lessons.some((l) => l.id === fallback.id));
        applySelection(fallbackUnit, fallback.id);
      } else {
        flushPendingSave();
        setSelectedLessonId("");
      }
    }

    startTransition(async () => {
      await deleteLessonAction(course.code, lessonId);
    });
  };

  const deleteUnit = (unitId: string) => {
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;
    if (!window.confirm(`Delete "${unit.code} — ${unit.title}" and all its lessons?`)) return;

    discardPendingSaveFor(unit.lessons.map((l) => l.id));

    setUnits((prev) => prev.filter((u) => u.id !== unitId));

    if (unit.lessons.some((l) => l.id === selectedLessonId)) {
      const fallbackUnit = units.find((u) => u.id !== unitId);
      const fallback = fallbackUnit?.lessons[0];
      if (fallback) {
        applySelection(fallbackUnit, fallback.id);
      } else {
        flushPendingSave();
        setSelectedLessonId("");
      }
    }

    startTransition(async () => {
      await deleteUnitAction(course.code, unitId);
    });
  };

  const reorderLessons = (unitId: string, draggedLessonId: string, targetLessonId: string) => {
    if (draggedLessonId === targetLessonId) return;
    let newOrderIds: string[] = [];
    setUnits((prev) =>
      prev.map((u) => {
        if (u.id !== unitId) return u;
        const lessons = [...u.lessons];
        const fromIndex = lessons.findIndex((l) => l.id === draggedLessonId);
        const toIndex = lessons.findIndex((l) => l.id === targetLessonId);
        if (fromIndex === -1 || toIndex === -1) return u;
        const [moved] = lessons.splice(fromIndex, 1);
        lessons.splice(toIndex, 0, moved);
        newOrderIds = lessons.map((l) => l.id);
        return { ...u, lessons };
      })
    );
    if (newOrderIds.length) {
      startTransition(async () => {
        await reorderLessonsAction(course.code, unitId, newOrderIds);
      });
    }
  };

  const addUnit = async (title: string): Promise<string> => {
    const newUnit = await addUnitAction(course.code, title);
    setUnits((prev) => [...prev, newUnit]);
    return newUnit.id;
  };

  const reorderUnits = (draggedUnitId: string, targetUnitId: string) => {
    if (draggedUnitId === targetUnitId) return;
    let newOrderIds: string[] = [];
    setUnits((prev) => {
      const list = [...prev];
      const fromIndex = list.findIndex((u) => u.id === draggedUnitId);
      const toIndex = list.findIndex((u) => u.id === targetUnitId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      newOrderIds = list.map((u) => u.id);
      return list;
    });
    if (newOrderIds.length) {
      startTransition(async () => {
        await reorderUnitsAction(course.code, newOrderIds);
      });
    }
  };

  const deleteCourse = () => {
    const lessonCount = units.reduce((sum, u) => sum + u.lessons.length, 0);
    const message =
      lessonCount > 0
        ? `Delete "${course.title}" (${course.code}) and all ${lessonCount} lessons? This cannot be undone.`
        : `Delete "${course.title}" (${course.code})? This cannot be undone.`;
    if (!window.confirm(message)) return;

    flushPendingSave();
    startTransition(async () => {
      await deleteCourseAction(course.code);
      router.push("/instructor");
    });
  };

  const publish = () => {
    if (!selectedLessonId) return;
    flushPendingSave();
    const now = new Date().toISOString();
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) =>
          l.id === selectedLessonId ? { ...l, isPublished: true, updatedAt: now } : l
        ),
      }))
    );
    startTransition(async () => {
      await publishLessonAction(course.code, selectedLessonId);
    });
  };

  const selectedLessonHasQuizQuestions =
    selectedLesson?.type === "quiz" ||
    (selectedLesson?.blocks.some((block) => (block.questions?.length ?? 0) > 0) ?? false);

  const updateQuizCompletionThresholdForLesson = (threshold: number) => {
    if (!selectedLesson) return;
    const clamped = Math.min(100, Math.max(0, Math.round(threshold)));
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) =>
          l.id === selectedLessonId ? { ...l, quizCompletionThreshold: clamped } : l
        ),
      }))
    );
    startTransition(async () => {
      await updateQuizCompletionThreshold(course.code, selectedLessonId, clamped);
    });
  };

  return (
    <main className="h-screen bg-gray-50 text-black grid grid-cols-[1fr_3fr_1fr] overflow-hidden">
      <ContentSidebar
        courseCode={course.code}
        courseTitle={course.title}
        units={units}
        selectedLessonId={selectedLessonId}
        onSelectLesson={selectLesson}
        onAddLesson={addLesson}
        onDeleteLesson={deleteLesson}
        onDeleteUnit={deleteUnit}
        onReorderLessons={reorderLessons}
        onAddUnit={addUnit}
        onReorderUnits={reorderUnits}
        onDeleteCourse={deleteCourse}
      />

      <div className="min-h-0 h-full overflow-y-auto bg-white border-x border-gray-300">
        {selectedLessonId && selectedLesson && selectedLesson.contentSource === "blocks" ? (
          <BlockLessonViewer
            key={`blocks-${selectedLessonId}`}
            courseCode={course.code}
            blocks={selectedLesson.blocks}
            lessonType={selectedLesson.type}
            lessonTitle={selectedLesson.title}
            onQuestionSaved={(updated) => {
              setUnits((prev) =>
                prev.map((unit) => ({
                  ...unit,
                  lessons: unit.lessons.map((lesson) =>
                    lesson.id !== selectedLessonId
                      ? lesson
                      : {
                          ...lesson,
                          blocks: lesson.blocks.map((block) =>
                            block.kind !== "question_group" || !block.questions
                              ? block
                              : {
                                  ...block,
                                  questions: block.questions.map((q) =>
                                    q.id === updated.id ? updated : q
                                  ),
                                }
                          ),
                        }
                  ),
                }))
              );
            }}
            onQuestionAdded={(added) => {
              setUnits((prev) =>
                prev.map((unit) => ({
                  ...unit,
                  lessons: unit.lessons.map((lesson) =>
                    lesson.id !== selectedLessonId
                      ? lesson
                      : {
                          ...lesson,
                          blocks: lesson.blocks.map((block) =>
                            block.kind !== "question_group"
                              ? block
                              : {
                                  ...block,
                                  questions: [...(block.questions ?? []), added],
                                }
                          ),
                        }
                  ),
                }))
              );
            }}
            onQuestionDeleted={(questionId) => {
              setUnits((prev) =>
                prev.map((unit) => ({
                  ...unit,
                  lessons: unit.lessons.map((lesson) =>
                    lesson.id !== selectedLessonId
                      ? lesson
                      : {
                          ...lesson,
                          blocks: lesson.blocks.map((block) =>
                            block.kind !== "question_group"
                              ? block
                              : {
                                  ...block,
                                  questions: (block.questions ?? []).filter(
                                    (q) => q.id !== questionId
                                  ),
                                }
                          ),
                        }
                  ),
                }))
              );
            }}
          />
        ) : selectedLessonId && selectedLesson ? (
          <LessonEditor
            key={`editor-${selectedLessonId}`}
            lessonId={selectedLessonId}
            title={selectedLesson.title}
            onTitleChange={(title) => updateSelectedLesson({ title })}
            content={selectedLesson.contentHtml}
            onContentChange={(contentHtml) => updateSelectedLesson({ contentHtml })}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            Add a section and a lesson to start writing.
          </div>
        )}
      </div>

      <LessonSettingsSidebar
        key={`module-settings-${selectedLessonId}`}
        lessonId={selectedLessonId}
        attachments={selectedLesson?.attachments ?? []}
        unitLabel={moduleLabel(selectedUnit)}
        lessonLabel={selectedLesson ? `Lesson ${selectedLesson.code}` : ""}
        currentModule={selectedLesson ? `Lesson ${selectedLesson.code} — ${selectedLesson.title}` : ""}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        wordCount={wordCount}
        isPublished={selectedLesson?.isPublished ?? false}
        savedLabel={
          selectedLesson ? `Saved ${formatRelativeTime(selectedLesson.updatedAt).toLowerCase()}` : ""
        }
        showQuizCompletionThreshold={selectedLessonHasQuizQuestions}
        quizCompletionThreshold={selectedLesson?.quizCompletionThreshold ?? 100}
        onQuizCompletionThresholdChange={updateQuizCompletionThresholdForLesson}
        onPreview={() =>
          window.open(`/student/${course.code}?lesson=${selectedLessonId}`, "_blank", "noopener")
        }
        onSaveDraft={flushPendingSave}
        onPublish={publish}
      />
    </main>
  );
}
