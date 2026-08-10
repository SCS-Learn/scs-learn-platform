import Link from "next/link";
import { BarChart3, BookOpen, Pencil, Users } from "lucide-react";
import type { InstructorCourse } from "@/lib/instructor/mock-data";

export default function CourseCard({ course }: { course: InstructorCourse }) {
  const lessonCount = course.units.reduce((sum, u) => sum + u.lessons.length, 0);

  return (
    <div className="border border-gray-200 bg-white p-6 hover:border-primary/40 hover:shadow-sm transition flex flex-col">
      <p className="text-sm font-bold text-primary tracking-wide mb-2">
        {course.code} · {course.department.toUpperCase()}
      </p>

      <h3 className="text-xl font-serif font-bold mb-2">{course.title}</h3>

      <span className="inline-block text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 mb-4 w-fit">
        {course.track}
      </span>

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

      <div className="mt-auto flex gap-2">
        <Link
          href={`/instructor/${course.code}`}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold bg-primary text-white py-2.5 hover:bg-primary/90 transition"
        >
          <Pencil size={14} />
          Editor
        </Link>
        <Link
          href={`/instructor/${course.code}/analytics`}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold border border-gray-200 text-gray-700 py-2.5 hover:border-primary/40 hover:text-primary transition"
        >
          <BarChart3 size={14} />
          Analytics
        </Link>
      </div>
    </div>
  );
}
