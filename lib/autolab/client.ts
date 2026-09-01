import { createServiceClient } from "@/lib/supabase/service";

// Autolab REST API client.
//
// This exists because Autolab's LTI support is roster sync only, with no grade
// services, so LTI cannot deliver an Autolab score to SCS Learn. The REST API
// can: GET /api/v1/courses/:course/assessments/:assessment/scores/:email.
//
// Auth is OAuth2 authorization_code (the only grant flow Autolab enables) with
// rotating refresh tokens. See docs/lti.md for the one-time bootstrap.

const TOKEN_REFRESH_SKEW_SECONDS = 120;

export type AutolabCredentials = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
};

export class AutolabNotConfiguredError extends Error {}
export class AutolabAuthError extends Error {}

async function loadCredentials(): Promise<AutolabCredentials> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("autolab_credentials")
    .select("base_url, client_id, client_secret, access_token, refresh_token, access_token_expires_at")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new AutolabNotConfiguredError(
      "No Autolab credentials row. Insert one into autolab_credentials and run the OAuth bootstrap in docs/lti.md."
    );
  }

  return {
    baseUrl: data.base_url.replace(/\/+$/, ""),
    clientId: data.client_id,
    clientSecret: data.client_secret,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: data.access_token_expires_at,
  };
}

async function persistTokens(tokens: {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}): Promise<void> {
  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
  const { error } = await supabase
    .from("autolab_credentials")
    .update({
      access_token: tokens.accessToken,
      // Doorkeeper rotates the refresh token. Keeping the old one on a response
      // that omits it is correct; overwriting it with null would lock us out.
      ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
      access_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw new Error(error.message);
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const expiryMs = new Date(expiresAt).getTime() - TOKEN_REFRESH_SKEW_SECONDS * 1000;
  return Date.now() >= expiryMs;
}

async function refreshAccessToken(credentials: AutolabCredentials): Promise<string> {
  if (!credentials.refreshToken) {
    throw new AutolabAuthError(
      "No Autolab refresh token stored. Re-run the OAuth bootstrap in docs/lti.md."
    );
  }

  const response = await fetch(`${credentials.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    // Worth being loud about: a rotated-away refresh token fails here and the
    // only fix is a human redoing the authorization_code flow.
    throw new AutolabAuthError(
      `Autolab token refresh failed (${response.status}): ${payload?.error_description ?? payload?.error ?? "unknown error"}`
    );
  }

  await persistTokens({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: Number(payload.expires_in ?? 7200),
  });

  return payload.access_token as string;
}

// Exchanges the one-time authorization code for the first token pair.
export async function completeAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<void> {
  const credentials = await loadCredentials();
  const response = await fetch(`${credentials.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw new AutolabAuthError(
      `Autolab authorization_code exchange failed (${response.status}): ${payload?.error_description ?? payload?.error ?? "unknown error"}`
    );
  }

  await persistTokens({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: Number(payload.expires_in ?? 7200),
  });
}

async function accessToken(): Promise<{ token: string; baseUrl: string }> {
  const credentials = await loadCredentials();
  if (credentials.accessToken && !isExpired(credentials.accessTokenExpiresAt)) {
    return { token: credentials.accessToken, baseUrl: credentials.baseUrl };
  }
  const refreshed = await refreshAccessToken(credentials);
  return { token: refreshed, baseUrl: credentials.baseUrl };
}

export type AutolabResponse<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

export async function autolabGet<T>(path: string): Promise<AutolabResponse<T>> {
  const { token, baseUrl } = await accessToken();
  const response = await fetch(`${baseUrl}/api/v1/${path.replace(/^\/+/, "")}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (response.ok) {
    return { ok: true, data: (await response.json()) as T };
  }

  const body = await response.text();
  return { ok: false, status: response.status, error: body.slice(0, 500) };
}
