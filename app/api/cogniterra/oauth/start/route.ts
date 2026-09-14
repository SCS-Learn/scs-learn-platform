import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCogniterraAuthorizeUrl } from "@/lib/cogniterra/oauth-client";
import { STATE_COOKIE, RETURN_TO_COOKIE, DEFAULT_RETURN_TO } from "@/lib/cogniterra/oauth-start-state";

const SITE_URL = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Kicks off the "Connect Cogniterra" flow: redirects to Cogniterra's own
 * login/consent screen. state is a CSRF check the callback route verifies
 * against this same short-lived cookie; return_to (the page the instructor
 * clicked "Connect" from) rides along in its own cookie so the callback can
 * send them back to the same course editor instead of a generic dashboard.
 */
export async function GET(request: NextRequest) {
  const returnTo = new URL(request.url).searchParams.get("return_to") || DEFAULT_RETURN_TO;

  const state = randomUUID();
  const authUrl = getCogniterraAuthorizeUrl(state);
  if (!authUrl) {
    return NextResponse.redirect(new URL(`${returnTo}?cogniterra=not_configured`, SITE_URL()));
  }

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
