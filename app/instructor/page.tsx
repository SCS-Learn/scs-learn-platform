import CourseCard from "@/components/instructor/CourseCard";
import AnnouncementsPanel from "@/components/instructor/AnnouncementsPanel";
import { instructorName, instructorCourses } from "@/lib/instructor/mock-data";

export default function InstructorDashboardPage() {
  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <div className="w-[60%] mx-auto px-6 py-10">
        <p className="text-xs font-bold text-primary tracking-wide mb-1">
          INSTRUCTOR DASHBOARD
        </p>
        <h1 className="text-3xl font-serif font-bold mb-1">
          Good morning, {instructorName.split(" ")[0]}.
        </h1>
        <p className="text-gray-500 mb-8">
          You are teaching {instructorCourses.length} course
          {instructorCourses.length === 1 ? "" : "s"} this term.
        </p>
        <h2 className="text-sm font-bold mb-3">Your courses</h2>
        <div className="grid grid-cols-2 gap-4 mb-8">
          {instructorCourses.map((course) => (
            <CourseCard key={course.code} course={course} />
          ))}
        </div>
        <AnnouncementsPanel courses={instructorCourses} />
      </div>
    </main>
  );
}
