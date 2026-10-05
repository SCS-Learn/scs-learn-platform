import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs, both from @supabase/ssr's Next.js recipe:
 *
 * 1. Refresh the learner's Supabase session cookie. Server Components can't
 *    write cookies, so without this an expired access token is never
 *    rotated and the learner gets silently signed out mid-course.
 * 2. Gate learner-only routes. Every learner-keyed row (lesson_completions,
 *    quiz_submissions, lti_results, autolab_scores) is keyed by the signed-in
 *    user's id, and that same id is the LTI user_id Cogniterra creates its
 *    account against - so there is no anonymous fallback to drop through to.
 *
 * Instructor routes are deliberately not gated yet: instructor auth is still
 * the single stub in lib/instructor/data/current-instructor.ts.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser() (not getSession()) revalidates the token with Supabase Auth,
  // so a forged or revoked cookie can't pass the gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { pathname, search } = request.nextUrl;
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/student/:path*", "/api/lti/launch/:path*", "/api/autolab/sync"],
};
