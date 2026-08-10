import { createBrowserClient } from "@supabase/ssr";

// For direct browser use — Storage uploads (see lib/instructor/upload.ts)
// go straight from the client instead of through a Server Action, since
// Server Actions have a small default body-size limit.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
