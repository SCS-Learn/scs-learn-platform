import { createAdminClient } from "@/lib/supabase/admin";
import { CURRENT_INSTRUCTOR_ID } from "@/lib/instructor/data/current-instructor";

/**
 * Per-instructor Cogniterra OAuth ("Connect Cogniterra"). Cogniterra's public
 * JSON API (lib/cogniterra/client.ts) silently refuses to enumerate a
 * PRIVATE course's sections/lessons when called anonymously - it returns
 * other courses' catalog data instead and the code treats that as "nothing
 * to list". Storing a refresh token from the authorization_code grant lets
 * those same calls run as the instructor's own Cogniterra account, which can
 * see whatever that account can see (e.g. a private course they teach).
 *
 * Deliberately not the client_credentials grant: that authenticates as the
 * *app*, not a person, and still can't see private content the app's own
 * (non-existent) account has no access to.
 */

const OAUTH_BASE_URL = () => (process.env.COGNITERRA_OAUTH_BASE_URL ?? "https://cogniterra.org").replace(/\/+$/, "");

type OAuthEnv = { clientId: string; clientSecret: string; siteUrl: string };

function getOAuthEnv(): OAuthEnv | null {
  const clientId = process.env.COGNITERRA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.COGNITERRA_OAUTH_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientId || !clientSecret || !siteUrl) return null;
  return { clientId, clientSecret, siteUrl };
}

/** Null (rather than throwing) when OAuth isn't configured yet - callers treat that the same as "not connected". */
export function getCogniterraOAuthRedirectUri(): string | null {
  const env = getOAuthEnv();
  if (!env) return null;
  return `${env.siteUrl.replace(/\/$/, "")}/api/cogniterra/oauth/callback`;
}

export function getCogniterraAuthorizeUrl(state: string): string | null {
  const env = getOAuthEnv();
  const redirectUri = getCogniterraOAuthRedirectUri();
  if (!env || !redirectUri) return null;
  const url = new URL(`${OAUTH_BASE_URL()}/oauth2/authorize/`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const env = getOAuthEnv();
  if (!env) throw new Error("Cogniterra OAuth not configured");
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
  const response = await fetch(`${OAUTH_BASE_URL()}/oauth2/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || payload.error || `Cogniterra token request failed (${response.status})`
    );
  }
  return payload;
}

/** Exchanges the authorization code the callback route received for tokens. */
export async function exchangeCogniterraCode(code: string): Promise<TokenResponse> {
  const redirectUri = getCogniterraOAuthRedirectUri();
  if (!redirectUri) throw new Error("Cogniterra OAuth not configured");
  return requestToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

/** Reads the single stub instructor's stored refresh token. Null if never connected or the admin client isn't configured. */
export async function getCogniterraOAuthCredentials(): Promise<{ refreshToken: string } | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("instructor_cogniterra_credentials")
    .select("refresh_token")
    .eq("instructor_id", CURRENT_INSTRUCTOR_ID)
    .maybeSingle();
  if (error || !data) return null;
  return { refreshToken: data.refresh_token as string };
}

/** Upserts the refresh token from the OAuth callback's code exchange (or a later rotation - see getCogniterraAccessToken). */
export async function saveCogniterraOAuthCredentials(refreshToken: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client not configured - set SUPABASE_SERVICE_ROLE_KEY");
  const { error } = await admin.from("instructor_cogniterra_credentials").upsert(
    {
      instructor_id: CURRENT_INSTRUCTOR_ID,
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "instructor_id" }
  );
  if (error) throw new Error(error.message);
}

export async function isCogniterraOAuthConnected(): Promise<boolean> {
  return (await getCogniterraOAuthCredentials()) !== null;
}

/**
 * Returns a live access token for the connected instructor's Cogniterra
 * account, or null if OAuth isn't configured/connected. Cogniterra (running
 * django-oauth-toolkit) rotates the refresh token on every refresh grant -
 * the old one stops working the instant a new one is issued - so the newly
 * returned refresh_token is persisted immediately, before returning the
 * access token, rather than left for the caller to deal with.
 */
export async function getCogniterraAccessToken(): Promise<string | null> {
  const env = getOAuthEnv();
  if (!env) return null;
  const stored = await getCogniterraOAuthCredentials();
  if (!stored) return null;

  try {
    const tokens = await requestToken({ grant_type: "refresh_token", refresh_token: stored.refreshToken });
    if (tokens.refresh_token && tokens.refresh_token !== stored.refreshToken) {
      await saveCogniterraOAuthCredentials(tokens.refresh_token);
    }
    return tokens.access_token;
  } catch (error) {
    console.warn("getCogniterraAccessToken: refresh failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
