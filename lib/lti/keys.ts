import { createPrivateKey, createPublicKey, type KeyObject } from "crypto";
import { exportJWK, importPKCS8, type JWK } from "jose";

// This tool's own RS256 keypair - used to sign the client-assertion JWT for AGS
// client_credentials token requests, and published (public half only) at
// /api/lti/jwks so platforms can verify anything we sign.
//
// Generate a keypair once with:
//   openssl genpkey -algorithm RSA -pkeyopts rsa_keygen_bits:2048 -out lti-private.pem
// then paste the PEM into LTI_TOOL_PRIVATE_KEY (with \n for line breaks, or
// Next's multiline .env quoting - see the env docs) and pick any short string
// for LTI_TOOL_KID.

const KID = process.env.LTI_TOOL_KID || "scs-lti-key-1";

let cachedPrivateKey: KeyObject | null = null;

function loadPrivateKey(): KeyObject {
  if (cachedPrivateKey) return cachedPrivateKey;

  const pem = process.env.LTI_TOOL_PRIVATE_KEY;
  if (!pem) {
    throw new Error(
      "LTI_TOOL_PRIVATE_KEY is not set - required for AGS score passback and the JWKS endpoint"
    );
  }

  cachedPrivateKey = createPrivateKey(pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem);
  return cachedPrivateKey;
}

export async function getSigningKey() {
  const keyObject = loadPrivateKey();
  const privateKey = await importPKCS8(keyObject.export({ type: "pkcs8", format: "pem" }).toString(), "RS256");
  return { privateKey, kid: KID };
}

export async function getPublicJwk(): Promise<JWK> {
  const publicKey = createPublicKey(loadPrivateKey());
  const jwk = await exportJWK(publicKey);
  return { ...jwk, kid: KID, use: "sig", alg: "RS256" };
}
