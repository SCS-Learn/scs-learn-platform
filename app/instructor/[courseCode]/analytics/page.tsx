import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AnalyticsClient from "@/components/instructor/AnalyticsClient";
import { getInstructorCourseTitle } from "@/lib/instructor/data/courses";
import AppHeader from "@/components/app/AppHeader";

export default async function CourseAnalyticsPage({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}) {
  const { courseCode } = await params;
  const course = await getInstructorCourseTitle(courseCode);

  if (!course) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader mode="teaching" backHref={`/instructor/${courseCode}`} backLabel="Courseware dashboard" />
      <AnalyticsClient course={course} />
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}): Promise<Metadata> {
  const { courseCode } = await params;
  return { title: `${courseCode} analytics` };
}
