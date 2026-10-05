import Link from "next/link";
import { BookOpen, CircleHelp, Layers } from "lucide-react";
import type { StudentCourseSummary } from "@/lib/student/types";
import CourseBanner from "@/components/app/CourseBanner";
import { card, cardHover } from "@/components/app/ui";

export default function StudentCourseCard({ course }: { course: StudentCourseSummary }) {
  const started = course.percentComplete > 0;
  return (
    <Link
      href={`/student/${course.code}`}
      aria-label={`Open ${course.title}`}
      className={`group flex flex-col overflow-hidden ${card} ${cardHover}`}
    >
      <CourseBanner code={course.code} className="h-28" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          {(course.department || course.track) && (
            <p className="mb-1 truncate text-xs text-gray-500">{[course.department, course.track].filter(Boolean).join(" · ")}</p>
          )}
          <h3 className="font-serif text-lg font-semibold leading-snug group-hover:text-primary">{course.title}</h3>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Layers size={13} className="text-gray-400" />
            {course.unitCount} {course.unitCount === 1 ? "unit" : "units"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookOpen size={13} className="text-gray-400" />
            {course.contentLessonCount} {course.contentLessonCount === 1 ? "lesson" : "lessons"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CircleHelp size={13} className="text-gray-400" />
            {course.quizLessonCount} {course.quizLessonCount === 1 ? "quiz" : "quizzes"}
          </span>
        </div>

        <div className="mt-auto pt-2">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-600">
              {course.totalLessonCount === 0
                ? "No lessons published yet"
                : started
                  ? `${course.completedLessonCount} of ${course.totalLessonCount} complete`
                  : "Not started"}
            </span>
            <span className="font-bold text-green-700">{course.percentComplete}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-green-600 transition-[width]" style={{ width: `${course.percentComplete}%` }} />
          </div>
        </div>
      </div>
    </Link>
  );
}
