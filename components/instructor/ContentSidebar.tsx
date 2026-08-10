"use client";

import { useState, type DragEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { type Unit } from "@/lib/instructor/mock-data";

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
  onAddUnit: () => string;
  onReorderUnits: (draggedUnitId: string, targetUnitId: string) => void;
}) {
  const lessonCount = units.reduce((sum, u) => sum + u.lessons.length, 0);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "unit-6": true,
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

  const handleAddUnit = () => {
    const newId = onAddUnit();
    setExpanded((prev) => ({ ...prev, [newId]: true }));
  };

  return (
    <div className="h-full min-h-0 bg-white flex flex-col overflow-hidden border border-gray-300">
      <div className="px-3 py-4 border-b border-gray-100 flex flex-col text-left">
        <Link
          href="/instructor"
          className="inline-flex items-center justify-center gap-1.5 w-full text-base font-bold bg-white text-primary border border-primary px-4 py-3 hover:bg-primary/5"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
        <div className="mt-6 w-full min-w-0 pl-1.5">
          <p className="text-lg font-bold truncate">{courseTitle}</p>
          <p className="text-sm text-gray-400 mt-0.5">
            {courseCode}
            <span className="mx-1.5 text-gray-300">·</span>
            {lessonCount} lessons
          </p>
        </div>
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
                className={`group flex items-center gap-1.5 px-3 py-2.5 hover:bg-gray-50 border-t-2 ${
                  isUnitDragOver ? "border-primary" : "border-transparent"
                } ${draggingUnitId === unit.id ? "opacity-40" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => toggleUnit(unit.id)}
                  className="shrink-0 text-gray-400"
                  aria-label={isOpen ? "Collapse unit" : "Expand unit"}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-bold leading-tight truncate">
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
                <div>
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
                        className={`group flex items-center gap-1.5 px-3 py-2.5 cursor-pointer border-t-2 ${
                          isDragOver ? "border-primary" : "border-transparent"
                        } ${
                          isSelected ? "bg-primary/10" : "hover:bg-gray-50"
                        } ${draggingLessonId === lesson.id ? "opacity-40" : ""}`}
                        onClick={() => onSelectLesson(lesson.id)}
                      >
                        <span className="w-3.5 shrink-0" aria-hidden />
                        <p
                          className={`text-sm flex-1 min-w-0 truncate text-left ${
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

      <div className="p-3 border-t border-gray-100">
        <button
          type="button"
          onClick={handleAddUnit}
          className="w-full text-center text-base font-bold bg-primary text-white px-4 py-3 hover:opacity-90"
        >
          + Add unit
        </button>
      </div>
    </div>
  );
}
