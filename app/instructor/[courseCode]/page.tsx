import { notFound } from "next/navigation";
import InstructorCourseDashboard from "@/components/instructor/InstructorCourseDashboard";
import { getCourseWithContent } from "@/lib/instructor/data/courses";
import { getCourseActivity } from "@/lib/instructor/data/course-dashboard";
import { getAnnouncements } from "@/lib/instructor/data/announcements";
import { getVisibleCalendarEvents } from "@/lib/instructor/data/calendar-events";

export default async function InstructorCourseDashboardPage({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}) {
  const { courseCode } = await params;
  const [course, announcements, events] = await Promise.all([
    getCourseWithContent(courseCode),
    getAnnouncements(),
    getVisibleCalendarEvents(),
  ]);

  if (!course) {
    notFound();
  }

  const activity = await getCourseActivity(course);

  return (
    <InstructorCourseDashboard
      course={course}
      activity={activity}
      announcements={announcements.filter((a) => a.courseCode === course.code)}
      events={events.filter((e) => e.scope === "global" || e.courseCode === course.code)}
    />
  );
}
