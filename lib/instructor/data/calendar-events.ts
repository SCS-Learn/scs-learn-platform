"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getTaughtCourseIds,
  requireCourseInstructorFor,
  requireInstructor,
} from "@/lib/instructor/data/current-instructor";
import type { CalendarEvent, CalendarEventScope, CalendarEventType } from "@/lib/instructor/mock-data";

type CalendarEventRow = {
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

function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
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
  };
}

// Only events for courses this instructor teaches, plus global events —
// never another instructor's course-specific events. Computed server-side
// instead of the old client-side `.filter()`.
export async function getVisibleCalendarEvents(): Promise<CalendarEvent[]> {
  const { id: instructorId } = await requireInstructor();
  const supabase = await createClient();

  const ownCourseIds = await getTaughtCourseIds(instructorId);
  const orFilter =
    ownCourseIds.length > 0
      ? `scope.eq.global,course_id.in.(${ownCourseIds.join(",")})`
      : "scope.eq.global";

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, date, title, type, time, description, scope, courses(code), instructors!calendar_events_host_instructor_id_fkey(name, initials)")
    .or(orFilter)
    .order("date", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => toCalendarEvent(row as unknown as CalendarEventRow));
}

export async function addCalendarEvent(input: {
  date: string;
  title: string;
  type: CalendarEventType;
  time: string;
  description: string;
  scope: CalendarEventScope;
  courseCode?: string;
}) {
  let instructorId: string;
  let courseId: string | null = null;
  if (input.scope === "course") {
    if (!input.courseCode) throw new Error("A courseware code is required for this event.");
    // Course events only in courses this instructor teaches.
    ({ id: instructorId, courseId } = await requireCourseInstructorFor(input.courseCode));
  } else {
    ({ id: instructorId } = await requireInstructor());
  }
  const supabase = await createClient();

  const { error } = await supabase.from("calendar_events").insert({
    date: input.date,
    title: input.title,
    type: input.type,
    time: input.time,
    description: input.description,
    scope: input.scope,
    course_id: courseId,
    host_instructor_id: instructorId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/instructor", "layout");
  revalidatePath("/student", "layout");
}

export async function deleteCalendarEvent(id: string) {
  const { id: instructorId } = await requireInstructor();
  const supabase = await createClient();
  // The host may remove their event; course staff may remove events in their course.
  const { data: event, error: lookupError } = await supabase
    .from("calendar_events")
    .select("host_instructor_id, course_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!event) throw new Error("Event not found.");
  const isHost = event.host_instructor_id === instructorId;
  const teachesCourse =
    event.course_id !== null && (await getTaughtCourseIds(instructorId)).includes(event.course_id as string);
  if (!isHost && !teachesCourse) throw new Error("You can't remove this event.");

  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/instructor", "layout");
  revalidatePath("/student", "layout");
}
