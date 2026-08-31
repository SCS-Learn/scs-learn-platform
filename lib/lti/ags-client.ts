import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { getSigningKey } from "@/lib/lti/keys";
import type { PlatformRegistration } from "@/lib/lti/types";

const SCORE_SCOPE = "https://purl.imsglobal.org/spec/lti-ags/scope/score";

// AGS (Assignment and Grade Services) score passback. Two calls per score:
// 1. client_credentials token request, authenticated with a JWT we sign
//    ourselves (the "JWT-bearer" client assertion flow LTI uses instead of a
//    client secret) - https://www.imsglobal.org/spec/security/v1p0#securing_web_services
// 2. POST the score to the line item's /scores endpoint.
async function getAccessToken(platform: PlatformRegistration): Promise<string> {
  const { privateKey, kid } = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);

  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(platform.client_id)
    .setSubject(platform.client_id)
    .setAudience(platform.auth_token_url)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  const res = await fetch(platform.auth_token_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
      scope: SCORE_SCOPE,
    }),
  });

  if (!res.ok) {
    throw new Error(`AGS token request failed (${res.status}): ${await res.text()}`);
  }

  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

export interface SendScoreParams {
  lineItemUrl: string;
  ltiUserId: string;
  scoreGiven: number;
  scoreMaximum: number;
}

// Posts one student's score to the platform. AGS score endpoints don't return
// the resulting grade - a 2xx here means the platform accepted it, not that
// it's visible in the gradebook yet (some LMSs process line-item scores async).
export async function sendScore(platform: PlatformRegistration, params: SendScoreParams): Promise<void> {
  const accessToken = await getAccessToken(platform);

  const res = await fetch(`${params.lineItemUrl.replace(/\/$/, "")}/scores`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/vnd.ims.lis.v1.score+json",
    },
    body: JSON.stringify({
      userId: params.ltiUserId,
      scoreGiven: params.scoreGiven,
      scoreMaximum: params.scoreMaximum,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
      timestamp: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    throw new Error(`AGS score POST failed (${res.status}): ${await res.text()}`);
  }
}
