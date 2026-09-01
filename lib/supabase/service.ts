import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS, so it must never be imported into
// anything that ships to the browser.
//
// Everything else in this project talks to Supabase with the anon key, which
// is fine while the stub-auth policies are permissive. The LTI tables are the
// exception: lti_tools holds shared secrets and has no RLS policy at all, so
// the anon key cannot see it by design. Only this client can.
//
// SUPABASE_SERVICE_ROLE_KEY is deliberately not NEXT_PUBLIC_.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "LTI needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
        "Copy the service_role key from Supabase Dashboard > Project Settings > API."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
