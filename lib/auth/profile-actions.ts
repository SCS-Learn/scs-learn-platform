"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser, initialsFor } from "@/lib/auth/session";
import { getCurrentInstructor } from "@/lib/instructor/data/current-instructor";

export type ProfileState = { status: "idle" } | { status: "saved" } | { status: "error"; message: string };

const MAX_NAME_LENGTH = 80;

/**
 * Display name for /account. It is the name Cogniterra and the instructor's
 * learner table show (user_metadata.full_name), and for an instructor it is
 * also written to their instructors row, which announcements and the
 * dashboard greeting read.
 */
export async function updateProfileName(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");

  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { status: "error", message: "Enter your name." };
  if (name.length > MAX_NAME_LENGTH) return { status: "error", message: `Keep it under ${MAX_NAME_LENGTH} characters.` };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
  if (error) return { status: "error", message: error.message };

  const instructor = await getCurrentInstructor();
  if (instructor) {
    const admin = createAdminClient();
    const { error: instructorError } = admin
      ? await admin.from("instructors").update({ name, initials: initialsFor(name) }).eq("id", instructor.id)
      : { error: { message: "SUPABASE_SERVICE_ROLE_KEY is not configured" } };
    if (instructorError) return { status: "error", message: instructorError.message };
  }

  revalidatePath("/", "layout");
  return { status: "saved" };
}

/**
 * `next dev` only: link the signed-in account to one of the seeded, still
 * unclaimed instructors rows, so local development isn't locked out of the
 * instructor pages before add-instructor-accounts.sql has an email filled in.
 * Never available in a production build.
 */
export async function claimInstructorForDev(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV !== "development") throw new Error("Not available");
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/instructor");
  const instructorId = String(formData.get("instructorId") ?? "");
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  const { error } = await admin
    .from("instructors")
    .update({ auth_user_id: user.id })
    .eq("id", instructorId)
    .is("auth_user_id", null);
  if (error) throw new Error(error.message);
  redirect("/instructor");
}
