import AppHeader from "@/components/app/AppHeader";
import { card, eyebrow, pageTitle } from "@/components/app/ui";
import CourseListSection from "@/components/instructor/CourseListSection";
import AnnouncementsPanel from "@/components/instructor/AnnouncementsPanel";
import { getAnnouncements } from "@/lib/instructor/data/announcements";
import { getInstructorCourseList } from "@/lib/instructor/data/courses";
import { requireInstructor } from "@/lib/instructor/data/current-instructor";

export default async function InstructorDashboardPage() {
  const [announcements, courses, instructor] = await Promise.all([
    getAnnouncements(),
    getInstructorCourseList(),
    requireInstructor(),
  ]);

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <AppHeader mode="teaching" />

      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10">
          <p className={`${eyebrow} mb-2`}>Teaching</p>
          <h1 className={pageTitle}>Welcome back, {instructor.name.split(" ")[0]}.</h1>
          <p className="mt-2 text-gray-600">
            You&apos;re teaching {courses.length} {courses.length === 1 ? "course" : "courses"} this term.
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <CourseListSection courses={courses} />
        </div>
        <aside className={`${card} h-fit lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-hidden flex flex-col`}>
          <AnnouncementsPanel courses={courses} announcements={announcements} />
        </aside>
      </div>
    </main>
  );
}
