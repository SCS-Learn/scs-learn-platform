import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect";

/**
 * Where the magic-link email lands. @supabase/ssr uses the PKCE flow, so the
 * link carries a ?code= that's only redeemable alongside the code-verifier
 * cookie set when the link was requested - i.e. the link must be opened in
 * the same browser it was requested from.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "link_invalid");
  loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}
