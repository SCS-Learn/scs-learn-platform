import { headers } from "next/headers";

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

// Auth is stubbed platform-wide (see lib/instructor/data/current-instructor.ts),
// so there is no session to read a learner off. This is the one place LTI
// depends on that, and it is where a real session lookup drops in.
//
// The id matters more than it looks: it becomes lti user_id, which is the
// identity the tool creates its own account against. Once real login lands,
// return auth.uid() here and existing stub launches will look like a different
// person to the tool. That is fine now and would not be fine after launch.
//
// Named stub identities for testing LTI launches as different real people
// (e.g. accounts with different Cogniterra access levels) until real login
// exists. Only one is active per request - there's no session to pick from -
// chosen by LTI_TEST_LEARNER, which must match a key below; unset or
// unrecognized falls back to "scslearn". Set it in .env.local to switch:
//   LTI_TEST_LEARNER=compeau
const STUB_LEARNERS: Record<string, LaunchingUser> = {
  scslearn: {
    id: "stub-learner-0001",
    name: "SCS Learn Test Learner",
    email: "scslearnscslearn@gmail.com",
    role: "Learner",
  },
  compeau: {
    id: "stub-learner-0002",
    name: "Phillip Compeau",
    email: "phcompeau@gmail.com",
    role: "Learner",
  },
};

export async function getLaunchingUser(): Promise<LaunchingUser> {
  const key = process.env.LTI_TEST_LEARNER ?? "scslearn";
  return STUB_LEARNERS[key] ?? STUB_LEARNERS.scslearn;
}
