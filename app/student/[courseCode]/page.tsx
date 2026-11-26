import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StudentCourseDashboard from "@/components/student/StudentCourseDashboard";
import { getStudentCourseOutline } from "@/lib/student/data/course";
import { getCourseAnnouncements, getCourseUpcomingEvents } from "@/lib/student/data/course-dashboard";

export default async function StudentCourseDashboardPage({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}) {
  const { courseCode } = await params;
  const [course, announcements, events] = await Promise.all([
    getStudentCourseOutline(courseCode),
    getCourseAnnouncements(courseCode),
    getCourseUpcomingEvents(courseCode),
  ]);

  if (!course) {
    notFound();
  }

  return (
    <StudentCourseDashboard
      course={course}
      announcements={announcements}
      events={events}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}): Promise<Metadata> {
  const { courseCode } = await params;
  return { title: `${courseCode}` };
}
