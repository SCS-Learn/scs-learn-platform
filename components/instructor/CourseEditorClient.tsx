"use client";

import { useMemo, useState } from "react";
import ContentSidebar from "@/components/instructor/ContentSidebar";
import ModuleSettingsSidebar from "@/components/instructor/ModuleSettingsSidebar";
import LessonEditor from "@/components/instructor/LessonEditor";
import {
  instructorCourses,
  initialLessonContent,
  lessonTypeOptions,
  type Unit,
  type LessonItem,
} from "@/lib/instructor/mock-data";

type LessonDraft = {
  title: string;
  html: string;
};

function wordCountOf(html: string) {
  const text = html.replace(/<[^>]*>/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function nextUnitCode(units: Unit[]) {
  const numbers = units.map((u) => Number(u.code.match(/(\d+)/)?.[1] ?? 0));
  const max = numbers.length ? Math.max(...numbers) : 0;
  return `Unit ${max + 1}`;
}

export default function CourseEditorClient({ courseCode }: { courseCode: string }) {
  const activeCourse = useMemo(
    () => instructorCourses.find((c) => c.code === courseCode),
    [courseCode]
  );

  const [units, setUnits] = useState<Unit[]>(activeCourse?.units ?? []);

  const firstLessonId = units.find((u) => u.lessons.length > 0)?.lessons[0]?.id ?? "";
  const [selectedLessonId, setSelectedLessonId] = useState(firstLessonId);
  const [drafts, setDrafts] = useState<Record<string, LessonDraft>>(
    firstLessonId === "6.3"
      ? { "6.3": { title: "Differential expression", html: initialLessonContent } }
      : {}
  );
  const [savedLabel, setSavedLabel] = useState("Saved 2 min ago");
  const [selectedType, setSelectedType] = useState(lessonTypeOptions[0]);

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.lessons.some((l) => l.id === selectedLessonId)),
    [units, selectedLessonId]
  );

  const selectedLesson = selectedUnit?.lessons.find((l) => l.id === selectedLessonId);

  const draft = drafts[selectedLessonId] ?? {
    title: selectedLesson?.title ?? "",
    html: "",
  };

  const wordCount = useMemo(() => wordCountOf(draft.html), [draft.html]);

  const applySelection = (unit: Unit | undefined, lessonId: string) => {
    setSelectedLessonId(lessonId);
  };

  const selectLesson = (lessonId: string) => {
    const unit = units.find((u) => u.lessons.some((l) => l.id === lessonId));
    applySelection(unit, lessonId);
  };

  const updateDraft = (patch: Partial<LessonDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [selectedLessonId]: { ...draft, ...patch },
    }));
  };

  const addLesson = (unitId: string) => {
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;

    const newId = `${unitId}-lesson-${Date.now()}`;
    const newCode = `${unit.code.replace(/^Unit\s*/i, "")}.${unit.lessons.length + 1}`;
    const newLesson: LessonItem = {
      id: newId,
      code: newCode,
      title: "Untitled lesson",
      type: "lesson",
    };

    setUnits((prev) =>
      prev.map((u) => (u.id === unitId ? { ...u, lessons: [...u.lessons, newLesson] } : u))
    );
    setDrafts((prev) => ({ ...prev, [newId]: { title: "Untitled lesson", html: "" } }));
    applySelection(unit, newId);
  };

  const deleteLesson = (unitId: string, lessonId: string) => {
    const unit = units.find((u) => u.id === unitId);
    const lesson = unit?.lessons.find((l) => l.id === lessonId);
    if (!unit || !lesson) return;
    if (!window.confirm(`Delete "${lesson.title}"? This cannot be undone.`)) return;

    setUnits((prev) =>
      prev.map((u) =>
        u.id === unitId ? { ...u, lessons: u.lessons.filter((l) => l.id !== lessonId) } : u
      )
    );
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[lessonId];
      return next;
    });

    if (selectedLessonId === lessonId) {
      const fallback =
        unit.lessons.find((l) => l.id !== lessonId) ??
        units.find((u) => u.id !== unitId)?.lessons[0];
      if (fallback) {
        const fallbackUnit = units.find((u) => u.lessons.some((l) => l.id === fallback.id));
        applySelection(fallbackUnit, fallback.id);
      } else {
        setSelectedLessonId("");
      }
    }
  };

  const deleteUnit = (unitId: string) => {
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;
    if (!window.confirm(`Delete "${unit.code} — ${unit.title}" and all its lessons?`)) return;

    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    setDrafts((prev) => {
      const next = { ...prev };
      unit.lessons.forEach((l) => delete next[l.id]);
      return next;
    });

    if (unit.lessons.some((l) => l.id === selectedLessonId)) {
      const fallbackUnit = units.find((u) => u.id !== unitId);
      const fallback = fallbackUnit?.lessons[0];
      if (fallback) {
        applySelection(fallbackUnit, fallback.id);
      } else {
        setSelectedLessonId("");
      }
    }
  };

  const reorderLessons = (unitId: string, draggedLessonId: string, targetLessonId: string) => {
    if (draggedLessonId === targetLessonId) return;
    setUnits((prev) =>
      prev.map((u) => {
        if (u.id !== unitId) return u;
        const lessons = [...u.lessons];
        const fromIndex = lessons.findIndex((l) => l.id === draggedLessonId);
        const toIndex = lessons.findIndex((l) => l.id === targetLessonId);
        if (fromIndex === -1 || toIndex === -1) return u;
        const [moved] = lessons.splice(fromIndex, 1);
        lessons.splice(toIndex, 0, moved);
        return { ...u, lessons };
      })
    );
  };

  const addUnit = () => {
    const newId = `unit-${Date.now()}`;
    const newUnit: Unit = {
      id: newId,
      code: nextUnitCode(units),
      title: "Untitled unit",
      lessons: [],
    };
    setUnits((prev) => [...prev, newUnit]);
    return newId;
  };

  const reorderUnits = (draggedUnitId: string, targetUnitId: string) => {
    if (draggedUnitId === targetUnitId) return;
    setUnits((prev) => {
      const list = [...prev];
      const fromIndex = list.findIndex((u) => u.id === draggedUnitId);
      const toIndex = list.findIndex((u) => u.id === targetUnitId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return list;
    });
  };

  if (!activeCourse) {
    return (
      <main className="h-screen bg-gray-50 text-black flex items-center justify-center">
        <div className="text-center text-gray-500">Course not found.</div>
      </main>
    );
  }

  return (
    <main className="h-screen bg-gray-100 text-black grid grid-cols-[1fr_3fr_1fr] gap-2.5 overflow-hidden p-2.5">
      <ContentSidebar
        courseCode={activeCourse.code}
        courseTitle={activeCourse.title}
        units={units}
        selectedLessonId={selectedLessonId}
        onSelectLesson={selectLesson}
        onAddLesson={addLesson}
        onDeleteLesson={deleteLesson}
        onDeleteUnit={deleteUnit}
        onReorderLessons={reorderLessons}
        onAddUnit={addUnit}
        onReorderUnits={reorderUnits}
      />

      {selectedLessonId ? (
        <LessonEditor
          key={selectedLessonId}
          content={draft.html}
          onContentChange={(html) => updateDraft({ html })}
          wordCount={wordCount}
          savedLabel={savedLabel}
        />
      ) : (
        <div className="min-w-0 min-h-0 h-full bg-white flex items-center justify-center text-sm text-gray-400 border border-gray-300">
          Add a unit and a lesson to start writing.
        </div>
      )}

      <ModuleSettingsSidebar
        lessonTitle={draft.title}
        onLessonTitleChange={(title) => {
          updateDraft({ title });
          setUnits((prev) =>
            prev.map((u) => ({
              ...u,
              lessons: u.lessons.map((l) =>
                l.id === selectedLessonId ? { ...l, title } : l
              ),
            }))
          );
        }}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        onSaveDraft={() => setSavedLabel("Saved just now")}
        onPublish={() => setSavedLabel("Published just now")}
      />
    </main>
  );
}
