"use client";

import { useMemo, useState } from "react";
import ContentSidebar from "@/components/instructor/ContentSidebar";
import ModuleSettingsSidebar from "@/components/instructor/ModuleSettingsSidebar";
import LessonEditor from "@/components/instructor/LessonEditor";
import EditorTopBar from "@/components/instructor/EditorTopBar";
import InstructorHeader from "@/components/instructor/InstructorHeader";
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

function moduleLabel(unit: Unit | undefined) {
  return unit ? `${unit.code} — ${unit.title}` : "";
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
  const [isPublished, setIsPublished] = useState(false);
  const [savedLabel, setSavedLabel] = useState("Saved 2 min ago");
  const [selectedType, setSelectedType] = useState(lessonTypeOptions[0]);

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.lessons.some((l) => l.id === selectedLessonId)),
    [units, selectedLessonId]
  );

  const selectedLesson = selectedUnit?.lessons.find((l) => l.id === selectedLessonId);

  const [selectedModule, setSelectedModule] = useState(moduleLabel(selectedUnit));

  const moduleOptions = useMemo(
    () => units.map((unit) => `${unit.code} — ${unit.title}`),
    [units]
  );

  const draft = drafts[selectedLessonId] ?? {
    title: selectedLesson?.title ?? "",
    html: "",
  };

  const wordCount = useMemo(() => wordCountOf(draft.html), [draft.html]);

  const applySelection = (unit: Unit | undefined, lessonId: string) => {
    setSelectedLessonId(lessonId);
    setSelectedModule(moduleLabel(unit));
    setIsPublished(false);
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
      <main className="min-h-screen bg-gray-50 text-black">
        <InstructorHeader backHref="/instructor" backLabel="Dashboard" />
        <div className="px-6 py-12 text-center text-gray-500">Course not found.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 text-black flex flex-col">
      <InstructorHeader backHref="/instructor" backLabel="Dashboard" />

      <div className="flex-1 px-6 py-6">
        <EditorTopBar
          unitLabel={moduleLabel(selectedUnit)}
          lessonLabel={selectedLesson ? `Lesson ${selectedLesson.code}` : ""}
          wordCount={wordCount}
          isPublished={isPublished}
          savedLabel={savedLabel}
          onPreview={() => window.alert("Preview would show the learner view of this lesson.")}
          onSaveDraft={() => setSavedLabel("Saved just now")}
          onPublish={() => setIsPublished(true)}
        />

        <div className="flex gap-4 items-start">
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
              title={draft.title}
              onTitleChange={(title) => updateDraft({ title })}
              content={draft.html}
              onContentChange={(html) => updateDraft({ html })}
              wordCount={wordCount}
            />
          ) : (
            <div className="flex-1 min-w-0 border border-gray-200 rounded-md bg-white flex items-center justify-center min-h-[400px] text-sm text-gray-400">
              Add a section and a lesson to start writing.
            </div>
          )}

          <ModuleSettingsSidebar
            moduleOptions={moduleOptions}
            selectedModule={selectedModule}
            onModuleChange={setSelectedModule}
            selectedType={selectedType}
            onTypeChange={setSelectedType}
          />
        </div>
      </div>
    </main>
  );
}
