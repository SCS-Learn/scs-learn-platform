"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/session";
import { initialsFor } from "@/lib/auth/session";

export type AdminActionState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function db() {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return admin;
}

function done(message: string): AdminActionState {
  revalidatePath("/admin");
  revalidatePath("/instructor", "layout");
  return { status: "ok", message };
}

/** Grant instructor access: they get it the first time they sign in with this (confirmed) email. */
export async function addInstructor(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!name) return { status: "error", message: "Enter the instructor's name." };
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Enter a valid email address." };

  const { error } = await db().from("instructors").insert({ name, initials: initialsFor(name), email });
  if (error) {
    if (error.code === "23505") return { status: "error", message: `${email} is already an instructor.` };
    if (error.code === "42703") return { status: "error", message: "Run supabase/migrations/add-admins-and-course-instructors.sql first." };
    return { status: "error", message: error.message };
  }
  return done(`Added ${name}. They get instructor access when they sign in with ${email}.`);
}

/**
 * Remove an instructor. Someone who still owns courses is only *revoked*
 * (email and account link cleared, so they lose access but their courses stay
 * put); someone who owns nothing is deleted outright.
 */
export async function removeInstructor(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("instructorId") ?? "");
  const admin = db();
  const { count } = await admin.from("courses").select("id", { count: "exact", head: true }).eq("instructor_id", id);
  if ((count ?? 0) > 0) {
    const { error } = await admin.from("instructors").update({ email: null, auth_user_id: null }).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("instructors").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
  done("");
}

/** Put an instructor on a course's staff. */
export async function addCourseInstructor(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const courseId = String(formData.get("courseId") ?? "");
  const instructorId = String(formData.get("instructorId") ?? "");
  if (!courseId || !instructorId) return { status: "error", message: "Pick an instructor." };
  const { error } = await db().from("course_instructors").insert({ course_id: courseId, instructor_id: instructorId });
  if (error) {
    if (error.code === "23505") return { status: "error", message: "They already teach this course." };
    if (["42P01", "PGRST205"].includes(error.code)) return { status: "error", message: "Run supabase/migrations/add-admins-and-course-instructors.sql first." };
    return { status: "error", message: error.message };
  }
  return done("Instructor added to the course.");
}

/** Take an instructor off a course's staff. The owner can't be removed (they'd keep access through ownership anyway). */
export async function removeCourseInstructor(formData: FormData): Promise<void> {
  await requireAdmin();
  const courseId = String(formData.get("courseId") ?? "");
  const instructorId = String(formData.get("instructorId") ?? "");
  const admin = db();
  const { data: course } = await admin.from("courses").select("instructor_id").eq("id", courseId).maybeSingle();
  if (course?.instructor_id === instructorId) throw new Error("The course owner can't be removed from their own course.");
  const { error } = await admin
    .from("course_instructors")
    .delete()
    .eq("course_id", courseId)
    .eq("instructor_id", instructorId);
  if (error) throw new Error(error.message);
  done("");
}

export async function addAdmin(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Enter a valid email address." };
  const { error } = await db().from("admins").insert({ email });
  if (error) {
    if (error.code === "23505") return { status: "error", message: `${email} is already an admin.` };
    return { status: "error", message: error.message };
  }
  return done(`${email} is now an admin (once they sign in with a confirmed email).`);
}

export async function removeAdmin(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email === me.email) throw new Error("You can't remove yourself - ask another admin.");
  const { error } = await db().from("admins").delete().eq("email", email);
  if (error) throw new Error(error.message);
  done("");
}
