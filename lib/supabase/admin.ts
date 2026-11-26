import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role client for tables with no client-reachable RLS policy
 * (credentials, admins, course_instructors) and for identity lookups that
 * must not be forgeable from the browser (instructors.auth_user_id). Bypasses
 * RLS entirely: never expose it to client code, and check who is asking
 * before every use. Returns null when SUPABASE_SERVICE_ROLE_KEY isn't
 * configured, so Google OAuth features degrade to "not connected" instead of
 * throwing at import time. See lib/supabase/service.ts for the throwing variant.
 */
export function createAdminClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  cached = createSupabaseClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cached;
}
