import Link from "next/link";
import { ChevronRight, Users, BookOpen } from "lucide-react";
import type { InstructorCourse } from "@/lib/instructor/mock-data";

export default function CourseCard({ course }: { course: InstructorCourse }) {
  const lessonCount = course.units.reduce((sum, u) => sum + u.lessons.length, 0);

  return (
    <Link
      href={`/instructor/${course.code}`}
      className="group block border border-gray-200 rounded-md bg-white p-4 hover:border-primary/40 hover:shadow-sm transition"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-primary tracking-wide">
          {course.code} · {course.department.toUpperCase()}
        </p>
        <ChevronRight
          size={16}
          className="text-gray-300 group-hover:text-primary transition"
        />
      </div>

      <h3 className="text-lg font-serif font-bold mb-1">{course.title}</h3>

      <span className="inline-block text-[10px] font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 mb-3">
        {course.track}
      </span>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <BookOpen size={13} />
          {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
        </span>
        <span className="flex items-center gap-1">
          <Users size={13} />
          {course.studentCount} students
        </span>
      </div>
    </Link>
  );
}
