import { NextRequest, NextResponse } from "next/server";
import { exchangeCogniterraCode, saveCogniterraOAuthCredentials } from "@/lib/cogniterra/oauth-client";
import { STATE_COOKIE, RETURN_TO_COOKIE, DEFAULT_RETURN_TO } from "@/lib/cogniterra/oauth-start-state";

const SITE_URL = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Exchanges the authorization code Cogniterra redirected back with for a
 * refresh_token and stores it. Never persists an access_token - every future
 * Cogniterra API call refreshes one from the stored refresh_token on demand
 * (see lib/cogniterra/oauth-client.ts#getCogniterraAccessToken).
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
    const response = NextResponse.redirect(new URL(`${returnTo}${separator}cogniterra=${status}`, SITE_URL()));
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(RETURN_TO_COOKIE);
    return response;
  }

  if (error) return redirectWithStatus("denied");
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithStatus("error");
  }

  try {
    const tokens = await exchangeCogniterraCode(code);
    if (!tokens.refresh_token) {
      return redirectWithStatus("error");
    }
    await saveCogniterraOAuthCredentials(tokens.refresh_token);
  } catch {
    return redirectWithStatus("error");
  }

  return redirectWithStatus("connected");
}
