"use client";

import { useState, type DragEvent } from "react";
import {
  ChevronRight,
  ChevronDown,
  GripVertical,
  Plus,
  Trash2,
  X,
  FileText,
  CircleHelp,
} from "lucide-react";
import { type Unit, type LessonItem } from "@/lib/instructor/mock-data";

function LessonIcon({ type }: { type: LessonItem["type"] }) {
  return type === "quiz" ? (
    <CircleHelp size={14} className="text-gray-400 shrink-0" />
  ) : (
    <FileText size={14} className="text-gray-400 shrink-0" />
  );
}

export default function ContentSidebar({
  courseCode,
  courseTitle,
  units,
  selectedLessonId,
  onSelectLesson,
  onAddLesson,
  onDeleteLesson,
  onDeleteUnit,
  onReorderLessons,
  onAddUnit,
  onReorderUnits,
}: {
  courseCode: string;
  courseTitle: string;
  units: Unit[];
  selectedLessonId: string;
  onSelectLesson: (lessonId: string) => void;
  onAddLesson: (unitId: string) => void;
  onDeleteLesson: (unitId: string, lessonId: string) => void;
  onDeleteUnit: (unitId: string) => void;
  onReorderLessons: (unitId: string, draggedLessonId: string, targetLessonId: string) => void;
  onAddUnit: () => Promise<string>;
  onReorderUnits: (draggedUnitId: string, targetUnitId: string) => void;
}) {
  const lessonCount = units.reduce((sum, u) => sum + u.lessons.length, 0);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const unit = units.find((u) => u.lessons.some((l) => l.id === selectedLessonId));
    return unit ? { [unit.id]: true } : {};
  });
  const [draggingLessonId, setDraggingLessonId] = useState<string | null>(null);
  const [dragOverLessonId, setDragOverLessonId] = useState<string | null>(null);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const [dragOverUnitId, setDragOverUnitId] = useState<string | null>(null);

  const toggleUnit = (unitId: string) => {
    setExpanded((prev) => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const handleDragStart = (e: DragEvent, lessonId: string) => {
    setDraggingLessonId(lessonId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent, lessonId: string) => {
    e.preventDefault();
    if (lessonId !== dragOverLessonId) setDragOverLessonId(lessonId);
  };

  const handleDrop = (e: DragEvent, unitId: string, lessonId: string) => {
    e.preventDefault();
    if (draggingLessonId) onReorderLessons(unitId, draggingLessonId, lessonId);
    setDraggingLessonId(null);
    setDragOverLessonId(null);
  };

  const handleUnitDragStart = (e: DragEvent, unitId: string) => {
    setDraggingUnitId(unitId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleUnitDragOver = (e: DragEvent, unitId: string) => {
    e.preventDefault();
    if (unitId !== dragOverUnitId) setDragOverUnitId(unitId);
  };

  const handleUnitDrop = (e: DragEvent, unitId: string) => {
    e.preventDefault();
    if (draggingUnitId) onReorderUnits(draggingUnitId, unitId);
    setDraggingUnitId(null);
    setDragOverUnitId(null);
  };

  const handleUnitDragEnd = () => {
    setDraggingUnitId(null);
    setDragOverUnitId(null);
  };

  const handleAddUnit = async () => {
    const newId = await onAddUnit();
    setExpanded((prev) => ({ ...prev, [newId]: true }));
  };

  return (
    <div className="w-64 shrink-0 border border-gray-200 rounded-md bg-white flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400">{courseCode}</p>
          <p className="text-sm font-bold">{courseTitle}</p>
        </div>
        <span className="text-xs text-gray-400">{lessonCount}</span>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {units.map((unit) => {
          const isOpen = !!expanded[unit.id];
          const isUnitDragOver = dragOverUnitId === unit.id && draggingUnitId !== unit.id;
          return (
            <div key={unit.id} className="mb-1">
              <div
                draggable
                onDragStart={(e) => handleUnitDragStart(e, unit.id)}
                onDragOver={(e) => handleUnitDragOver(e, unit.id)}
                onDragLeave={() =>
                  setDragOverUnitId((prev) => (prev === unit.id ? null : prev))
                }
                onDrop={(e) => handleUnitDrop(e, unit.id)}
                onDragEnd={handleUnitDragEnd}
                className={`group flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-50 border-t-2 ${
                  isUnitDragOver ? "border-primary" : "border-transparent"
                } ${draggingUnitId === unit.id ? "opacity-40" : ""}`}
              >
                <GripVertical
                  size={14}
                  className="text-gray-300 opacity-0 group-hover:opacity-100 cursor-grab shrink-0"
                />
                <button
                  type="button"
                  onClick={() => toggleUnit(unit.id)}
                  className="shrink-0 text-gray-400"
                  aria-label={isOpen ? "Collapse unit" : "Expand unit"}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-bold leading-tight truncate">
                    {unit.code} — {unit.title}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Add lesson"
                  className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-500"
                  onClick={() => {
                    setExpanded((prev) => ({ ...prev, [unit.id]: true }));
                    onAddLesson(unit.id);
                  }}
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Delete unit"
                  className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                  onClick={() => onDeleteUnit(unit.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {isOpen && (
                <div className="ml-4">
                  {unit.lessons.map((lesson) => {
                    const isSelected = lesson.id === selectedLessonId;
                    const isDragOver = dragOverLessonId === lesson.id && draggingLessonId !== lesson.id;
                    return (
                      <div
                        key={lesson.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lesson.id)}
                        onDragOver={(e) => handleDragOver(e, lesson.id)}
                        onDragLeave={() =>
                          setDragOverLessonId((prev) => (prev === lesson.id ? null : prev))
                        }
                        onDrop={(e) => handleDrop(e, unit.id, lesson.id)}
                        onDragEnd={() => {
                          setDraggingLessonId(null);
                          setDragOverLessonId(null);
                        }}
                        className={`group flex items-center gap-1.5 pl-2 pr-2 py-1.5 rounded cursor-pointer border-t-2 ${
                          isDragOver ? "border-primary" : "border-transparent"
                        } ${
                          isSelected ? "bg-primary/10" : "hover:bg-gray-50"
                        } ${draggingLessonId === lesson.id ? "opacity-40" : ""}`}
                        onClick={() => onSelectLesson(lesson.id)}
                      >
                        <GripVertical
                          size={12}
                          className="text-gray-300 opacity-0 group-hover:opacity-100 cursor-grab shrink-0"
                        />
                        <LessonIcon type={lesson.type} />
                        <p
                          className={`text-xs flex-1 min-w-0 truncate ${
                            isSelected ? "text-primary font-bold" : "text-gray-700"
                          }`}
                        >
                          {lesson.title}
                        </p>
                        <button
                          type="button"
                          aria-label="Delete lesson"
                          className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteLesson(unit.id, lesson.id);
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-2 border-t border-gray-100">
        <button
          type="button"
          onClick={handleAddUnit}
          className="w-full text-center text-xs font-bold text-primary border border-primary/30 rounded py-1.5 hover:bg-primary/5"
        >
          + Add section
        </button>
        <p className="text-[10px] text-gray-400 text-center mt-1.5">
          Drag to reorder. Sections and lessons publish independently.
        </p>
      </div>
    </div>
  );
}
