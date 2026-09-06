"use client";

import Link from "next/link";
import { BarChart3, BookOpen, Pencil, Trash2, Users } from "lucide-react";
import type { InstructorCourse } from "@/lib/instructor/mock-data";

export default function CourseCard({
  course,
  onDelete,
}: {
  course: InstructorCourse;
  onDelete?: (course: InstructorCourse) => void;
}) {
  const lessonCount = course.units.reduce((sum, u) => sum + u.lessons.length, 0);

  return (
    <div className="group relative border border-gray-200 bg-white p-6 hover:border-iron-gray hover:shadow-sm transition flex flex-col cursor-pointer">
      <Link
        href={`/instructor/${course.code}`}
        className="absolute inset-0 z-0"
        aria-label={`Open ${course.title} editor`}
      />

      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${course.title}`}
          className="absolute top-4 right-4 z-20 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition pointer-events-auto"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(course);
          }}
        >
          <Trash2 size={16} />
        </button>
      )}

      <div className="relative z-10 pointer-events-none flex flex-col flex-1">
        <p className="text-sm font-bold text-iron-gray tracking-wide mb-2">
          {course.code}
        </p>

        <h3 className="text-xl font-serif font-bold mb-4">{course.title}</h3>

        <div className="flex items-center gap-5 text-sm text-gray-500 mb-6">
          <span className="flex items-center gap-1.5">
            <BookOpen size={15} />
            {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={15} />
            {course.studentCount} students
          </span>
        </div>

        <div className="mt-auto flex gap-2 pointer-events-auto">
        <Link
          href={`/instructor/${course.code}`}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold text-black border border-black py-2.5 hover:bg-gray-50 transition"
        >
          <Pencil size={14} />
          Editor
        </Link>
        <Link
          href={`/instructor/${course.code}/analytics`}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold border border-black text-black py-2.5 hover:bg-gray-50 transition"
        >
          <BarChart3 size={14} />
          Analytics
        </Link>
        </div>
      </div>
    </div>
  );
}
