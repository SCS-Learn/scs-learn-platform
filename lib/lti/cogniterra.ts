import type { GradingResult } from "@/lib/lti/types";

// STUB - the shape of Cogniterra's grading notification is not yet confirmed.
// Everything below is a best guess based on typical Stepik-engine webhook
// payloads (Cogniterra runs on the Stepik platform) and needs to be corrected
// once you've graded a real submission in the dummy test course and can see
// what it actually sends. Two open questions that determine how much of this
// file is wrong:
//
// 1. Does Cogniterra support outbound webhooks per-course/per-step at all, or
//    does grading only ever land in Cogniterra's own gradebook (in which case
//    this tool has to poll Cogniterra's submissions API instead of receiving
//    pushes)?
// 2. How does a Cogniterra submission get correlated back to the LTI launch
//    that started it? Cogniterra has no concept of our lti_user_id - the
//    launch has to hand Cogniterra a correlation token (e.g. appended to the
//    assignment URL as a query param, or embedded via their custom-field
//    support if they have one) and get it echoed back on grading.
//
// Assumed payload shape for now:
//   { correlation_id: string, external_ref: string, score: number, max_score: number }
// where correlation_id round-trips a value this tool generated at launch time
// and stashed on the lti_assignments/lti_submissions row.

interface RawCogniterraPayload {
  correlation_id?: string;
  external_ref?: string;
  score?: number;
  max_score?: number;
}

export function parseCogniterraPayload(
  raw: unknown,
  assignmentId: string
): GradingResult {
  const payload = raw as RawCogniterraPayload;

  if (!payload.correlation_id) {
    throw new Error("Cogniterra payload is missing correlation_id - cannot identify the student");
  }
  if (typeof payload.score !== "number" || typeof payload.max_score !== "number") {
    throw new Error("Cogniterra payload is missing score/max_score");
  }

  return {
    assignmentId,
    ltiUserId: payload.correlation_id,
    score: payload.score,
    maxScore: payload.max_score,
    raw,
  };
}
