import InstructorHeader from "@/components/instructor/InstructorHeader";
import CourseListSection from "@/components/instructor/CourseListSection";
import AnnouncementsPanel from "@/components/instructor/AnnouncementsPanel";
import { getAnnouncements } from "@/lib/instructor/data/announcements";
import { getInstructorCourseList } from "@/lib/instructor/data/courses";
import { getCurrentInstructor } from "@/lib/instructor/data/current-instructor";

export default async function InstructorDashboardPage() {
  const [announcements, courses, instructor] = await Promise.all([
    getAnnouncements(),
    getInstructorCourseList(),
    getCurrentInstructor(),
  ]);

  return (
    <main className="min-h-screen bg-gray-50 text-black flex flex-col lg:h-screen lg:overflow-hidden">
      <InstructorHeader />

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <aside className="lg:w-1/4 flex flex-col min-h-0 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white p-6 lg:overflow-hidden">
          <AnnouncementsPanel courses={courses} announcements={announcements} />
        </aside>

        <div className="lg:w-3/4 flex-1 px-6 py-8 min-w-0 min-h-0 overflow-y-auto">
          <p className="text-xs font-bold text-iron-gray tracking-wide mb-1">
            INSTRUCTOR DASHBOARD
          </p>
          <h1 className="text-3xl font-serif font-bold mb-1">Good morning, {instructor.name.split(" ")[0]}.</h1>
          <p className="text-gray-500 mb-8">
            You are teaching {courses.length} course
            {courses.length === 1 ? "" : "s"} this term.
          </p>

          <CourseListSection courses={courses} />
        </div>
      </div>
    </main>
  );
}
