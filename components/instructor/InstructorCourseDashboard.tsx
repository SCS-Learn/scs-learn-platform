import Link from "next/link";
import { BarChart3, ChevronDown, CircleHelp, Eye, ExternalLink, FileText, Pencil, Users } from "lucide-react";
import InstructorHeader from "@/components/instructor/InstructorHeader";
import AnnouncementsPanel from "@/components/instructor/AnnouncementsPanel";
import CalendarPanel from "@/components/instructor/CalendarPanel";
import { formatRelativeTime } from "@/lib/instructor/format";
import type { CourseActivity } from "@/lib/instructor/data/course-dashboard";
import type { Announcement, CalendarEvent, InstructorCourse, LessonItem } from "@/lib/instructor/mock-data";

function LessonIcon({ type }: { type: LessonItem["type"] }) {
  if (type === "quiz") return <CircleHelp size={14} className="text-gray-400 shrink-0" />;
  if (type === "external") return <ExternalLink size={14} className="text-gray-400 shrink-0" />;
  return <FileText size={14} className="text-gray-400 shrink-0" />;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-gray-200 bg-white p-5">
      <p className="text-xs font-bold text-gray-500 tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-serif font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const actionClass =
  "inline-flex items-center justify-center gap-1.5 text-sm font-bold border border-black text-black px-4 py-2.5 hover:bg-gray-50 transition";

export default function InstructorCourseDashboard({
  course,
  activity,
  announcements,
  events,
}: {
  course: InstructorCourse;
  activity: CourseActivity;
  announcements: Announcement[];
  events: CalendarEvent[];
}) {
  const lessons = course.units.flatMap((u) => u.lessons);
  const publishedCount = lessons.filter((l) => l.isPublished).length;
  const quizCount = lessons.filter((l) => l.type === "quiz").length;
  const externalCount = lessons.filter((l) => l.type === "external").length;
  const learnerCount = activity.learners.length;

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <InstructorHeader backHref="/instructor" backLabel="Back to dashboard" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <section className="border border-gray-200 bg-white p-6 mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
              <p className="text-sm font-bold text-iron-gray tracking-wide">{course.code}</p>
              {(course.department || course.track) && (
                <p className="text-xs text-gray-400">{[course.department, course.track].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <h1 className="text-3xl font-serif font-bold">{course.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href={`/instructor/${course.code}/edit`} className={`${actionClass} bg-black text-white hover:bg-black/85`}>
              <Pencil size={14} />
              Edit content
            </Link>
            <Link href={`/instructor/${course.code}/analytics`} className={actionClass}>
              <BarChart3 size={14} />
              Analytics
            </Link>
            <a href={`/student/${course.code}`} target="_blank" rel="noopener noreferrer" className={actionClass}>
              <Eye size={14} />
              Student view
            </a>
          </div>
        </section>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatTile label="LEARNERS" value={String(learnerCount)} hint="with any activity" />
          <StatTile
            label="PUBLISHED"
            value={`${publishedCount}/${lessons.length}`}
            hint={`${quizCount} ${quizCount === 1 ? "quiz" : "quizzes"} · ${externalCount} external`}
          />
          <StatTile
            label="AVG COMPLETION"
            value={activity.averagePercentComplete === null ? "—" : `${activity.averagePercentComplete}%`}
            hint="of published lessons"
          />
          <StatTile
            label="AVG QUIZ SCORE"
            value={activity.averageQuizScore === null ? "—" : `${activity.averageQuizScore}%`}
            hint="across all submissions"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <section className="border border-gray-200 bg-white">
              <h2 className="flex items-center gap-2 text-sm font-bold px-5 py-4 border-b border-gray-100">
                <Users size={15} className="text-gray-400" />
                Learners
              </h2>
              {learnerCount === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">
                  No learner activity yet. Learners show up here once they complete a lesson, submit a quiz, or open a
                  Cogniterra activity.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-bold text-gray-500">
                        <th className="px-5 py-2.5 font-bold">Name</th>
                        <th className="px-3 py-2.5 font-bold">Progress</th>
                        <th className="px-3 py-2.5 font-bold text-right">Quiz avg</th>
                        <th className="px-5 py-2.5 font-bold text-right">Last active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.learners.map((learner) => (
                        <tr key={learner.id} className="border-t border-gray-100">
                          <td className="px-5 py-2.5">
                            <p className="font-bold truncate max-w-[14rem]">{learner.name}</p>
                            {learner.email && <p className="text-xs text-gray-400 truncate max-w-[14rem]">{learner.email}</p>}
                          </td>
                          <td className="px-3 py-2.5 min-w-[9rem]">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-green-500"
                                  style={{ width: `${learner.percentComplete}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold tabular-nums text-gray-600 w-9 text-right">
                                {learner.percentComplete}%
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                            {learner.averageQuizScore === null ? (
                              <span className="text-gray-300">—</span>
                            ) : (
                              `${learner.averageQuizScore}%`
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap">
                            {learner.lastActiveAt ? formatRelativeTime(learner.lastActiveAt) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="border border-gray-200 bg-white">
              <h2 className="text-sm font-bold px-5 py-4 border-b border-gray-100">Content</h2>
              {course.units.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">
                  No units yet.{" "}
                  <Link href={`/instructor/${course.code}/edit`} className="underline hover:text-black">
                    Add content in the editor
                  </Link>
                  .
                </p>
              ) : (
                course.units.map((unit) => {
                  const unitPublished = unit.lessons.filter((l) => l.isPublished).length;
                  return (
                  <details key={unit.id} className="group border-b border-gray-100 last:border-b-0">
                    <summary className="list-none cursor-pointer flex items-center gap-3 px-5 py-3 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
                      <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                        {unit.code} · {unit.title}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                        {unit.lessons.length} {unit.lessons.length === 1 ? "lesson" : "lessons"}
                        {unitPublished < unit.lessons.length && ` · ${unit.lessons.length - unitPublished} draft`}
                      </span>
                      <ChevronDown size={15} className="text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="pb-2">
                      {unit.lessons.map((lesson) => {
                        const completions = activity.completionsByLessonId[lesson.id] ?? 0;
                        const quizAverage = activity.averageScoreByQuizId[lesson.id];
                        return (
                          <li key={lesson.id} className="flex items-center gap-3 px-5 py-1.5 text-sm">
                            <LessonIcon type={lesson.type} />
                            <span className="truncate flex-1 text-gray-700">
                              {lesson.code} {lesson.title}
                            </span>
                            {quizAverage !== undefined && (
                              <span className="text-xs text-gray-500 shrink-0 tabular-nums">avg {quizAverage}%</span>
                            )}
                            {learnerCount > 0 && (
                              <span className="text-xs text-gray-500 shrink-0 tabular-nums w-20 text-right">
                                {completions}/{learnerCount} done
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 shrink-0 ${
                                lesson.isPublished ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {lesson.isPublished ? "Published" : "Draft"}
                            </span>
                          </li>
                        );
                      })}
                      {unit.lessons.length === 0 && <li className="px-5 py-1.5 text-sm text-gray-400">No lessons yet.</li>}
                    </ul>
                  </details>
                  );
                })
              )}
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <section className="border border-gray-200 bg-white h-[30rem]">
              <AnnouncementsPanel courses={[{ code: course.code, title: course.title }]} announcements={announcements} />
            </section>
            <section className="border border-gray-200 bg-white p-5 h-[24rem]">
              <CalendarPanel events={events} courses={[course]} />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
