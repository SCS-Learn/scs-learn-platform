import { notFound } from "next/navigation";
import StudentCourseDashboard from "@/components/student/StudentCourseDashboard";
import { getStudentCourse } from "@/lib/student/data/course";
import { getCourseAnnouncements, getCourseUpcomingEvents } from "@/lib/student/data/course-dashboard";
import { getLaunchingUser } from "@/lib/lti/config";

export default async function StudentCourseDashboardPage({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}) {
  const { courseCode } = await params;
  const [course, learner, announcements, events] = await Promise.all([
    getStudentCourse(courseCode),
    getLaunchingUser(),
    getCourseAnnouncements(courseCode),
    getCourseUpcomingEvents(courseCode),
  ]);

  if (!course) {
    notFound();
  }

  return (
    <StudentCourseDashboard
      course={course}
      learnerName={learner.name}
      announcements={announcements}
      events={events}
    />
  );
}
