import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InstructorCourseDashboard from "@/components/instructor/InstructorCourseDashboard";
import { getInstructorCourseOutline } from "@/lib/instructor/data/courses";
import { getCourseActivity } from "@/lib/instructor/data/course-dashboard";
import { getAnnouncements } from "@/lib/instructor/data/announcements";
import { getVisibleCalendarEvents } from "@/lib/instructor/data/calendar-events";

export default async function InstructorCourseDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseCode: string }>;
  searchParams: Promise<{ learnersPage?: string | string[] }>;
}) {
  const { courseCode } = await params;
  const { learnersPage } = await searchParams;
  const requestedPage = typeof learnersPage === "string" ? Number(learnersPage) : 1;
  const page = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 2_147_483_647
    ? requestedPage
    : 1;
  const course = await getInstructorCourseOutline(courseCode);

  if (!course) {
    notFound();
  }

  const [activity, announcements, events] = await Promise.all([
    getCourseActivity(course.id, page),
    getAnnouncements(course.id),
    getVisibleCalendarEvents(course.id),
  ]);

  return (
    <InstructorCourseDashboard
      course={course}
      activity={activity}
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
  return { title: `${courseCode} dashboard` };
}
