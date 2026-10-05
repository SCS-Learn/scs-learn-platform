import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/instructor/format";
import { isoToday } from "@/lib/instructor/calendar";
import type { Announcement, CalendarEvent, CalendarEventScope, CalendarEventType } from "@/lib/instructor/mock-data";

/** Announcements the course's instructor posted, newest first - what a learner sees on the course dashboard. */
export async function getCourseAnnouncements(courseCode: string, limit = 5): Promise<Announcement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, message, created_at, courses!inner(code), instructors(name, initials)")
    .eq("courses.code", courseCode)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    message: string;
    created_at: string;
    courses: { code: string } | null;
    instructors: { name: string; initials: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    authorName: row.instructors?.name ?? "",
    authorInitials: row.instructors?.initials ?? "",
    courseCode: row.courses?.code ?? courseCode,
    timestamp: formatRelativeTime(row.created_at),
    message: row.message,
  }));
}

/** Today-or-later events for this course plus platform-wide (global) ones, soonest first. */
export async function getCourseUpcomingEvents(courseCode: string, limit = 5): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("code", courseCode)
    .maybeSingle();
  if (courseError) throw new Error(courseError.message);
  if (!course) return [];

  const { data, error } = await supabase
    .from("calendar_events")
    .select(
      "id, date, title, type, time, description, scope, courses(code), instructors!calendar_events_host_instructor_id_fkey(name, initials)"
    )
    .or(`scope.eq.global,course_id.eq.${course.id}`)
    .gte("date", isoToday())
    .order("date", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    date: string;
    title: string;
    type: string;
    time: string;
    description: string;
    scope: string;
    courses: { code: string } | null;
    instructors: { name: string; initials: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    date: row.date,
    title: row.title,
    type: row.type as CalendarEventType,
    time: row.time,
    description: row.description,
    scope: row.scope as CalendarEventScope,
    courseCode: row.courses?.code,
    hostName: row.instructors?.name ?? "",
    hostInitials: row.instructors?.initials ?? "",
  }));
}
