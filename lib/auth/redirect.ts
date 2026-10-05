/** Where someone lands after signing in when no ?next= was given: /dashboard routes them to their role's home. */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

/**
 * ?next= arrives from the URL, so it is attacker-controlled. Only same-origin
 * paths are honored - "//evil.com" and "/\evil.com" are protocol-relative
 * redirects that browsers happily follow off-site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  return next;
}
