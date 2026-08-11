import { notFound } from "next/navigation";
import AnalyticsClient from "@/components/instructor/AnalyticsClient";
import { getCourseWithContent } from "@/lib/instructor/data/courses";

export default async function CourseAnalyticsPage({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}) {
  const { courseCode } = await params;
  const course = await getCourseWithContent(courseCode);

  if (!course) {
    notFound();
  }

  return <AnalyticsClient course={course} />;
}
