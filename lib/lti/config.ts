import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { displayNameFor, getSessionUser } from "@/lib/auth/session";

// Identity this platform presents to external tools. tool_consumer_instance_guid
// is meant to be stable forever: tools key their user records off it, so
// changing it after a launch has happened orphans every learner's progress on
// the tool side. It is a constant, not an env var, for exactly that reason.
export const TOOL_CONSUMER_INSTANCE_GUID = "learn.cs.cmu.edu";
export const TOOL_CONSUMER_INSTANCE_NAME = "SCS Learn";
export const TOOL_CONSUMER_PRODUCT_FAMILY = "scs-learn";
export const TOOL_CONSUMER_VERSION = "0.1";

// The OAuth signature is computed over the absolute URL of the endpoint, and
// the tool recomputes it from the URL it was configured with. Behind Vercel the
// request host can be a preview or internal hostname, so a mismatch here breaks
// grade passback with a bare "invalid signature" and no other clue. Set
// NEXT_PUBLIC_SITE_URL in production and this stops being guesswork.
export async function platformBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) {
    throw new Error("Cannot determine platform URL: set NEXT_PUBLIC_SITE_URL");
  }
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type LaunchingUser = {
  id: string;
  name: string;
  email: string;
  role: "Learner" | "Instructor";
};

// The signed-in Supabase Auth user. Its id becomes lti user_id - the identity
// Cogniterra creates its own account against - and the platform_user_id every
// learner-keyed table (lesson_completions, quiz_submissions, lti_results,
// autolab_scores) is keyed by, so each learner gets their own Cogniterra
// account and their own progress. Null when nobody is signed in.
export async function getCurrentLearner(): Promise<LaunchingUser | null> {
  const user = await getSessionUser();
  if (!user || !user.email) return null;
  return {
    id: user.id,
    name: displayNameFor(user),
    email: user.email,
    role: "Learner",
  };
}

// For learner-only pages and server actions. proxy.ts already bounces
// signed-out requests on /student/*, so this redirect is the backstop for an
// action whose session expired between page load and submit.
export async function getLaunchingUser(): Promise<LaunchingUser> {
  const learner = await getCurrentLearner();
  if (!learner) redirect("/login");
  return learner;
}
