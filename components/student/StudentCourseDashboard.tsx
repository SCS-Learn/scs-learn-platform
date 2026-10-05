import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleHelp,
  ExternalLink,
  FileText,
  Megaphone,
  Play,
  Trophy,
} from "lucide-react";
import AppHeader from "@/components/app/AppHeader";
import CourseBanner from "@/components/app/CourseBanner";
import ProgressRing from "@/components/app/ProgressRing";
import { btnPrimary, card } from "@/components/app/ui";
import type { StudentCourse, StudentLesson } from "@/lib/student/types";
import type { Announcement, CalendarEvent } from "@/lib/instructor/mock-data";
import { parseISODate, TYPE_LABEL, TYPE_STYLE } from "@/lib/instructor/calendar";

function lessonHref(courseCode: string, lessonId: string) {
  return `/student/${courseCode}/learn?lesson=${lessonId}`;
}

function LessonIcon({ type }: { type: StudentLesson["type"] }) {
  if (type === "quiz") return <CircleHelp size={14} className="text-gray-400 shrink-0" />;
  if (type === "external") return <ExternalLink size={14} className="text-gray-400 shrink-0" />;
  return <FileText size={14} className="text-gray-400 shrink-0" />;
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

type GradeRow = { lessonId: string; label: string; score: string | null };

/** Every graded thing in the course - in-app quizzes, Cogniterra (LTI) activities, Autolab assessments - in course order. */
function collectGrades(course: StudentCourse): GradeRow[] {
  const rows: GradeRow[] = [];
  for (const unit of course.units) {
    for (const lesson of unit.lessons) {
      const label = `${lesson.code} ${lesson.title}`;
      if (lesson.lti) {
        rows.push({
          lessonId: lesson.id,
          label,
          score: lesson.lti.score == null ? null : `${formatPoints(lesson.lti.score)} / ${lesson.lti.pointsPossible}`,
        });
      } else if (lesson.autolab) {
        rows.push({
          lessonId: lesson.id,
          label,
          score:
            lesson.autolab.score == null ? null : `${formatPoints(lesson.autolab.score)} / ${lesson.autolab.pointsPossible}`,
        });
      } else if (lesson.type === "quiz") {
        rows.push({
          lessonId: lesson.id,
          label,
          score: lesson.quizSubmission ? `${lesson.quizSubmission.scorePercent}%` : null,
        });
      }
    }
  }
  return rows;
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      className="h-2 rounded-full bg-gray-100 overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-green-500 transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} p-5`}>
      <h2 className="flex items-center gap-2 font-serif text-lg font-semibold mb-4">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function StudentCourseDashboard({
  course,
  announcements,
  events,
}: {
  course: StudentCourse;
  announcements: Announcement[];
  events: CalendarEvent[];
}) {
  const lessons = course.units.flatMap((u) => u.lessons);
  const completedCount = lessons.filter((l) => l.completedAt != null).length;
  const percentComplete = lessons.length === 0 ? 0 : Math.round((completedCount / lessons.length) * 100);
  const resumeLesson = lessons.find((l) => l.completedAt == null) ?? null;
  const grades = collectGrades(course);

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <AppHeader mode="learning" backHref="/student" backLabel="My learning" />

      <CourseBanner code={course.code} showCode={false} className="h-36 md:h-44" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <section className={`${card} relative -mt-16 p-6 mb-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between`}>
          <div className="min-w-0 flex items-center gap-5">
            <ProgressRing percent={percentComplete} size={72} stroke={7} className="hidden sm:inline-flex" />
            <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
              <p className="text-xs font-bold text-primary tracking-wide">{course.code}</p>
              {(course.department || course.track) && (
                <p className="text-xs text-gray-400">{[course.department, course.track].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <h1 className="text-3xl font-serif font-semibold leading-tight">{course.title}</h1>
            <p className="mt-1.5 text-sm text-gray-600">
              {completedCount} of {lessons.length} lessons complete
              <span className="sm:hidden"> · {percentComplete}%</span>
            </p>
            </div>
          </div>

          {lessons.length > 0 && (
            <Link
              href={lessonHref(course.code, (resumeLesson ?? lessons[0]).id)}
              className={`${btnPrimary} shrink-0 max-w-full md:max-w-sm px-5 py-3`}
            >
              <Play size={14} />
              <span className="truncate">
                {resumeLesson
                  ? completedCount > 0
                    ? `Resume: ${resumeLesson.code} ${resumeLesson.title}`
                    : "Start course"
                  : "Review course"}
              </span>
            </Link>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <h2 className="font-serif text-xl font-semibold">Course content</h2>
            {course.units.map((unit) => {
              const done = unit.lessons.filter((l) => l.completedAt != null).length;
              const unitPercent = Math.round((done / unit.lessons.length) * 100);
              // Only the unit the learner is currently in starts open: a full
              // course (02-180 has 150+ lessons) is otherwise a wall of links.
              const isCurrentUnit = resumeLesson ? unit.lessons.some((l) => l.id === resumeLesson.id) : false;
              return (
                <details key={unit.id} open={isCurrentUnit} className={`group overflow-hidden ${card}`}>
                  <summary className="list-none cursor-pointer px-5 pt-4 pb-3.5 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            unitPercent === 100 ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {unitPercent === 100 ? <CheckCircle2 size={15} /> : unit.code.replace(/^Unit\s*/i, "")}
                        </span>
                        <p className="text-[15px] font-semibold leading-snug">{unit.title}</p>
                      </div>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-gray-500">
                          {done}/{unit.lessons.length}
                        </span>
                        <ChevronDown size={15} className="text-gray-400 transition-transform group-open:rotate-180" />
                      </span>
                    </div>
                    <ProgressBar percent={unitPercent} label={`${unit.title}: ${unitPercent}% complete`} />
                  </summary>
                  <ul className="border-t border-gray-100">
                    {unit.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <Link
                          href={lessonHref(course.code, lesson.id)}
                          className="flex items-center gap-3 px-5 py-2.5 pl-[3.75rem] text-sm text-gray-700 hover:bg-gray-50 hover:text-black"
                        >
                          {lesson.completedAt != null ? (
                            <CheckCircle2 size={15} className="text-green-500 shrink-0" aria-label="Completed" />
                          ) : (
                            <Circle size={15} className="text-gray-300 shrink-0" aria-label="Not completed" />
                          )}
                          <LessonIcon type={lesson.type} />
                          <span className="truncate flex-1">
                            {lesson.code} {lesson.title}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
            {course.units.length === 0 && (
              <p className="text-sm text-gray-400">No published lessons yet.</p>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Panel icon={<Trophy size={15} className="text-gray-400" />} title="Grades">
              {grades.length === 0 ? (
                <p className="text-sm text-gray-400">No graded work in this course yet.</p>
              ) : (
                <ul className="flex flex-col gap-2.5 max-h-96 overflow-y-auto pr-1">
                  {grades.map((grade) => (
                    <li key={grade.lessonId} className="flex items-baseline justify-between gap-3 text-sm">
                      <Link href={lessonHref(course.code, grade.lessonId)} className="truncate text-gray-700 hover:text-black">
                        {grade.label}
                      </Link>
                      <span
                        className={`shrink-0 tabular-nums font-bold ${grade.score ? "text-black" : "text-gray-300"}`}
                      >
                        {grade.score ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel icon={<Megaphone size={15} className="text-gray-400" />} title="Announcements">
              {announcements.length === 0 ? (
                <p className="text-sm text-gray-400">No announcements yet.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {announcements.map((a) => (
                    <li key={a.id}>
                      <p className="text-xs text-gray-400 mb-1">
                        <span className="font-bold text-gray-600">{a.authorName}</span> · {a.timestamp}
                      </p>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{a.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel icon={<CalendarDays size={15} className="text-gray-400" />} title="Upcoming">
              {events.length === 0 ? (
                <p className="text-sm text-gray-400">Nothing scheduled.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {events.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      <div className="w-11 shrink-0 text-center border border-gray-200 py-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          {parseISODate(event.date).toLocaleDateString("en-US", { month: "short" })}
                        </p>
                        <p className="text-base font-bold leading-tight">{parseISODate(event.date).getDate()}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{event.title}</p>
                        <p className="text-xs text-gray-500">
                          <span className={`inline-block px-1.5 py-0.5 mr-1.5 text-[10px] font-bold ${TYPE_STYLE[event.type]}`}>
                            {TYPE_LABEL[event.type]}
                          </span>
                          {event.time}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}
