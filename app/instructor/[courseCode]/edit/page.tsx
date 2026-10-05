import { notFound } from "next/navigation";
import AppHeader from "@/components/app/AppHeader";
import CourseEditorClient from "@/components/instructor/CourseEditorClient";
import { getCourseWithContent } from "@/lib/instructor/data/courses";

export default async function CourseEditorPage({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}) {
  const { courseCode } = await params;
  const course = await getCourseWithContent(courseCode);

  if (!course) {
    notFound();
  }

  return (
    <CourseEditorClient
      course={course}
      header={<AppHeader mode="teaching" />}
    />
  );
}
