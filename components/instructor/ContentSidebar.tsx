"use client";

import { useState, type DragEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  FolderInput,
  UploadCloud,
} from "lucide-react";
import { type Unit } from "@/lib/instructor/mock-data";
import GoogleDriveImportModal from "@/components/instructor/GoogleDriveImportModal";

function AddUnitModal({
  onCreate,
  onClose,
}: {
  onCreate: (title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");

  const submit = () => {
    onCreate(title.trim() || "Untitled unit");
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-black rounded-md shadow-xl w-full max-w-sm p-6"
      >
        <h2 className="text-lg font-bold mb-3">Name this unit</h2>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Untitled unit"
          className="w-full text-sm border border-steel-gray rounded px-3 py-2 mb-4 outline-none focus:border-iron-gray"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-bold text-gray-500 px-4 py-2 hover:bg-gray-50 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="text-sm font-bold text-black border border-black px-4 py-2 rounded hover:bg-gray-50"
          >
            Create unit
          </button>
        </div>
      </div>
    </div>
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
  onRenameUnit,
  onChangeUnitNumber,
  onReorderLessons,
  onMoveLessonToUnit,
  onAddUnit,
  onReorderUnits,
  onDeleteCourse,
  onPublishAll,
}: {
  courseCode: string;
  courseTitle: string;
  units: Unit[];
  selectedLessonId: string;
  onSelectLesson: (lessonId: string) => void;
  onAddLesson: (unitId: string) => void;
  onDeleteLesson: (unitId: string, lessonId: string) => void;
  onDeleteUnit: (unitId: string) => void;
  onRenameUnit: (unitId: string, title: string) => void;
  onChangeUnitNumber: (unitId: string, newNumber: number) => void;
  onReorderLessons: (unitId: string, draggedLessonId: string, targetLessonId: string) => void;
  onMoveLessonToUnit: (
    fromUnitId: string,
    toUnitId: string,
    lessonId: string,
    targetLessonId: string | null
  ) => void;
  onAddUnit: (title: string) => Promise<string>;
  onReorderUnits: (draggedUnitId: string, targetUnitId: string) => void;
  onDeleteCourse: () => void;
  onPublishAll: () => void;
}) {
  const lessonCount = units.reduce((sum, u) => sum + u.lessons.length, 0);
  const unpublishedCount = units.reduce(
    (sum, u) => sum + u.lessons.filter((l) => !l.isPublished).length,
    0
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const unit = units.find((u) => u.lessons.some((l) => l.id === selectedLessonId));
    return unit ? { [unit.id]: true } : {};
  });
  const [draggingLessonId, setDraggingLessonId] = useState<string | null>(null);
  const [draggingLessonUnitId, setDraggingLessonUnitId] = useState<string | null>(null);
  const [dragOverLessonId, setDragOverLessonId] = useState<string | null>(null);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const [dragOverUnitId, setDragOverUnitId] = useState<string | null>(null);
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [isDriveImportOpen, setIsDriveImportOpen] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingUnitNumberId, setEditingUnitNumberId] = useState<string | null>(null);
  const [editingNumberValue, setEditingNumberValue] = useState("");

  const toggleUnit = (unitId: string) => {
    setExpanded((prev) => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const startEditingUnit = (unit: Unit) => {
    setEditingUnitId(unit.id);
    setEditingTitle(unit.title);
  };

  const commitEditingUnit = () => {
    if (editingUnitId) {
      const trimmed = editingTitle.trim();
      if (trimmed) onRenameUnit(editingUnitId, trimmed);
    }
    setEditingUnitId(null);
    setEditingTitle("");
  };

  const cancelEditingUnit = () => {
    setEditingUnitId(null);
    setEditingTitle("");
  };

  const startEditingUnitNumber = (unit: Unit) => {
    setEditingUnitNumberId(unit.id);
    setEditingNumberValue(unit.code.match(/(\d+)/)?.[1] ?? "");
  };

  const commitEditingUnitNumber = () => {
    if (editingUnitNumberId) {
      const parsed = Number.parseInt(editingNumberValue, 10);
      if (Number.isFinite(parsed) && parsed > 0) onChangeUnitNumber(editingUnitNumberId, parsed);
    }
    setEditingUnitNumberId(null);
    setEditingNumberValue("");
  };

  const cancelEditingUnitNumber = () => {
    setEditingUnitNumberId(null);
    setEditingNumberValue("");
  };

  const handleDragStart = (e: DragEvent, unitId: string, lessonId: string) => {
    setDraggingLessonId(lessonId);
    setDraggingLessonUnitId(unitId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent, lessonId: string) => {
    e.preventDefault();
    if (lessonId !== dragOverLessonId) setDragOverLessonId(lessonId);
  };

  const handleDrop = (e: DragEvent, unitId: string, lessonId: string) => {
    e.preventDefault();
    if (draggingLessonId && draggingLessonUnitId && draggingLessonUnitId !== unitId) {
      onMoveLessonToUnit(draggingLessonUnitId, unitId, draggingLessonId, lessonId);
    } else if (draggingLessonId) {
      onReorderLessons(unitId, draggingLessonId, lessonId);
    }
    setDraggingLessonId(null);
    setDraggingLessonUnitId(null);
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
    if (draggingLessonId && draggingLessonUnitId && draggingLessonUnitId !== unitId) {
      onMoveLessonToUnit(draggingLessonUnitId, unitId, draggingLessonId, null);
      setExpanded((prev) => ({ ...prev, [unitId]: true }));
    } else if (draggingUnitId) {
      onReorderUnits(draggingUnitId, unitId);
    }
    setDraggingLessonId(null);
    setDraggingLessonUnitId(null);
    setDraggingUnitId(null);
    setDragOverUnitId(null);
  };

  const handleUnitDragEnd = () => {
    setDraggingUnitId(null);
    setDragOverUnitId(null);
  };

  const handleAddUnit = async (title: string) => {
    setIsAddUnitOpen(false);
    const newId = await onAddUnit(title);
    setExpanded((prev) => ({ ...prev, [newId]: true }));
  };

  return (
    <div className="h-full min-h-0 bg-white flex flex-col overflow-hidden border border-gray-300">
      <div className="px-3 py-4 border-b border-gray-100 flex flex-col text-left">
        <Link
          href="/instructor"
          className="inline-flex items-center justify-center gap-1.5 w-full text-base font-bold bg-white text-black border border-black px-4 py-3 hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
        <div className="mt-6 w-full min-w-0 pl-1.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-bold truncate">{courseTitle}</p>
            <p className="text-sm text-gray-400 mt-0.5">
              {courseCode}
              <span className="mx-1.5 text-gray-300">·</span>
              {lessonCount} lessons
            </p>
          </div>
          <button
            type="button"
            aria-label="Delete course"
            title="Delete course"
            className="shrink-0 text-gray-300 hover:text-red-500 mt-0.5"
            onClick={onDeleteCourse}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {units.map((unit) => {
          const isOpen = !!expanded[unit.id];
          const isUnitDragOver =
            dragOverUnitId === unit.id &&
            (draggingUnitId ? draggingUnitId !== unit.id : draggingLessonUnitId !== unit.id);
          return (
            <div key={unit.id} className="mb-1">
              <div
                draggable
                onClick={() => toggleUnit(unit.id)}
                onDragStart={(e) => handleUnitDragStart(e, unit.id)}
                onDragOver={(e) => handleUnitDragOver(e, unit.id)}
                onDragLeave={() =>
                  setDragOverUnitId((prev) => (prev === unit.id ? null : prev))
                }
                onDrop={(e) => handleUnitDrop(e, unit.id)}
                onDragEnd={handleUnitDragEnd}
                className={`group flex items-center gap-1.5 px-3 py-2.5 hover:bg-gray-50 border-t-2 cursor-pointer ${
                  isUnitDragOver ? "border-black" : "border-transparent"
                } ${draggingUnitId === unit.id ? "opacity-40" : ""}`}
              >
                <span className="shrink-0 text-gray-400" aria-hidden="true">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <div className="flex-1 min-w-0 text-left">
                  {editingUnitId === unit.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={commitEditingUnit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEditingUnit();
                        if (e.key === "Escape") cancelEditingUnit();
                      }}
                      className="w-full text-sm font-bold leading-tight bg-white border border-black px-1 -mx-1 outline-none"
                    />
                  ) : (
                    <p className="text-sm font-bold leading-tight truncate">
                      {editingUnitNumberId === unit.id ? (
                        <input
                          autoFocus
                          type="number"
                          min={1}
                          value={editingNumberValue}
                          onChange={(e) => setEditingNumberValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={commitEditingUnitNumber}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEditingUnitNumber();
                            if (e.key === "Escape") cancelEditingUnitNumber();
                          }}
                          className="w-12 text-sm font-bold bg-white border border-black px-1 outline-none"
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            startEditingUnitNumber(unit);
                          }}
                          className="cursor-text"
                          title="Double-click to change this unit's number"
                        >
                          {unit.code}
                        </span>
                      )}
                      {" — "}
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startEditingUnit(unit);
                        }}
                        className="cursor-text"
                        title="Double-click to rename"
                      >
                        {unit.title}
                      </span>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Add lesson"
                  className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-500"
                  onClick={(e) => {
                    e.stopPropagation();
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteUnit(unit.id);
                  }}
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
                        onDragStart={(e) => handleDragStart(e, unit.id, lesson.id)}
                        onDragOver={(e) => handleDragOver(e, lesson.id)}
                        onDragLeave={() =>
                          setDragOverLessonId((prev) => (prev === lesson.id ? null : prev))
                        }
                        onDrop={(e) => handleDrop(e, unit.id, lesson.id)}
                        onDragEnd={() => {
                          setDraggingLessonId(null);
                          setDraggingLessonUnitId(null);
                          setDragOverLessonId(null);
                        }}
                        className={`group flex items-center gap-1.5 pl-8 pr-3 py-2.5 cursor-pointer border-t-2 ${
                          isDragOver ? "border-black" : "border-transparent"
                        } ${
                          isSelected ? "bg-steel-gray" : "hover:bg-gray-50"
                        } ${draggingLessonId === lesson.id ? "opacity-40" : ""}`}
                        onClick={() => onSelectLesson(lesson.id)}
                      >
                        <p
                          className={`text-sm flex-1 min-w-0 truncate text-left ${
                            isSelected ? "text-black font-bold" : "text-gray-700"
                          }`}
                        >
                          {lesson.title}
                        </p>
                        {lesson.type === "quiz" && (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            Quiz
                          </span>
                        )}
                        {lesson.type === "external" && (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            External
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label="Delete lesson"
                          className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteLesson(unit.id, lesson.id);
                          }}
                        >
                          <Trash2 size={14} />
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

      <div className="p-3 border-t border-gray-100 flex flex-col gap-2">
        {unpublishedCount > 0 && (
          <button
            type="button"
            onClick={onPublishAll}
            className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-bold text-black border border-black px-4 py-2.5 hover:bg-gray-50"
          >
            <UploadCloud size={15} />
            Publish all ({unpublishedCount} unpublished)
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsAddUnitOpen(true)}
          className="w-full text-center text-base font-bold text-black border border-black px-4 py-3 hover:bg-gray-50"
        >
          + Add unit
        </button>
        <button
          type="button"
          onClick={() => setIsDriveImportOpen(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-bold text-black border border-black px-4 py-2.5 hover:bg-gray-50"
        >
          <FolderInput size={15} />
          Import from Google Drive
        </button>
      </div>

      {isAddUnitOpen && (
        <AddUnitModal onCreate={handleAddUnit} onClose={() => setIsAddUnitOpen(false)} />
      )}

      {isDriveImportOpen && (
        <GoogleDriveImportModal
          courseCode={courseCode}
          onClose={() => setIsDriveImportOpen(false)}
          onImportComplete={({
            unitIds,
            lessonIds,
            youtubePlaylistWarning,
            skippedAlreadyImportedCount,
            failedUnitTitles,
          }) => {
            const message = `Imported ${unitIds.length} unit${unitIds.length === 1 ? "" : "s"} and ${lessonIds.length} lesson${
              lessonIds.length === 1 ? "" : "s"
            } from Google Drive. Review titles and types before publishing.${
              skippedAlreadyImportedCount > 0
                ? `\n\nSkipped ${skippedAlreadyImportedCount} file${skippedAlreadyImportedCount === 1 ? "" : "s"} already imported into this course.`
                : ""
            }${
              failedUnitTitles.length > 0
                ? `\n\n${failedUnitTitles.length} unit${failedUnitTitles.length === 1 ? "" : "s"} failed to import and were skipped (likely a transient error) — re-run import to retry: ${failedUnitTitles.join(", ")}`
                : ""
            }${youtubePlaylistWarning ? `\n\nYouTube playlist: ${youtubePlaylistWarning}` : ""}`;
            window.alert(message);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
