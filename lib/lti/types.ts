// Subset of the LTI 1.3 core + Assignment and Grade Services (AGS) claims this
// tool actually reads. See https://www.imsglobal.org/spec/lti/v1p3 and
// https://www.imsglobal.org/spec/lti-ags/v2p0 for the full claim sets.

export interface LtiIdTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string; // opaque, stable per-user identifier on the platform
  nonce: string;
  "https://purl.imsglobal.org/spec/lti/claim/message_type": string;
  "https://purl.imsglobal.org/spec/lti/claim/version": string;
  "https://purl.imsglobal.org/spec/lti/claim/deployment_id": string;
  "https://purl.imsglobal.org/spec/lti/claim/target_link_uri": string;
  "https://purl.imsglobal.org/spec/lti/claim/resource_link": {
    id: string;
    title?: string;
  };
  "https://purl.imsglobal.org/spec/lti/claim/roles"?: string[];
  "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"?: {
    scope: string[];
    lineitem?: string;
    lineitems?: string;
  };
  name?: string;
  email?: string;
}

export interface PlatformRegistration {
  id: string;
  name: string;
  issuer: string;
  client_id: string;
  deployment_id: string;
  auth_login_url: string;
  auth_token_url: string;
  jwks_url: string;
}

// Score passback payload accepted from an autograder (Cogniterra first, others
// later) once it has finished grading a student's attempt.
export interface GradingResult {
  assignmentId: string;
  ltiUserId: string;
  score: number;
  maxScore: number;
  raw?: unknown;
}
