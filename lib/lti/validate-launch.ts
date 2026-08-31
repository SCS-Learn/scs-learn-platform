import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { getPlatformByIssuer } from "@/lib/lti/platform";
import type { LtiIdTokenClaims, PlatformRegistration } from "@/lib/lti/types";

const MESSAGE_TYPE_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/message_type";
const VERSION_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/version";
const DEPLOYMENT_ID_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id";

// One JWKS fetcher per jwks_url, reused across requests - createRemoteJWKSet
// keeps its own internal cache and cooldown, so recreating it per-launch would
// throw away that caching for no reason.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUrl: string) {
  let jwks = jwksCache.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(jwksUrl, jwks);
  }
  return jwks;
}

// Verifies an LTI 1.3 resource-link-launch id_token: signature against the
// platform's published JWKS, issuer/audience match, and the handful of LTI
// claims that have to be present for this to be a launch we can act on. Does
// NOT check the nonce - the caller owns matching that against the lti_launches
// row created during /api/lti/login, since that's where the "seen before"
// state lives.
export async function validateLaunch(
  idToken: string
): Promise<{ claims: LtiIdTokenClaims; platform: PlatformRegistration }> {
  const unverified = decodeJwt(idToken);
  if (!unverified.iss) throw new Error("id_token is missing iss");

  const clientId = typeof unverified.aud === "string" ? unverified.aud : undefined;
  const platform = await getPlatformByIssuer(unverified.iss, clientId);
  if (!platform) {
    throw new Error(`No LTI platform registered for issuer "${unverified.iss}"`);
  }

  const { payload } = await jwtVerify(idToken, getJwks(platform.jwks_url), {
    issuer: platform.issuer,
    audience: platform.client_id,
  });

  const claims = payload as unknown as LtiIdTokenClaims;

  if (claims[MESSAGE_TYPE_CLAIM] !== "LtiResourceLinkRequest") {
    throw new Error(`Unsupported LTI message_type: ${claims[MESSAGE_TYPE_CLAIM]}`);
  }
  if (claims[VERSION_CLAIM] !== "1.3.0") {
    throw new Error(`Unsupported LTI version: ${claims[VERSION_CLAIM]}`);
  }
  if (claims[DEPLOYMENT_ID_CLAIM] !== platform.deployment_id) {
    throw new Error("deployment_id in launch does not match the registered platform");
  }

  return { claims, platform };
}
