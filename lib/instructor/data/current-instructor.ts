import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

export type CurrentInstructor = {
  id: string;
  name: string;
  initials: string;
  email: string | null;
};

type InstructorRow = { id: string; name: string; initials: string; email?: string | null };

/**
 * The instructors row linked to the signed-in user, or null (signed out, or a
 * plain learner). An unlinked row whose email matches the user's is claimed on
 * the spot - that is how access is granted (supabase/migrations/
 * add-instructor-accounts.sql). Runs through the service-role client so the
 * link can't be forged from the browser.
 */
export const getCurrentInstructor = cache(async (): Promise<CurrentInstructor | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const admin = createAdminClient();
  if (!admin) {
    console.error("getCurrentInstructor: SUPABASE_SERVICE_ROLE_KEY is not configured");
    return null;
  }

  const linked = await admin
    .from("instructors")
    .select("id, name, initials, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (linked.data) return toInstructor(linked.data as InstructorRow);

  // 42703 = undefined column: add-instructor-accounts.sql hasn't been run yet,
  // so there's no email to match on. Retry without it before giving up.
  if (linked.error?.code === "42703") {
    const legacy = await admin.from("instructors").select("id, name, initials").eq("auth_user_id", user.id).maybeSingle();
    return legacy.data ? toInstructor(legacy.data as InstructorRow) : null;
  }
  // Only a *confirmed* address may claim an instructor row: with password
  // sign-up, anyone can register an unverified account under a professor's
  // email, and must not inherit their courses by doing so.
  if (!user.email || !user.email_confirmed_at) return null;

  const invited = await admin
    .from("instructors")
    .update({ auth_user_id: user.id })
    .eq("email", user.email.toLowerCase())
    .is("auth_user_id", null)
    .select("id, name, initials, email")
    .maybeSingle();
  return invited.data ? toInstructor(invited.data as InstructorRow) : null;
});

function toInstructor(row: InstructorRow): CurrentInstructor {
  return { id: row.id, name: row.name, initials: row.initials, email: row.email ?? null };
}

/**
 * Gate for every instructor page and server action. Signed out -> the login
 * page (instructor variant); signed in without instructor access -> the page
 * explaining how to get it. Server actions are public endpoints, so each one
 * calls this rather than trusting that only the instructor UI can reach it.
 */
export async function requireInstructor(): Promise<CurrentInstructor> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/instructor");
  const instructor = await getCurrentInstructor();
  if (!instructor) redirect("/instructor-access");
  return instructor;
}

/**
 * Ids of every course this instructor teaches: ones they own
 * (courses.instructor_id) plus ones an admin added them to
 * (course_instructors). Falls back to owned-only until
 * add-admins-and-course-instructors.sql has been run.
 */
export const getTaughtCourseIds = cache(async (instructorId: string): Promise<string[]> => {
  const admin = createAdminClient();
  if (!admin) return [];
  const [owned, staffed] = await Promise.all([
    admin.from("courses").select("id").eq("instructor_id", instructorId),
    admin.from("course_instructors").select("course_id").eq("instructor_id", instructorId),
  ]);
  if (owned.error) throw new Error(owned.error.message);
  // 42P01 = table doesn't exist yet (migration not run): owned courses only.
  if (staffed.error && !["42P01", "PGRST205"].includes(staffed.error.code)) throw new Error(staffed.error.message);
  const ids = new Set((owned.data ?? []).map((r) => r.id as string));
  for (const r of staffed.data ?? []) ids.add(r.course_id as string);
  return [...ids];
});

/** requireInstructor, plus: the course must be one this instructor teaches (owns or was added to). */
export async function requireCourseInstructor(courseCode: string): Promise<CurrentInstructor> {
  const instructor = await requireInstructor();
  const supabase = await createClient();
  const { data, error } = await supabase.from("courses").select("id").eq("code", courseCode).maybeSingle();
  if (error) throw new Error(error.message);
  const taught = await getTaughtCourseIds(instructor.id);
  if (!data || !taught.includes(data.id as string)) throw new Error(`You don't teach ${courseCode}.`);
  return instructor;
}
