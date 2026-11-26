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
  return requireCourseInstructorFor(courseCode);
}

/**
 * A row an instructor action is about to touch, by id. Server actions take
 * these ids from the browser, so each one is checked against the courses the
 * instructor teaches before it is used (RLS checks the same thing again).
 */
export type CourseScopedRef =
  | { unitId: string }
  | { unitIds: string[] }
  | { lessonId: string }
  | { lessonBlockId: string }
  | { questionGroupId: string }
  | { questionId: string }
  | { attachmentId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireAdminClient() {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return admin;
}

/** Follows one foreign key: the `column` of `table` row `id`, or null if there is no such row. */
async function parentId(table: string, column: string, id: string): Promise<string | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await requireAdminClient().from(table).select(column).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const value = (data as Record<string, unknown> | null)?.[column];
  return typeof value === "string" ? value : null;
}

/** Ids of the courses the referenced rows belong to; null for a row that doesn't exist. */
async function courseIdsOf(ref: CourseScopedRef): Promise<(string | null)[]> {
  if ("unitIds" in ref) {
    const ids = [...new Set(ref.unitIds)];
    if (ids.length === 0) return [];
    if (!ids.every((id) => typeof id === "string" && UUID.test(id))) return [null];
    const { data, error } = await requireAdminClient().from("units").select("id, course_id").in("id", ids);
    if (error) throw new Error(error.message);
    const courseByUnit = new Map((data ?? []).map((row) => [row.id as string, row.course_id as string]));
    return ids.map((id) => courseByUnit.get(id) ?? null);
  }

  const lessonCourse = async (lessonId: string | null) => {
    const unitId = lessonId && (await parentId("lessons", "unit_id", lessonId));
    return unitId ? parentId("units", "course_id", unitId) : null;
  };
  const groupCourse = async (groupId: string | null) =>
    lessonCourse(groupId && (await parentId("question_groups", "lesson_id", groupId)));

  if ("unitId" in ref) return [await parentId("units", "course_id", ref.unitId)];
  if ("lessonId" in ref) return [await lessonCourse(ref.lessonId)];
  if ("lessonBlockId" in ref) return [await lessonCourse(await parentId("lesson_blocks", "lesson_id", ref.lessonBlockId))];
  if ("questionGroupId" in ref) return [await groupCourse(ref.questionGroupId)];
  if ("questionId" in ref) return [await groupCourse(await parentId("questions", "question_group_id", ref.questionId))];
  return [await lessonCourse(await parentId("attachments", "lesson_id", ref.attachmentId))];
}

async function assertRefsIn(allowedCourseIds: string[], refs: CourseScopedRef[]): Promise<void> {
  const courseIds = (await Promise.all(refs.map(courseIdsOf))).flat();
  if (courseIds.some((id) => id === null)) throw new Error("Not found.");
  if (courseIds.some((id) => !allowedCourseIds.includes(id as string))) {
    throw new Error("You don't teach the course this belongs to.");
  }
}

/** requireInstructor, plus: every referenced row belongs to a course this instructor teaches. */
export async function requireInstructorFor(...refs: CourseScopedRef[]): Promise<CurrentInstructor> {
  const instructor = await requireInstructor();
  await assertRefsIn(await getTaughtCourseIds(instructor.id), refs);
  return instructor;
}

/**
 * requireCourseInstructor, plus: every referenced row belongs to that same
 * course. Also returns the course id.
 */
export async function requireCourseInstructorFor(
  courseCode: string,
  ...refs: CourseScopedRef[]
): Promise<CurrentInstructor & { courseId: string }> {
  const instructor = await requireInstructor();
  const supabase = await createClient();
  const { data, error } = await supabase.from("courses").select("id").eq("code", courseCode).maybeSingle();
  if (error) throw new Error(error.message);
  const taught = await getTaughtCourseIds(instructor.id);
  const courseId = data?.id as string | undefined;
  if (!courseId || !taught.includes(courseId)) throw new Error(`You don't teach ${courseCode}.`);
  await assertRefsIn([courseId], refs);
  return { ...instructor, courseId };
}
