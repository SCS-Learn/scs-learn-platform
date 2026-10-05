import { notFound } from "next/navigation";
import AnalyticsClient from "@/components/instructor/AnalyticsClient";
import { getCourseWithContent } from "@/lib/instructor/data/courses";
import AppHeader from "@/components/app/AppHeader";

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

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader mode="teaching" backHref={`/instructor/${courseCode}`} backLabel="Course dashboard" />
      <AnalyticsClient course={course} />
    </main>
  );
}
