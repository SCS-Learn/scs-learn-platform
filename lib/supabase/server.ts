import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// For use in Server Components and Server Actions. No real session exists yet
// (auth is stubbed), but this follows @supabase/ssr's standard Next.js App
// Router shape so it doesn't need rework once login lands.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no way to set cookies —
            // safe to ignore since there's no session to refresh yet.
          }
        },
      },
    }
  );
}
