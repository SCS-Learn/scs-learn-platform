import { NextResponse } from "next/server";
import { completeAuthorizationCode } from "@/lib/autolab/client";
import { platformBaseUrl } from "@/lib/lti/config";

export const dynamic = "force-dynamic";

// One-time OAuth bootstrap landing point. Autolab enables only the
// authorization_code grant, so a human has to approve once with an instructor
// account; after that the stored refresh token carries the integration.
// Full walkthrough in docs/lti.md.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.json({ error: `Autolab denied authorization: ${oauthError}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "No authorization code in callback" }, { status: 400 });
  }

  // The redirect_uri in the exchange must byte-match the one used in the
  // authorize request, or Doorkeeper rejects the code.
  const redirectUri = `${await platformBaseUrl()}/api/autolab/oauth/callback`;
  await completeAuthorizationCode(code, redirectUri);

  return NextResponse.json({
    ok: true,
    message: "Autolab tokens stored. Grade sync is live.",
  });
}
