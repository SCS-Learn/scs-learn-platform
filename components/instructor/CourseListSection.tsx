"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import CourseCard from "@/components/instructor/CourseCard";
import { createCourse } from "@/lib/instructor/data/courses";
import type { InstructorCourse } from "@/lib/instructor/mock-data";

const TRACK_OPTIONS = ["Paid track", "Cohort", "Open enrollment"];

function CreateCourseModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [track, setTrack] = useState(TRACK_OPTIONS[0]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError("");
    startTransition(async () => {
      try {
        const result = await createCourse({ code, title, department, track });
        onCreated(result.code);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create course.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-course-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-black rounded-md shadow-xl w-full max-w-md p-6"
      >
        <h2 id="create-course-title" className="text-lg font-bold mb-4">
          Create a new course
        </h2>

        <div className="flex flex-col gap-3 mb-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-gray-600">Course code</span>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 02-251"
              className="text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-primary/50"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-gray-600">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Introduction to Bioinformatics"
              className="text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-primary/50"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-gray-600">Department</span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Computational Biology"
              className="text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-primary/50"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-gray-600">Track</span>
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value)}
              className="text-sm border border-gray-200 rounded px-3 py-2 bg-white outline-none focus:border-primary/50"
            >
              {TRACK_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="text-sm font-bold text-gray-500 px-4 py-2 hover:bg-gray-50 rounded disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !code.trim() || !title.trim() || !department.trim()}
            className="text-sm font-bold bg-primary text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-40"
          >
            {isPending ? "Creating…" : "Create course"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CourseListSection({ courses }: { courses: InstructorCourse[] }) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  const handleCreated = (code: string) => {
    setShowModal(false);
    router.push(`/instructor/${code}`);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">Your courses</h2>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
        >
          <Plus size={14} />
          New course
        </button>
      </div>

      {courses.length === 0 ? (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="w-full border-2 border-dashed border-gray-200 rounded-md p-10 text-center hover:border-primary/40 hover:bg-white transition"
        >
          <Plus size={24} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm font-bold mb-1">Create your first course</p>
          <p className="text-xs text-gray-500">Add a course code, title, and department to get started.</p>
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {courses.map((course) => (
            <CourseCard key={course.code} course={course} />
          ))}
        </div>
      )}

      {showModal && (
        <CreateCourseModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}
    </>
  );
}
