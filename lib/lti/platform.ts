import { createClient } from "@/lib/supabase/server";
import type { PlatformRegistration } from "@/lib/lti/types";

// Looks up a registered LMS by issuer, optionally narrowed by client_id when a
// single LMS hosts more than one deployment of this tool with different
// registrations. Returns null if no matching row exists - callers should treat
// that as "this platform hasn't been registered yet" rather than an error.
export async function getPlatformByIssuer(
  issuer: string,
  clientId?: string
): Promise<PlatformRegistration | null> {
  const supabase = await createClient();
  let query = supabase.from("lti_platforms").select("*").eq("issuer", issuer);
  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPlatformById(id: string): Promise<PlatformRegistration | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("lti_platforms").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
