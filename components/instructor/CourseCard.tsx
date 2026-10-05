"use client";

import Link from "next/link";
import { BarChart3, BookOpen, Pencil, Trash2, Users } from "lucide-react";
import type { InstructorCourse } from "@/lib/instructor/mock-data";
import CourseBanner from "@/components/app/CourseBanner";
import { btnSecondary, card, cardHover } from "@/components/app/ui";

export default function CourseCard({
  course,
  onDelete,
}: {
  course: InstructorCourse;
  onDelete?: (course: InstructorCourse) => void;
}) {
  const lessons = course.units.flatMap((u) => u.lessons);
  const lessonCount = lessons.length;
  const draftCount = lessons.filter((l) => !l.isPublished).length;

  return (
    <div className={`group relative flex flex-col overflow-hidden ${card} ${cardHover}`}>
      <Link href={`/instructor/${course.code}`} className="absolute inset-0 z-0" aria-label={`Open ${course.title} dashboard`} />

      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${course.title}`}
          className="absolute top-3 right-3 z-20 rounded-md bg-black/30 p-1.5 text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100 focus:opacity-100"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(course);
          }}
        >
          <Trash2 size={15} />
        </button>
      )}

      <CourseBanner code={course.code} className="h-24 pointer-events-none" />

      <div className="relative z-10 pointer-events-none flex flex-1 flex-col p-5">
        <h3 className="font-serif text-xl font-semibold leading-snug group-hover:text-primary">{course.title}</h3>

        <div className="mt-2 mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <BookOpen size={14} />
            {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={14} />
            {course.studentCount} {course.studentCount === 1 ? "student" : "students"}
          </span>
          {draftCount > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {draftCount} draft
            </span>
          )}
        </div>

        <div className="mt-auto flex gap-2 pointer-events-auto">
          <Link href={`/instructor/${course.code}/edit`} className={`${btnSecondary} flex-1`}>
            <Pencil size={14} />
            Edit content
          </Link>
          <Link href={`/instructor/${course.code}/analytics`} className={`${btnSecondary} flex-1`}>
            <BarChart3 size={14} />
            Analytics
          </Link>
        </div>
      </div>
    </div>
  );
}
