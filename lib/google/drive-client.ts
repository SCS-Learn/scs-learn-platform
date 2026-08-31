import { google, type drive_v3 } from "googleapis";
import { getOAuthDriveClient } from "@/lib/google/oauth-client";

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseServiceAccountKey(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Three supported auth modes, tried in priority order:
 *  - Google OAuth (instructor-connected): reads whatever the instructor's own
 *    account can already see - no sharing step at all. Highest priority
 *    since it's the most capable and requires the instructor to have
 *    deliberately connected their account.
 *  - Service account: reads folders shared privately with the service
 *    account's own email, and anything shared "Anyone with the link" too.
 *  - Plain API key: only reads folders shared "Anyone with the link" - a key
 *    has no identity of its own to share a private folder with.
 */
export async function getDriveClient(): Promise<drive_v3.Drive> {
  const oauthDrive = await getOAuthDriveClient();
  if (oauthDrive) return oauthDrive;

  const credentials = parseServiceAccountKey();
  if (credentials) {
    const auth = new google.auth.GoogleAuth({ credentials, scopes: [DRIVE_READONLY_SCOPE] });
    return google.drive({ version: "v3", auth });
  }
  return google.drive({ version: "v3", auth: requiredEnv("GOOGLE_API_KEY") });
}

/** Email instructors should share a folder with for private access, if a service account is configured. */
export function getServiceAccountEmail(): string | null {
  const credentials = parseServiceAccountKey();
  const email = credentials?.client_email;
  return typeof email === "string" ? email : null;
}

const FOLDER_URL_PATTERNS = [
  /\/folders\/([a-zA-Z0-9_-]+)/,
  /[?&]id=([a-zA-Z0-9_-]+)/,
];

export type DriveFolderRef = { folderId: string; resourceKey?: string };

/**
 * Accepts a full Drive folder URL (any sharing vintage) or a bare folder id.
 * Older share links carry a "resourcekey=" query param that Drive requires
 * as a request header, not just a URL param - without it, listing that
 * folder's children silently returns empty instead of erroring.
 */
export function parseDriveFolderUrl(input: string): DriveFolderRef {
  const trimmed = input.trim();
  let folderId: string | null = null;
  for (const pattern of FOLDER_URL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      folderId = match[1];
      break;
    }
  }
  if (!folderId && /^[a-zA-Z0-9_-]+$/.test(trimmed)) folderId = trimmed;
  if (!folderId) throw new Error("That doesn't look like a Google Drive folder link");

  const resourceKeyMatch = trimmed.match(/[?&]resourcekey=([^&]+)/i);
  return {
    folderId,
    resourceKey: resourceKeyMatch ? decodeURIComponent(resourceKeyMatch[1]) : undefined,
  };
}
