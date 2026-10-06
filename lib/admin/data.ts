import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/session";

export type AdminInstructor = {
  id: string;
  name: string;
  initials: string;
  email: string | null;
  /** Has signed in and been linked to an account. */
  linked: boolean;
  courseCount: number;
};

export type AdminCourse = {
  id: string;
  code: string;
  title: string;
  ownerId: string;
  staffIds: string[];
};

export type AdminOverview = {
  instructors: AdminInstructor[];
  courses: AdminCourse[];
  admins: { email: string; createdAt: string }[];
  /** False until add-admins-and-course-instructors.sql has been run. */
  migrated: boolean;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  await requireAdmin();
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  const [instructors, courses, staff, admins] = await Promise.all([
    admin.from("instructors").select("id, name, initials, email, auth_user_id").order("name"),
    admin.from("courses").select("id, code, title, instructor_id").order("code"),
    admin.from("course_instructors").select("course_id, instructor_id"),
    admin.from("admins").select("email, created_at").order("email"),
  ]);
  for (const r of [instructors, courses]) if (r.error) throw new Error(r.error.message);
  const migrated = !staff.error && !admins.error;

  const staffByCourse = new Map<string, Set<string>>();
  for (const c of courses.data ?? []) staffByCourse.set(c.id, new Set([c.instructor_id as string]));
  for (const s of staff.data ?? []) staffByCourse.get(s.course_id as string)?.add(s.instructor_id as string);

  const courseCountByInstructor = new Map<string, number>();
  for (const ids of staffByCourse.values()) {
    for (const id of ids) courseCountByInstructor.set(id, (courseCountByInstructor.get(id) ?? 0) + 1);
  }

  return {
    migrated,
    instructors: (instructors.data ?? []).map((i) => ({
      id: i.id as string,
      name: i.name as string,
      initials: i.initials as string,
      email: (i.email as string | null) ?? null,
      linked: Boolean(i.auth_user_id),
      courseCount: courseCountByInstructor.get(i.id as string) ?? 0,
    })),
    courses: (courses.data ?? []).map((c) => ({
      id: c.id as string,
      code: c.code as string,
      title: c.title as string,
      ownerId: c.instructor_id as string,
      staffIds: [...(staffByCourse.get(c.id as string) ?? [])],
    })),
    admins: (admins.data ?? []).map((a) => ({ email: a.email as string, createdAt: a.created_at as string })),
  };
}
