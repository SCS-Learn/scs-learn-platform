import { randomUUID } from "node:crypto";
import { platformBaseUrl } from "@/lib/lti/config";
import {
  parseAuthorizationHeader,
  verifyBodyHash,
  verifySignature,
} from "@/lib/lti/oauth1";
import {
  claimNonce,
  clearResultScore,
  getResultBySourcedid,
  readResultScore,
  writeResultScore,
} from "@/lib/lti/tools";

// LTI 1.1 Basic Outcomes Service. This is the endpoint Cogniterra calls when a
// learner passes a graded step, and it is the whole reason a launch is worth
// more than an iframe with a URL in it.
//
// The wire format is "POX": a signed POST whose body is a fixed little XML
// envelope. Three operations exist and all three are implemented, because a
// tool that gets a 501 for readResult may decide grading is unavailable
// entirely rather than fall back to replaceResult alone.

export const dynamic = "force-dynamic";

type Operation =
  | { kind: "replaceResult"; sourcedid: string; score: number }
  | { kind: "readResult"; sourcedid: string }
  | { kind: "deleteResult"; sourcedid: string }
  | { kind: "unsupported"; name: string };

// The POX schema is fixed and tiny, so matching the handful of elements we care
// about beats taking on an XML parser dependency. Element names are matched
// with an optional namespace prefix because tools differ on whether they use one.
function tagContent(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  return match ? match[1].trim() : null;
}

function parseOperation(xml: string): Operation | null {
  const requestMatch = xml.match(/<(?:\w+:)?(replaceResult|readResult|deleteResult)Request[^>]*>/);
  if (!requestMatch) {
    const anyRequest = xml.match(/<(?:\w+:)?(\w+)Request[^>]*>/);
    return anyRequest ? { kind: "unsupported", name: anyRequest[1] } : null;
  }

  const sourcedid = tagContent(xml, "sourcedId");
  if (!sourcedid) return null;

  const operation = requestMatch[1];
  if (operation === "readResult") return { kind: "readResult", sourcedid };
  if (operation === "deleteResult") return { kind: "deleteResult", sourcedid };

  const textValue = tagContent(xml, "textString");
  const score = Number(textValue);
  // The spec says a replaceResult score is a float in [0,1] and that anything
  // outside the range is a failure rather than something to clamp: clamping
  // would turn a tool's unit bug into a silently wrong grade.
  if (textValue === null || !Number.isFinite(score) || score < 0 || score > 1) {
    return null;
  }
  return { kind: "replaceResult", sourcedid, score };
}

function poxResponse(args: {
  success: boolean;
  description: string;
  messageRefId: string;
  operation: string;
  scoreBody?: string;
}): string {
  const { success, description, messageRefId, operation, scoreBody } = args;
  return `<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeResponse xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader>
    <imsx_POXResponseHeaderInfo>
      <imsx_version>V1.0</imsx_version>
      <imsx_messageIdentifier>${randomUUID()}</imsx_messageIdentifier>
      <imsx_statusInfo>
        <imsx_codeMajor>${success ? "success" : "failure"}</imsx_codeMajor>
        <imsx_severity>status</imsx_severity>
        <imsx_description>${description}</imsx_description>
        <imsx_messageRefIdentifier>${messageRefId}</imsx_messageRefIdentifier>
        <imsx_operationRefIdentifier>${operation}</imsx_operationRefIdentifier>
      </imsx_statusInfo>
    </imsx_POXResponseHeaderInfo>
  </imsx_POXHeader>
  <imsx_POXBody>${scoreBody ?? ""}</imsx_POXBody>
</imsx_POXEnvelopeResponse>`;
}

function xmlReply(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  // The body has to be read as raw text, not parsed, because the OAuth body
  // hash is computed over the exact bytes sent.
  const body = await request.text();
  const messageRefId = tagContent(body, "imsx_messageIdentifier") ?? "unknown";

  const fail = (description: string, status = 200, operation = "unknown") =>
    // A refused outcome is still a well-formed POX failure with HTTP 200 in the
    // normal case: tools read imsx_codeMajor, and several treat a non-200 as a
    // transport error worth retrying forever.
    xmlReply(poxResponse({ success: false, description, messageRefId, operation }), status);

  const oauthParams = parseAuthorizationHeader(request.headers.get("authorization"));
  if (!oauthParams) {
    return fail("Missing OAuth Authorization header", 401);
  }

  const operation = parseOperation(body);
  if (!operation) {
    return fail("Malformed or unsupported outcomes request");
  }
  if (operation.kind === "unsupported") {
    return fail(`Unsupported operation ${operation.name}`, 200, operation.name);
  }

  // Resolving the sourcedid first is what tells us which secret to verify
  // against. An unknown sourcedid is rejected before any crypto happens.
  const target = await getResultBySourcedid(operation.sourcedid);
  if (!target) {
    return fail("Unknown sourcedId", 200, operation.kind);
  }

  if (!verifyBodyHash(oauthParams, body)) {
    return fail("Missing or invalid oauth_body_hash", 401, operation.kind);
  }

  const url = `${await platformBaseUrl()}/api/lti/outcomes`;
  const signatureCheck = verifySignature(
    "POST",
    url,
    oauthParams,
    target.tool.consumerKey,
    target.tool.sharedSecret
  );
  if (!signatureCheck.ok) {
    return fail(`OAuth verification failed: ${signatureCheck.reason}`, 401, operation.kind);
  }

  const nonce = oauthParams.oauth_nonce;
  if (!nonce || !(await claimNonce(target.tool.id, nonce))) {
    return fail("Replayed or missing oauth_nonce", 401, operation.kind);
  }

  if (operation.kind === "replaceResult") {
    await writeResultScore(target.resultId, operation.score, target.pointsPossible);
    return xmlReply(
      poxResponse({
        success: true,
        description: "Score recorded",
        messageRefId,
        operation: "replaceResult",
      }),
      200
    );
  }

  if (operation.kind === "deleteResult") {
    await clearResultScore(target.resultId);
    return xmlReply(
      poxResponse({
        success: true,
        description: "Score cleared",
        messageRefId,
        operation: "deleteResult",
      }),
      200
    );
  }

  const { scoreRaw } = await readResultScore(target.resultId);
  return xmlReply(
    poxResponse({
      success: true,
      description: "Score read",
      messageRefId,
      operation: "readResult",
      scoreBody: `
    <readResultResponse>
      <result>
        <resultScore>
          <language>en</language>
          <textString>${scoreRaw ?? ""}</textString>
        </resultScore>
      </result>
    </readResultResponse>`,
    }),
    200
  );
}
