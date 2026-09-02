import { notFound } from "next/navigation";
import StudentCourseClient from "@/components/student/StudentCourseClient";
import { getStudentCourse } from "@/lib/student/data/course";

export default async function StudentCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseCode: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const { courseCode } = await params;
  const { lesson } = await searchParams;
  const course = await getStudentCourse(courseCode);

  if (!course) {
    notFound();
  }

  return <StudentCourseClient course={course} initialLessonId={lesson} />;
}
