import { createBrowserClient } from "@supabase/ssr";

// For direct browser use — currently unused until the file-uploads slice
// needs to upload straight to Supabase Storage from the client.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
