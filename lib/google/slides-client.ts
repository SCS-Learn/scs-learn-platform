import { google, type drive_v3, type slides_v1 } from "googleapis";
import { getOAuthClients } from "@/lib/google/oauth-client";

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const PRESENTATIONS_READONLY_SCOPE = "https://www.googleapis.com/auth/presentations.readonly";

function parseServiceAccountKey(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Slides API client for pixel-accurate thumbnail rendering. Tries instructor
 * OAuth first, then a service account (folder must be shared with it).
 * Returns null with only a plain API key — Slides thumbnails require identity.
 */
export async function getSlidesClients(): Promise<{ drive: drive_v3.Drive; slides: slides_v1.Slides } | null> {
  const oauth = await getOAuthClients();
  if (oauth) return oauth;

  const credentials = parseServiceAccountKey();
  if (!credentials) return null;

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [DRIVE_READONLY_SCOPE, PRESENTATIONS_READONLY_SCOPE],
  });

  return {
    drive: google.drive({ version: "v3", auth }),
    slides: google.slides({ version: "v1", auth }),
  };
}

export const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";
