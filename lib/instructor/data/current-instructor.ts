import { createClient } from "@/lib/supabase/server";

// Auth is stubbed for now — there's exactly one acting instructor and no
// login screen. This id matches the seed row in supabase/schema.sql. Swap
// this lookup for a real auth.uid()-derived instructor once login exists.
export const CURRENT_INSTRUCTOR_ID = "00000000-0000-0000-0000-000000000001";

export async function getCurrentInstructor(): Promise<{ name: string; initials: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    .select("name, initials")
    .eq("id", CURRENT_INSTRUCTOR_ID)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Instructor not found");
  return data;
}
