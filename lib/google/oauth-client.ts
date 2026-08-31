import { google, type drive_v3, type slides_v1 } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { CURRENT_INSTRUCTOR_ID } from "@/lib/instructor/data/current-instructor";

/**
 * Per-instructor Google OAuth ("Connect Google Drive") - lets the app read
 * whatever the instructor's own account can already see, with no folder
 * sharing step, and (drive.file + presentations.readonly) create/render/
 * delete a temporary Slides conversion for true per-slide images. Deliberately
 * narrower than full drive access: drive.file only ever grants reach into
 * files this app itself creates, not the instructor's whole Drive.
 */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/presentations.readonly",
];

type OAuthEnv = { clientId: string; clientSecret: string; siteUrl: string };

function getOAuthEnv(): OAuthEnv | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientId || !clientSecret || !siteUrl) return null;
  return { clientId, clientSecret, siteUrl };
}

/** Returns null (rather than throwing) when OAuth isn't configured yet - callers treat that the same as "not connected". */
export function getOAuthRedirectUri(): string | null {
  const env = getOAuthEnv();
  if (!env) return null;
  return `${env.siteUrl.replace(/\/$/, "")}/api/google/oauth/callback`;
}

export function createOAuth2Client(): InstanceType<typeof google.auth.OAuth2> | null {
  const env = getOAuthEnv();
  if (!env) return null;
  const redirectUri = getOAuthRedirectUri();
  if (!redirectUri) return null;
  return new google.auth.OAuth2(env.clientId, env.clientSecret, redirectUri);
}

type StoredCredential = { refreshToken: string; scope: string };

/** Reads the single stub instructor's stored refresh token via the service-role client. Returns null if OAuth was never connected, or the admin client isn't configured. */
export async function getOAuthCredentials(): Promise<StoredCredential | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("instructor_google_credentials")
    .select("refresh_token, scope")
    .eq("instructor_id", CURRENT_INSTRUCTOR_ID)
    .maybeSingle();
  if (error || !data) return null;
  return { refreshToken: data.refresh_token as string, scope: data.scope as string };
}

/** Upserts the refresh token returned from the OAuth callback's code exchange. Never stores an access token - googleapis refreshes one from the refresh_token on demand each call. */
export async function saveOAuthCredentials(refreshToken: string, scope: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase admin client not configured - set SUPABASE_SERVICE_ROLE_KEY");
  }
  const { error } = await admin.from("instructor_google_credentials").upsert(
    {
      instructor_id: CURRENT_INSTRUCTOR_ID,
      refresh_token: refreshToken,
      scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "instructor_id" }
  );
  if (error) throw new Error(error.message);
}

export async function isGoogleOAuthConnected(): Promise<boolean> {
  return (await getOAuthCredentials()) !== null;
}

async function getAuthorizedOAuth2Client() {
  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) return null;
  const stored = await getOAuthCredentials();
  if (!stored) return null;
  oauth2Client.setCredentials({ refresh_token: stored.refreshToken });
  return oauth2Client;
}

/** Null when OAuth isn't configured or the instructor hasn't connected yet - every caller falls back to the existing service-account/API-key path in that case. */
export async function getOAuthClients(): Promise<{ drive: drive_v3.Drive; slides: slides_v1.Slides } | null> {
  const auth = await getAuthorizedOAuth2Client();
  if (!auth) return null;
  return {
    drive: google.drive({ version: "v3", auth }),
    slides: google.slides({ version: "v1", auth }),
  };
}

export async function getOAuthDriveClient(): Promise<drive_v3.Drive | null> {
  return (await getOAuthClients())?.drive ?? null;
}

export async function getOAuthSlidesClients(): Promise<{ drive: drive_v3.Drive; slides: slides_v1.Slides } | null> {
  return getOAuthClients();
}
