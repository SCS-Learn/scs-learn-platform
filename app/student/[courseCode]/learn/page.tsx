import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StudentCourseClient from "@/components/student/StudentCourseClient";
import { getStudentCourseForLearning } from "@/lib/student/data/course";
import AppHeader from "@/components/app/AppHeader";

export default async function StudentCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseCode: string }>;
  searchParams: Promise<{ lesson?: string | string[] }>;
}) {
  const { courseCode } = await params;
  const { lesson } = await searchParams;
  const result = await getStudentCourseForLearning(courseCode, typeof lesson === "string" ? lesson : undefined);

  if (!result) {
    notFound();
  }

  const { course, lesson: initialLesson } = result;

  return (
    <StudentCourseClient
      key={course.code}
      course={course}
      initialLesson={initialLesson}
      header={<AppHeader mode="learning" />}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}): Promise<Metadata> {
  const { courseCode } = await params;
  return { title: `Learn ${courseCode}` };
}
