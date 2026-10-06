import { headers } from "next/headers";

/**
 * The origin the visitor is actually on (https://<deployed host>, a preview
 * URL, or http://localhost:3000), from the request headers. Use this for
 * user-facing redirects such as the magic-link return address: unlike
 * NEXT_PUBLIC_SITE_URL it can't be stale or left pointing at localhost in a
 * deployment. (LTI signing and OAuth redirect_uri still use the configured
 * URL, because those must match exactly what the other side registered.)
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto =
      h.get("x-forwarded-proto")?.split(",")[0].trim() ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
