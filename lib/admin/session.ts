import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin = signed-in user whose *confirmed* email is in public.admins
 * (supabase/migrations/add-admins-and-course-instructors.sql). Confirmation
 * matters: otherwise anyone could sign up unverified under an admin's address.
 * Checked through the service-role client; false until the migration has run.
 */
export const getIsAdmin = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user?.email || !user.email_confirmed_at) return false;
  const admin = createAdminClient();
  if (!admin) return false;
  const { data, error } = await admin.from("admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
  if (error) {
    if (!["42P01", "PGRST205"].includes(error.code)) console.error("getIsAdmin:", error.message);
    return false;
  }
  return Boolean(data);
});

/** Gate for /admin and every admin server action. */
export async function requireAdmin(): Promise<{ email: string }> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await getIsAdmin())) redirect("/dashboard");
  return { email: user.email!.toLowerCase() };
}
