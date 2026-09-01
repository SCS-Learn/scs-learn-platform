import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// OAuth 1.0a HMAC-SHA1, the signing scheme LTI 1.1 is built on.
//
// Written by hand rather than pulled from a library because every maintained
// OAuth 1 package on npm is either abandoned or drags in a request client, and
// the signing rules that LTI actually exercises fit in this file. The two rules
// that trip people up are both here: RFC 3986 encoding is stricter than
// encodeURIComponent (it also escapes ! * ' ( ) ), and the signing key always
// ends in "&" because LTI has no token secret.
//
// Outbound launches: signLaunch(). Inbound outcomes callbacks:
// parseAuthorizationHeader() then verifyBodyHash() and verifySignature().

const OAUTH_TIMESTAMP_WINDOW_SECONDS = 300;

export type OAuthParams = Record<string, string>;

// RFC 3986 percent-encoding. encodeURIComponent leaves !*'() alone; OAuth does not.
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

// Params are sorted by encoded key, then by encoded value for repeated keys.
function normalizeParams(params: OAuthParams): string {
  const pairs: Array<[string, string]> = Object.entries(params)
    .filter(([key]) => key !== "oauth_signature")
    .map(([key, value]) => [percentEncode(key), percentEncode(value)]);

  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  return pairs.map(([key, value]) => `${key}=${value}`).join("&");
}

// The signature base URL excludes query string and default ports, and the
// scheme and host are lowercased. A mismatch here is the single most common
// cause of "invalid signature" against a tool that is otherwise configured
// correctly, which is why callers pass an explicit public URL rather than
// whatever the proxy happened to hand the route.
export function signatureBaseUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  const isDefaultPort =
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443");
  if (isDefaultPort) {
    parsed.port = "";
  }
  return parsed.toString();
}

export function signatureBaseString(
  method: string,
  url: string,
  params: OAuthParams
): string {
  return [
    method.toUpperCase(),
    percentEncode(signatureBaseUrl(url)),
    percentEncode(normalizeParams(params)),
  ].join("&");
}

// LTI 1.1 is two-legged, so there is no token secret and the key is
// "<consumer secret>&" with a trailing separator and an empty second half.
export function sign(baseString: string, sharedSecret: string): string {
  const signingKey = `${percentEncode(sharedSecret)}&`;
  return createHmac("sha1", signingKey).update(baseString).digest("base64");
}

export function oauthNonce(): string {
  return randomBytes(16).toString("hex");
}

export function oauthTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

// Signs a set of LTI launch parameters for a form POST. Returns the full
// parameter set including oauth_signature, ready to render as hidden inputs.
export function signLaunch(
  launchUrl: string,
  ltiParams: OAuthParams,
  consumerKey: string,
  sharedSecret: string
): OAuthParams {
  const params: OAuthParams = {
    ...ltiParams,
    oauth_version: "1.0",
    oauth_nonce: oauthNonce(),
    oauth_timestamp: oauthTimestamp(),
    oauth_consumer_key: consumerKey,
    oauth_signature_method: "HMAC-SHA1",
    // Required by the LTI 1.1 spec even though nothing is called back to it.
    oauth_callback: "about:blank",
  };

  const signature = sign(signatureBaseString("POST", launchUrl, params), sharedSecret);
  return { ...params, oauth_signature: signature };
}

// Inbound: outcomes callbacks carry their OAuth params in an Authorization
// header rather than the body, because the body is XML rather than form data.
export function parseAuthorizationHeader(header: string | null): OAuthParams | null {
  if (!header || !/^OAuth\s/i.test(header)) {
    return null;
  }

  const params: OAuthParams = {};
  for (const part of header.slice(header.indexOf(" ") + 1).split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim().replace(/^"|"$/g, "");
    params[decodeURIComponent(key)] = decodeURIComponent(rawValue);
  }

  return Object.keys(params).length > 0 ? params : null;
}

function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, and the length of a base64
  // SHA-1 digest is not a secret, so comparing it first is fine.
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

// With a non-form body, OAuth 1.0a covers the body through oauth_body_hash
// (RFC 5849 body hashing) rather than by including it in the base string. If a
// tool omits the hash, the body is unsigned and the request must be rejected:
// accepting it would let anyone who observed one signed callback swap in any
// grade they liked.
export function verifyBodyHash(oauthParams: OAuthParams, body: string): boolean {
  const claimedHash = oauthParams.oauth_body_hash;
  if (!claimedHash) {
    return false;
  }
  const actualHash = createHash("sha1").update(body, "utf8").digest("base64");
  return safeEquals(claimedHash, actualHash);
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

export function verifySignature(
  method: string,
  url: string,
  oauthParams: OAuthParams,
  consumerKey: string,
  sharedSecret: string
): SignatureCheck {
  if (oauthParams.oauth_consumer_key !== consumerKey) {
    return { ok: false, reason: "consumer key mismatch" };
  }
  if ((oauthParams.oauth_signature_method ?? "").toUpperCase() !== "HMAC-SHA1") {
    return { ok: false, reason: "unsupported signature method" };
  }

  const timestamp = Number(oauthParams.oauth_timestamp);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "missing or malformed timestamp" };
  }
  const skew = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (skew > OAUTH_TIMESTAMP_WINDOW_SECONDS) {
    return { ok: false, reason: `timestamp outside ${OAUTH_TIMESTAMP_WINDOW_SECONDS}s window` };
  }

  const provided = oauthParams.oauth_signature;
  if (!provided) {
    return { ok: false, reason: "missing signature" };
  }

  const expected = sign(signatureBaseString(method, url, oauthParams), sharedSecret);
  if (!safeEquals(provided, expected)) {
    return { ok: false, reason: "signature mismatch" };
  }

  return { ok: true };
}
