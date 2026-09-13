import { google } from "googleapis";

function requiredApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_API_KEY is not configured — it's required to read YouTube playlists/channels.");
  }
  return key;
}

export function getYoutubeClient() {
  return google.youtube({ version: "v3", auth: requiredApiKey() });
}

function errorStatus(error: unknown): number | undefined {
  const err = error as { code?: number; status?: number; response?: { status?: number } };
  return err?.response?.status ?? err?.code ?? err?.status;
}

/** Pulls the actual reason/message out of a Google API error body, when present (e.g. "keyInvalid", "accessNotConfigured", "quotaExceeded", "ipRefererBlocked"). */
function googleApiErrorDetail(error: unknown): string | null {
  const err = error as {
    response?: { data?: { error?: { message?: string; errors?: { reason?: string; message?: string }[] } } };
    errors?: { reason?: string; message?: string }[];
  };
  const apiError = err?.response?.data?.error;
  const reason = apiError?.errors?.[0]?.reason ?? err?.errors?.[0]?.reason;
  const message = apiError?.message ?? err?.errors?.[0]?.message;
  if (!message && !reason) return null;
  return [message, reason ? `reason: ${reason}` : null].filter(Boolean).join(" — ");
}

/** Maps a YouTube Data API error to an instructor-facing message; rethrows anything else unchanged. */
export function toYoutubeApiError(error: unknown, notFoundMessage: string): Error {
  const status = errorStatus(error);
  const detail = googleApiErrorDetail(error);
  if (status === 403) {
    return new Error(
      `YouTube API request was refused (403)${detail ? `: ${detail}` : ""} — if the YouTube Data API v3 is already enabled on the project, check the API key's "API restrictions" and "Application restrictions" in Google Cloud Console (Credentials → your key). An HTTP-referrer application restriction blocks server-side calls outright, and an API restriction list that doesn't include YouTube Data API v3 will 403 even when the API is enabled project-wide.`
    );
  }
  if (status === 404) {
    return new Error(notFoundMessage);
  }
  return error instanceof Error ? error : new Error(notFoundMessage);
}
