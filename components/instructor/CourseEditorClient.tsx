"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ContentSidebar from "@/components/instructor/ContentSidebar";
import LessonSettingsSidebar from "@/components/instructor/LessonSettingsSidebar";
import LessonEditor from "@/components/instructor/LessonEditor";
import BlockLessonViewer from "@/components/instructor/BlockLessonViewer";
import InstructorExternalLessonPane from "@/components/instructor/InstructorExternalLessonPane";
import {
  lessonLabelToType,
  lessonTypeToLabel,
  type InstructorCourse,
  type Unit,
} from "@/lib/instructor/mock-data";
import { formatRelativeTime } from "@/lib/instructor/format";
import {
  addUnit as addUnitAction,
  deleteUnit as deleteUnitAction,
  renameUnit as renameUnitAction,
  reorderUnits as reorderUnitsAction,
  addLesson as addLessonAction,
  deleteLesson as deleteLessonAction,
  reorderLessons as reorderLessonsAction,
  moveLessonToUnit as moveLessonToUnitAction,
  updateLessonContent,
  updateLessonType,
  publishLesson as publishLessonAction,
  publishAllLessons as publishAllLessonsAction,
  updateQuizCompletionThreshold,
  updateShowReferenceAnswers,
} from "@/lib/instructor/data/lessons";
import { deleteCourse as deleteCourseAction } from "@/lib/instructor/data/courses";
import { DEFAULT_QUIZ_COMPLETION_THRESHOLD } from "@/lib/quiz/types";

function wordCountOf(html: string) {
  const text = html.replace(/<[^>]*>/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function moduleLabel(unit: Unit | undefined) {
  return unit ? `${unit.code} — ${unit.title}` : "";
}

function unitNumberFromCode(code: string): string {
  return code.match(/(\d+)/)?.[1] ?? "0";
}

/** Keeps every unit's "Unit N" label and its lessons' "N.M" labels in sync with actual array order - reorders/deletes only change array position, so codes need recomputing alongside. */
function withRenumberedUnitCodes(units: Unit[]): Unit[] {
  return units.map((u, index) => {
    const unitNumber = index + 1;
    return {
      ...u,
      code: `Unit ${unitNumber}`,
      lessons: u.lessons.map((l, lessonIndex) => ({ ...l, code: `${unitNumber}.${lessonIndex + 1}` })),
    };
  });
}

/** Same idea, scoped to one unit's own lessons (its own unit number doesn't change). */
function withRenumberedLessonCodes(unit: Unit): Unit {
  const unitNumber = unitNumberFromCode(unit.code);
  return { ...unit, lessons: unit.lessons.map((l, index) => ({ ...l, code: `${unitNumber}.${index + 1}` })) };
}

const AUTOSAVE_DELAY_MS = 800;

export default function CourseEditorClient({ course }: { course: InstructorCourse }) {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>(course.units);

  const firstLessonId = units.find((u) => u.lessons.length > 0)?.lessons[0]?.id ?? "";
  const [selectedLessonId, setSelectedLessonId] = useState(firstLessonId);
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
  const selectedType = selectedLesson ? lessonTypeToLabel(selectedLesson.type) : "Content";

  const wordCount = useMemo(
    () => wordCountOf(selectedLesson?.contentHtml ?? ""),
    [selectedLesson?.contentHtml]
  );

  const changeLessonType = (label: string) => {
    if (!selectedLesson) return;
    const nextType = lessonLabelToType(label);
    if (nextType === selectedLesson.type) return;
    setUnits((prev) =>
      prev.map((unit) => ({
        ...unit,
        lessons: unit.lessons.map((lesson) =>
          lesson.id === selectedLessonId ? { ...lesson, type: nextType } : lesson
        ),
      }))
    );
    startTransition(async () => {
      await updateLessonType(course.code, selectedLessonId, nextType);
    });
  };

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
        u.id === unitId
          ? withRenumberedLessonCodes({ ...u, lessons: u.lessons.filter((l) => l.id !== lessonId) })
          : u
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

    setUnits((prev) => withRenumberedUnitCodes(prev.filter((u) => u.id !== unitId)));

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

  const renameUnit = (unitId: string, title: string) => {
    setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, title } : u)));
    startTransition(async () => {
      await renameUnitAction(course.code, unitId, title);
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
        return withRenumberedLessonCodes({ ...u, lessons });
      })
    );
    if (newOrderIds.length) {
      startTransition(async () => {
        await reorderLessonsAction(course.code, unitId, newOrderIds);
      });
    }
  };

  const moveLessonToUnit = (
    fromUnitId: string,
    toUnitId: string,
    lessonId: string,
    targetLessonId: string | null
  ) => {
    if (fromUnitId === toUnitId) return;
    let moved = false;
    setUnits((prev) => {
      const fromUnit = prev.find((u) => u.id === fromUnitId);
      const lesson = fromUnit?.lessons.find((l) => l.id === lessonId);
      if (!lesson) return prev;
      moved = true;
      return prev.map((u) => {
        if (u.id === fromUnitId) {
          return withRenumberedLessonCodes({ ...u, lessons: u.lessons.filter((l) => l.id !== lessonId) });
        }
        if (u.id === toUnitId) {
          const lessons = [...u.lessons];
          const insertIndex = targetLessonId
            ? lessons.findIndex((l) => l.id === targetLessonId)
            : lessons.length;
          lessons.splice(insertIndex === -1 ? lessons.length : insertIndex, 0, lesson);
          return withRenumberedLessonCodes({ ...u, lessons });
        }
        return u;
      });
    });
    if (moved) {
      startTransition(async () => {
        await moveLessonToUnitAction(course.code, lessonId, fromUnitId, toUnitId, targetLessonId);
      });
    }
  };

  const addUnit = async (title: string): Promise<string> => {
    const newUnit = await addUnitAction(course.code, title);
    setUnits((prev) => [...prev, newUnit]);
    return newUnit.id;
  };

  const changeUnitNumber = (unitId: string, newNumber: number) => {
    let newOrderIds: string[] = [];
    setUnits((prev) => {
      const list = [...prev];
      const fromIndex = list.findIndex((u) => u.id === unitId);
      if (fromIndex === -1) return prev;
      const clampedIndex = Math.min(Math.max(newNumber - 1, 0), list.length - 1);
      const [moved] = list.splice(fromIndex, 1);
      list.splice(clampedIndex, 0, moved);
      newOrderIds = list.map((u) => u.id);
      return withRenumberedUnitCodes(list);
    });
    if (newOrderIds.length) {
      startTransition(async () => {
        await reorderUnitsAction(course.code, newOrderIds);
      });
    }
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
      return withRenumberedUnitCodes(list);
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

  const publishAll = () => {
    const unpublishedCount = units.reduce(
      (sum, u) => sum + u.lessons.filter((l) => !l.isPublished).length,
      0
    );
    if (unpublishedCount === 0) return;
    if (
      !window.confirm(
        `Publish all ${unpublishedCount} unpublished lesson${unpublishedCount === 1 ? "" : "s"}? Students will be able to see them immediately.`
      )
    )
      return;

    flushPendingSave();
    const now = new Date().toISOString();
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) => (l.isPublished ? l : { ...l, isPublished: true, updatedAt: now })),
      }))
    );
    startTransition(async () => {
      await publishAllLessonsAction(course.code);
    });
  };

  const selectedLessonHasQuizQuestions =
    selectedLesson?.type === "quiz" ||
    (selectedLesson?.type !== "external" &&
      (selectedLesson?.blocks.some((block) => (block.questions?.length ?? 0) > 0) ?? false));

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

  const updateShowReferenceAnswersForLesson = (show: boolean) => {
    if (!selectedLesson) return;
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) =>
          l.id === selectedLessonId ? { ...l, showReferenceAnswers: show } : l
        ),
      }))
    );
    startTransition(async () => {
      await updateShowReferenceAnswers(course.code, selectedLessonId, show);
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
        onRenameUnit={renameUnit}
        onChangeUnitNumber={changeUnitNumber}
        onReorderLessons={reorderLessons}
        onMoveLessonToUnit={moveLessonToUnit}
        onAddUnit={addUnit}
        onReorderUnits={reorderUnits}
        onDeleteCourse={deleteCourse}
        onPublishAll={publishAll}
      />

      <div className="min-h-0 h-full overflow-hidden bg-white border-x border-gray-300">
        {selectedLessonId && selectedLesson && selectedLesson.contentSource === "blocks" ? (
          selectedLesson.type === "external" || selectedLesson.ltiLinkId ? (
            <InstructorExternalLessonPane
              key={`external-${selectedLessonId}`}
              lessonId={selectedLesson.id}
              lessonTitle={selectedLesson.title}
              ltiLinkId={selectedLesson.ltiLinkId}
              ltiDirectUrl={selectedLesson.ltiDirectUrl}
              blocks={selectedLesson.blocks}
            />
          ) : (
            <div className="h-full overflow-y-auto">
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
            </div>
          )
        ) : selectedLessonId && selectedLesson ? (
          <div className="h-full overflow-y-auto">
            <LessonEditor
              key={`editor-${selectedLessonId}`}
              lessonId={selectedLessonId}
              title={selectedLesson.title}
              onTitleChange={(title) => updateSelectedLesson({ title })}
              content={selectedLesson.contentHtml}
              onContentChange={(contentHtml) => updateSelectedLesson({ contentHtml })}
            />
          </div>
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
        onTypeChange={changeLessonType}
        wordCount={wordCount}
        isPublished={selectedLesson?.isPublished ?? false}
        savedLabel={
          selectedLesson ? `Saved ${formatRelativeTime(selectedLesson.updatedAt).toLowerCase()}` : ""
        }
        showQuizCompletionThreshold={selectedLessonHasQuizQuestions}
        quizCompletionThreshold={selectedLesson?.quizCompletionThreshold ?? DEFAULT_QUIZ_COMPLETION_THRESHOLD}
        onQuizCompletionThresholdChange={updateQuizCompletionThresholdForLesson}
        showReferenceAnswersToggle={selectedLessonHasQuizQuestions}
        showReferenceAnswers={selectedLesson?.showReferenceAnswers ?? false}
        onShowReferenceAnswersChange={updateShowReferenceAnswersForLesson}
        onPreview={() =>
          window.open(`/student/${course.code}?lesson=${selectedLessonId}`, "_blank", "noopener")
        }
        onSaveDraft={flushPendingSave}
        onPublish={publish}
      />
    </main>
  );
}
