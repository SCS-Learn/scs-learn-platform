import { notFound } from "next/navigation";
import CourseEditorClient from "@/components/instructor/CourseEditorClient";
import { instructorCourses } from "@/lib/instructor/mock-data";

export default async function CourseEditorPage({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}) {
  const { courseCode } = await params;

  if (!instructorCourses.some((c) => c.code === courseCode)) {
    notFound();
  }

  return <CourseEditorClient courseCode={courseCode} />;
}
