"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_INSTRUCTOR_ID } from "@/lib/instructor/data/current-instructor";
import type { Announcement } from "@/lib/instructor/mock-data";

type AnnouncementRow = {
  id: string;
  message: string;
  created_at: string;
  courses: { code: string } | null;
  instructors: { name: string; initials: string } | null;
};

function formatRelativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

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
  const supabase = await createClient();

  const { data: ownCourses, error: coursesError } = await supabase
    .from("courses")
    .select("id")
    .eq("instructor_id", CURRENT_INSTRUCTOR_ID);
  if (coursesError) throw new Error(coursesError.message);

  const ownCourseIds = (ownCourses ?? []).map((c) => c.id);
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
  const supabase = await createClient();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("code", input.courseCode)
    .single();
  if (courseError || !course) throw new Error("Unknown course code");

  const { error } = await supabase.from("announcements").insert({
    course_id: course.id,
    instructor_id: CURRENT_INSTRUCTOR_ID,
    message: input.message,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/instructor");
}

export async function deleteAnnouncement(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/instructor");
}
