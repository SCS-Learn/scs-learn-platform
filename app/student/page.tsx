import StudentHeader from "@/components/student/StudentHeader";
import StudentCourseCard from "@/components/student/StudentCourseCard";
import { listStudentCourses } from "@/lib/student/data/course";

export default async function StudentDashboardPage() {
  const courses = await listStudentCourses();

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <StudentHeader />

      <div className="px-6 py-8">
        <p className="text-xs font-bold text-primary tracking-wide mb-1">MY COURSES</p>
        <h1 className="text-3xl font-serif font-bold mb-6">Pick up where you left off.</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
          {courses.map((course) => (
            <StudentCourseCard key={course.code} course={course} />
          ))}
          {courses.length === 0 && <p className="text-sm text-gray-400">No courses available yet.</p>}
        </div>
      </div>
    </main>
  );
}
