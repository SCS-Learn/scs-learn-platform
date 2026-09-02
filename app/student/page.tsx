import Link from "next/link";
import StudentHeader from "@/components/student/StudentHeader";
import { listStudentCourses } from "@/lib/student/data/course";

export default async function StudentDashboardPage() {
  const courses = await listStudentCourses();

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <StudentHeader />

      <div className="px-6 py-8">
        <p className="text-xs font-bold text-primary tracking-wide mb-1">MY COURSES</p>
        <h1 className="text-3xl font-serif font-bold mb-6">Pick up where you left off.</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          {courses.map((course) => (
            <Link
              key={course.code}
              href={`/student/${course.code}`}
              className="border border-gray-200 rounded-md bg-white p-5 hover:border-primary/50 hover:shadow-sm transition"
            >
              <p className="text-xs font-bold text-primary tracking-wide mb-1">{course.code}</p>
              <p className="text-base font-bold mb-1">{course.title}</p>
              <p className="text-sm text-gray-500">
                {course.department} &middot; {course.track}
              </p>
            </Link>
          ))}
          {courses.length === 0 && <p className="text-sm text-gray-400">No courses available yet.</p>}
        </div>
      </div>
    </main>
  );
}
