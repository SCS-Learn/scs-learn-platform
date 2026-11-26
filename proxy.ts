import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy for the pages that render stored lesson HTML (the
 * student and instructor course views). That HTML is sanitized on the server
 * (lib/html/sanitize-lesson-html.ts); this is the second layer: script runs
 * only if Next.js tagged it with this request's nonce, so markup that gets
 * past the sanitizer still can't execute. Next.js reads the nonce from the
 * request's CSP header and applies it to its own scripts; these pages are
 * dynamically rendered, which nonces require. Styles, images and frames are
 * deliberately left open: lessons embed media from many hosts.
 */
const NONCE_CSP_PAGES = /^\/(student|instructor)(\/|$)/;

function contentSecurityPolicy(nonce: string): string {
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

/**
 * Three jobs. The first two are from @supabase/ssr's Next.js recipe:
 *
 * 1. Refresh the learner's Supabase session cookie. Server Components can't
 *    write cookies, so without this an expired access token is never
 *    rotated and the learner gets silently signed out mid-course.
 * 2. Require a signed-in user on every app route. Learner-keyed rows
 *    (lesson_completions, quiz_submissions, lti_results, autolab_scores) are
 *    keyed by the user's id - the same id Cogniterra creates its account
 *    against - so there is no anonymous fallback. Instructor routes need a
 *    session too; whether that session is an *instructor* is checked one level
 *    down by requireInstructor() (lib/instructor/data/current-instructor.ts),
 *    which every instructor page and server action calls.
 * 3. Set the Content-Security-Policy above on lesson pages.
 */
export async function proxy(request: NextRequest) {
  const csp = NONCE_CSP_PAGES.test(request.nextUrl.pathname)
    ? contentSecurityPolicy(Buffer.from(crypto.randomUUID()).toString("base64"))
    : null;
  // On the request too: that is where Next.js looks for the nonce.
  if (csp) request.headers.set("Content-Security-Policy", csp);

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

  if (csp) response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/student/:path*",
    "/instructor/:path*",
    "/instructor-access",
    "/account/:path*",
    "/dashboard",
    "/admin/:path*",
    "/api/lti/launch/:path*",
    "/api/autolab/sync",
  ],
};
