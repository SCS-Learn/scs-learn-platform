"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTaughtCourseIds, requireCourseInstructor, requireInstructor } from "@/lib/instructor/data/current-instructor";
import { formatRelativeTime } from "@/lib/instructor/format";
import type { Announcement } from "@/lib/instructor/mock-data";

type AnnouncementRow = {
  id: string;
  message: string;
  created_at: string;
  courses: { code: string } | null;
  instructors: { name: string; initials: string } | null;
};

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    authorName: row.instructors?.name ?? "",
    authorInitials: row.instructors?.initials ?? "",
    courseCode: row.courses?.code ?? "",
    timestamp: formatRelativeTime(row.created_at),
    message: row.message,
  };
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const { id: instructorId } = await requireInstructor();
  const supabase = await createClient();

  const ownCourseIds = await getTaughtCourseIds(instructorId);
  if (ownCourseIds.length === 0) return [];

  const { data, error } = await supabase
    .from("announcements")
    .select("id, message, created_at, courses(code), instructors(name, initials)")
    .in("course_id", ownCourseIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => toAnnouncement(row as unknown as AnnouncementRow));
}

export async function postAnnouncement(input: { courseCode: string; message: string }) {
  const { id: instructorId } = await requireCourseInstructor(input.courseCode);
  const supabase = await createClient();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("code", input.courseCode)
    .single();
  if (courseError || !course) throw new Error("Unknown courseware code");

  const { error } = await supabase.from("announcements").insert({
    course_id: course.id,
    instructor_id: instructorId,
    message: input.message,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/instructor", "layout");
  revalidatePath("/student", "layout");
}

export async function deleteAnnouncement(id: string) {
  const { id: instructorId } = await requireInstructor();
  const supabase = await createClient();
  // Course staff may remove any announcement in a course they teach.
  const { data: announcement, error: lookupError } = await supabase
    .from("announcements")
    .select("course_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!announcement) throw new Error("Announcement not found.");
  const taught = await getTaughtCourseIds(instructorId);
  if (!taught.includes(announcement.course_id as string)) {
    throw new Error("You don't teach the course this announcement belongs to.");
  }

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/instructor", "layout");
  revalidatePath("/student", "layout");
}
