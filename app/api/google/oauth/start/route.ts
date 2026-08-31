import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, GOOGLE_OAUTH_SCOPES } from "@/lib/google/oauth-client";
import { STATE_COOKIE, RETURN_TO_COOKIE, DEFAULT_RETURN_TO } from "@/lib/google/oauth-start-state";

const SITE_URL = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Kicks off the "Connect Google Drive" flow: redirects to Google's consent
 * screen. access_type "offline" + prompt "consent" so a refresh_token comes
 * back even on a reconnect (Google only issues one on the *first* consent
 * otherwise). prompt also includes "select_account" so Google always shows
 * the account chooser instead of silently reusing whichever Google account
 * is already signed into the browser - without it, reconnecting with a
 * different account than last time is easy to get wrong. state is a CSRF
 * check the callback route verifies against this same short-lived cookie;
 * return_to (the page the instructor clicked "Connect" from) rides along in
 * its own cookie so the callback can send them back to the same course
 * editor instead of a generic dashboard.
 */
export async function GET(request: NextRequest) {
  const returnTo = new URL(request.url).searchParams.get("return_to") || DEFAULT_RETURN_TO;

  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    return NextResponse.redirect(new URL(`${returnTo}?google=not_configured`, SITE_URL()));
  }

  const state = randomUUID();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account consent",
    scope: GOOGLE_OAUTH_SCOPES,
    state,
  });

  const response = NextResponse.redirect(authUrl);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 10 * 60,
    path: "/",
  };
  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(RETURN_TO_COOKIE, returnTo, cookieOptions);
  return response;
}
