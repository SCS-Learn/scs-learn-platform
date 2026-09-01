import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  percentEncode,
  signatureBaseString,
  signatureBaseUrl,
  sign,
  signLaunch,
  parseAuthorizationHeader,
  verifyBodyHash,
  verifySignature,
} from "./oauth1.ts";

// Run with: npm run test:lti
//
// These cover the parts of LTI 1.1 that fail silently. A wrong signature comes
// back from Cogniterra as a generic error page with no diagnostic, so the
// encoding and base-string rules are worth pinning down here rather than
// discovering against a live tool.

test("percentEncode follows RFC 3986, not encodeURIComponent", () => {
  // The unreserved set survives untouched.
  assert.equal(percentEncode("abcABC123-._~"), "abcABC123-._~");
  // encodeURIComponent leaves these alone and OAuth requires them escaped.
  // This is the single most common cause of a signature that verifies locally
  // and fails against a real tool.
  assert.equal(percentEncode("!*'()"), "%21%2A%27%28%29");
  assert.equal(percentEncode(" "), "%20");
  assert.equal(percentEncode("="), "%3D");
  assert.equal(percentEncode("&"), "%26");
});

test("signature base URL drops query and fragment and default ports", () => {
  assert.equal(
    signatureBaseUrl("https://learn.cs.cmu.edu:443/api/lti/outcomes?x=1#frag"),
    "https://learn.cs.cmu.edu/api/lti/outcomes"
  );
  // A non-default port stays, because the tool signs the URL it was given.
  assert.equal(
    signatureBaseUrl("http://localhost:3000/api/lti/outcomes"),
    "http://localhost:3000/api/lti/outcomes"
  );
});

test("base string sorts by encoded key and double-encodes the parameter string", () => {
  const base = signatureBaseString("post", "http://example.com/request", {
    b5: "=%3D",
    a3: "a",
    "c@": "",
    a2: "r b",
    oauth_consumer_key: "9djdj82h48djs9d2",
    oauth_nonce: "7d8f3e4a",
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: "137131201",
  });

  // Adapted from the RFC 5849 section 3.4.1.1 worked example. The published
  // vector repeats the key a3, which a plain object cannot express and LTI
  // never sends, so that one pair is dropped; everything else matches the RFC
  // byte for byte, including the method uppercasing and the %2520 that results
  // from encoding an already-encoded space.
  assert.equal(
    base,
    "POST&http%3A%2F%2Fexample.com%2Frequest&a2%3Dr%2520b%26a3%3Da%26b5%3D%253D%25253D" +
      "%26c%2540%3D%26oauth_consumer_key%3D9djdj82h48djs9d2%26oauth_nonce%3D7d8f3e4a" +
      "%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D137131201"
  );
});

test("signing key ends in & because LTI 1.1 has no token secret", () => {
  // Verified against python hmac and openssl dgst, not just this implementation:
  const expected = "I7DNJ3D2axnaif2L46WhNrchDp0=";
  assert.equal(sign("base", "secret"), expected);
});

test("a signed launch verifies against the same secret and fails against another", () => {
  const launchUrl = "https://cogniterra.org/lti/";
  const params = signLaunch(
    launchUrl,
    {
      lti_message_type: "basic-lti-launch-request",
      lti_version: "LTI-1p0",
      resource_link_id: "abc-123",
      user_id: "learner-1",
      custom_course: "64",
      lis_person_name_full: "Test Learner (o'Brien)",
    },
    "scs-learn",
    "s3cret"
  );

  assert.equal(params.oauth_signature_method, "HMAC-SHA1");
  assert.ok(params.oauth_signature);
  assert.ok(params.oauth_nonce);

  const good = verifySignature("POST", launchUrl, params, "scs-learn", "s3cret");
  assert.equal(good.ok, true);

  const wrongSecret = verifySignature("POST", launchUrl, params, "scs-learn", "wrong");
  assert.equal(wrongSecret.ok, false);
});

test("verification rejects a stale timestamp", () => {
  const launchUrl = "https://cogniterra.org/lti/";
  const params = signLaunch(launchUrl, { resource_link_id: "x" }, "key", "secret");
  params.oauth_timestamp = String(Math.floor(Date.now() / 1000) - 3600);
  const check = verifySignature("POST", launchUrl, params, "key", "secret");
  assert.equal(check.ok, false);
});

test("Authorization header parsing handles quoting and encoding", () => {
  const parsed = parseAuthorizationHeader(
    'OAuth realm="", oauth_consumer_key="scs-learn", oauth_signature="abc%2Bdef%3D", oauth_nonce="n1"'
  );
  assert.equal(parsed?.oauth_consumer_key, "scs-learn");
  assert.equal(parsed?.oauth_signature, "abc+def=");
  assert.equal(parsed?.oauth_nonce, "n1");
  assert.equal(parseAuthorizationHeader("Bearer token"), null);
});

test("body hash catches a tampered outcomes payload", () => {
  const body = "<xml>score 0.5</xml>";
  const hash = createHash("sha1").update(body, "utf8").digest("base64");

  assert.equal(verifyBodyHash({ oauth_body_hash: hash }, body), true);
  // A grade swapped in transit must not verify.
  assert.equal(verifyBodyHash({ oauth_body_hash: hash }, "<xml>score 1.0</xml>"), false);
  // An omitted hash means the body is unsigned, which is a rejection and not a
  // pass. Getting this backwards makes the outcomes endpoint forgeable.
  assert.equal(verifyBodyHash({}, body), false);
});
