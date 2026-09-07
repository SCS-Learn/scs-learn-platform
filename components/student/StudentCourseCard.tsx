import Link from "next/link";
import { BookOpen, CircleHelp, Layers, Play } from "lucide-react";
import type { StudentCourseSummary } from "@/lib/student/types";

function resumeHref(course: StudentCourseSummary) {
  if (!course.resumeLessonId) return `/student/${course.code}`;
  return `/student/${course.code}?lesson=${course.resumeLessonId}`;
}

export default function StudentCourseCard({ course }: { course: StudentCourseSummary }) {
  const hasStarted = course.percentComplete > 0;
  const buttonLabel = hasStarted ? "Resume from where you left off" : "Start course";

  return (
    <article className="border border-gray-200 bg-white p-5 flex flex-col gap-4 hover:border-black hover:shadow-sm transition">
      <div>
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-xs font-bold text-primary tracking-wide">{course.code}</p>
          {(course.department || course.track) && (
            <p className="text-[11px] text-gray-400 text-right truncate max-w-[50%]">
              {[course.department, course.track].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <h2 className="text-lg font-serif font-bold leading-snug">{course.title}</h2>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <Layers size={13} className="text-gray-400" />
          {course.unitCount} {course.unitCount === 1 ? "unit" : "units"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <BookOpen size={13} className="text-gray-400" />
          {course.contentLessonCount}{" "}
          {course.contentLessonCount === 1 ? "content lesson" : "content lessons"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CircleHelp size={13} className="text-gray-400" />
          {course.quizLessonCount} {course.quizLessonCount === 1 ? "quiz" : "quizzes"}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <p className="text-xs font-bold text-gray-600">
            {course.completedLessonCount} of {course.totalLessonCount} lessons complete
          </p>
          <p className="text-xs font-bold text-green-600">{course.percentComplete}%</p>
        </div>
        <div
          className="h-2 rounded-full bg-gray-100 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={course.percentComplete}
          aria-label={`${course.percentComplete}% complete`}
        >
          <div
            className="h-full rounded-full bg-green-500 transition-[width]"
            style={{ width: `${course.percentComplete}%` }}
          />
        </div>
      </div>

      <Link
        href={resumeHref(course)}
        className="mt-auto inline-flex items-center justify-center gap-1.5 text-sm font-bold bg-primary text-white py-2.5 hover:bg-primary/90 transition"
      >
        <Play size={14} />
        {buttonLabel}
      </Link>
    </article>
  );
}
