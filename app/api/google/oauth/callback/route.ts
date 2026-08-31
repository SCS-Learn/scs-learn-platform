import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, saveOAuthCredentials, GOOGLE_OAUTH_SCOPES } from "@/lib/google/oauth-client";
import { STATE_COOKIE, RETURN_TO_COOKIE, DEFAULT_RETURN_TO } from "@/lib/google/oauth-start-state";

const SITE_URL = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Exchanges the authorization code Google redirected back with for a
 * refresh_token and stores it. Never persists an access_token - every future
 * Drive/Slides call refreshes one from the stored refresh_token on demand
 * (see lib/google/oauth-client.ts), so there's nothing else to keep in sync.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const returnTo = request.cookies.get(RETURN_TO_COOKIE)?.value || DEFAULT_RETURN_TO;

  function redirectWithStatus(status: string) {
    const separator = returnTo.includes("?") ? "&" : "?";
    const response = NextResponse.redirect(new URL(`${returnTo}${separator}google=${status}`, SITE_URL()));
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(RETURN_TO_COOKIE);
    return response;
  }

  if (error) return redirectWithStatus("denied");
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithStatus("error");
  }

  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) return redirectWithStatus("not_configured");

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      // No refresh_token means Google didn't treat this as a fresh consent
      // (shouldn't happen given prompt=consent on the start route, but fail
      // loud rather than silently storing nothing to read from later).
      return redirectWithStatus("error");
    }
    await saveOAuthCredentials(tokens.refresh_token, tokens.scope ?? GOOGLE_OAUTH_SCOPES.join(" "));
  } catch {
    return redirectWithStatus("error");
  }

  return redirectWithStatus("connected");
}
