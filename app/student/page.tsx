import Link from "next/link";
import { Play } from "lucide-react";
import AppHeader from "@/components/app/AppHeader";
import CourseBanner from "@/components/app/CourseBanner";
import ProgressRing from "@/components/app/ProgressRing";
import StudentCourseCard from "@/components/student/StudentCourseCard";
import { btnPrimary, card, eyebrow, pageTitle, sectionTitle } from "@/components/app/ui";
import { listStudentCourses } from "@/lib/student/data/course";
import { getLaunchingUser } from "@/lib/lti/config";
import type { StudentCourseSummary } from "@/lib/student/types";

/** The course to spotlight: furthest-along unfinished course, else the first one with lessons. */
function pickContinueCourse(courses: StudentCourseSummary[]): StudentCourseSummary | null {
  const inProgress = courses
    .filter((c) => c.percentComplete > 0 && c.percentComplete < 100 && c.resumeLessonId)
    .sort((a, b) => b.percentComplete - a.percentComplete);
  return inProgress[0] ?? courses.find((c) => c.resumeLessonId) ?? null;
}

export default async function StudentDashboardPage() {
  const [courses, learner] = await Promise.all([listStudentCourses(), getLaunchingUser()]);
  const spotlight = pickContinueCourse(courses);
  const firstName = learner.name.split(" ")[0];

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <AppHeader mode="learning" />

      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10">
          <p className={`${eyebrow} mb-2`}>My learning</p>
          <h1 className={pageTitle}>Welcome back, {firstName}.</h1>
          <p className="mt-2 text-gray-600">
            {courses.length === 0
              ? "You're not in any courses yet."
              : `You're enrolled in ${courses.length} ${courses.length === 1 ? "course" : "courses"}.`}
          </p>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
        {spotlight && (
          <section>
            <h2 className={`${sectionTitle} mb-4`}>{spotlight.percentComplete > 0 ? "Continue learning" : "Start learning"}</h2>
            <div className={`flex flex-col overflow-hidden md:flex-row ${card}`}>
              <CourseBanner code={spotlight.code} className="h-36 md:h-auto md:w-2/5" />
              <div className="flex flex-1 flex-col gap-5 p-6 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-primary">{spotlight.code}</p>
                  <h3 className="font-serif text-2xl font-semibold leading-snug">{spotlight.title}</h3>
                  {spotlight.resumeLessonTitle && (
                    <p className="mt-2 truncate text-sm text-gray-600">
                      <span className="font-semibold text-gray-800">Up next:</span> {spotlight.resumeLessonCode}{" "}
                      {spotlight.resumeLessonTitle}
                    </p>
                  )}
                  <Link
                    href={`/student/${spotlight.code}/learn?lesson=${spotlight.resumeLessonId}`}
                    className={`${btnPrimary} mt-5`}
                  >
                    <Play size={14} />
                    {spotlight.percentComplete > 0 ? "Resume" : "Start course"}
                  </Link>
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:gap-1.5">
                  <ProgressRing percent={spotlight.percentComplete} size={76} stroke={7} />
                  <span className="text-xs text-gray-500">
                    {spotlight.completedLessonCount}/{spotlight.totalLessonCount} lessons
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        <section>
          <h2 className={`${sectionTitle} mb-4`}>All courses</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <StudentCourseCard key={course.code} course={course} />
            ))}
          </div>
          {courses.length === 0 && <p className="text-sm text-gray-500">No courses available yet.</p>}
        </section>
      </div>
    </main>
  );
}
