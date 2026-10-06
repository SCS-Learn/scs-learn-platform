import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect";

/**
 * Landing route for auth emails that use Supabase's token_hash templates
 * (sign-up confirmation, sign-in link, password reset - see docs/auth.md).
 * Unlike the PKCE ?code= links handled by /auth/callback, verifying a
 * token_hash needs nothing stored in the browser, so these links work even
 * when opened on a different device or browser than the one that asked.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      // A password-reset link always lands on the "choose a new password" page.
      const destination = type === "recovery" ? "/account/password" : next;
      return NextResponse.redirect(new URL(destination, origin));
    }
    console.error("auth/confirm:", error.code ?? error.status, error.message);
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "link_invalid");
  loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}
