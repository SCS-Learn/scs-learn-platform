import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS, so it must never be imported into
// anything that ships to the browser.
//
// Most code talks to Supabase as the signed-in user (lib/supabase/server.ts),
// and RLS decides what that user may read and write. This client is for the
// rest, always after the calling code has checked who is asking:
// - tables with no client-reachable policy (lti_tools and its shared secrets,
//   lti_platforms, credentials tables);
// - quiz questions for learners, which carry answer keys (stripped before
//   they reach the browser);
// - learner writes (quiz submissions and responses, lesson completions), made
//   only after the server has graded the attempt or checked the threshold.
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
