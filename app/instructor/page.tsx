import InstructorHeader from "@/components/instructor/InstructorHeader";
import CourseCard from "@/components/instructor/CourseCard";
import AnnouncementsPanel from "@/components/instructor/AnnouncementsPanel";
import CalendarPanel from "@/components/instructor/CalendarPanel";
import { getVisibleCalendarEvents } from "@/lib/instructor/data/calendar-events";
import { getAnnouncements } from "@/lib/instructor/data/announcements";
import { getInstructorCourseList } from "@/lib/instructor/data/courses";
import { getCurrentInstructor } from "@/lib/instructor/data/current-instructor";

export default async function InstructorDashboardPage() {
  const [calendarEvents, announcements, courses, instructor] = await Promise.all([
    getVisibleCalendarEvents(),
    getAnnouncements(),
    getInstructorCourseList(),
    getCurrentInstructor(),
  ]);

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <InstructorHeader />

      <div className="px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
        <div>
          <p className="text-xs font-bold text-primary tracking-wide mb-1">
            INSTRUCTOR DASHBOARD
          </p>
          <h1 className="text-3xl font-serif font-bold mb-1">Good morning, {instructor.name.split(" ")[0]}.</h1>
          <p className="text-gray-500 mb-8">
            You are teaching {courses.length} course
            {courses.length === 1 ? "" : "s"} this term.
          </p>

          <h2 className="text-sm font-bold mb-3">Your courses</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {courses.map((course) => (
              <CourseCard key={course.code} course={course} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <AnnouncementsPanel courses={courses} announcements={announcements} />
          <CalendarPanel events={calendarEvents} courses={courses} />
        </div>
      </div>
    </main>
  );
}
