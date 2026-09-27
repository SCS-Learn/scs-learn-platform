/**
 * Google surfaces a failed Drive call in three different shapes depending on
 * where it failed - an HTTP error carries a numeric `code`, a Gaxios rejection
 * puts it on `response.status`, and an auth failure carries a string `code`
 * like "invalid_grant" and no status at all. Reading only `code` as a number
 * (which both call sites used to do) silently collapses an expired Google
 * connection into the generic unreachable message.
 */
function statusOf(error: unknown): number | undefined {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  for (const value of [candidate?.code, candidate?.status, candidate?.response?.status]) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return undefined;
}

export function driveErrorMessage(error: unknown): string {
  const status = statusOf(error);
  const code = (error as { code?: unknown })?.code;
  const detail = error instanceof Error ? error.message : String(error);
  // Logged rather than swallowed: without this the returned message is the
  // only evidence a failure ever happened, and it deliberately says nothing.
  console.error(`Drive request failed (status=${status ?? "none"}, code=${String(code)}): ${detail}`);

  if (code === "invalid_grant" || detail.includes("invalid_grant")) {
    return "Your Google connection has expired - click \"Connect Google Drive\" again to refresh it, then retry.";
  }
  if (status === 401) {
    return "Google rejected the credentials for that request - reconnect Google and try again.";
  }
  if (status === 404 || status === 403) {
    return "Couldn't open that folder - make sure it's shared as \"Anyone with the link\" and try again.";
  }
  return "Couldn't reach Google Drive for that link.";
}
