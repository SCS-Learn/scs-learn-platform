import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role client - the only thing allowed to touch a table with no
 * client-reachable RLS policy (instructor_google_credentials holds a real
 * third-party secret, unlike the rest of this stub-auth schema, which uses a
 * permissive "using (true)" policy everywhere). Bypasses RLS entirely - never
 * expose this to client code or use it for anything else. Returns null when
 * SUPABASE_SERVICE_ROLE_KEY isn't configured, so Google OAuth features
 * degrade to "not connected" instead of throwing at import time.
 */
export function createAdminClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  cached = createSupabaseClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cached;
}
