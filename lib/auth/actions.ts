"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { platformBaseUrl } from "@/lib/lti/config";
import { safeNextPath } from "@/lib/auth/redirect";

/**
 * `next dev` only: sign in as any email instantly, no email sent. Supabase's
 * built-in mailer refuses every address outside the project's own team (and
 * is rate-limited to a few an hour), so testing several learners locally is
 * otherwise impossible until custom SMTP is configured. Never true in a
 * production build - `next build`/`next start` set NODE_ENV=production.
 */
const DEV_INSTANT_SIGN_IN = process.env.NODE_ENV === "development";

export async function isDevInstantSignIn(): Promise<boolean> {
  return DEV_INSTANT_SIGN_IN;
}

async function devInstantSignIn(email: string, name: string): Promise<MagicLinkState | null> {
  const admin = createAdminClient();
  if (!admin) {
    return { status: "error", message: "Dev sign-in needs SUPABASE_SERVICE_ROLE_KEY in .env.local." };
  }
  // Fails harmlessly with "already registered" for a returning learner.
  await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(name ? { user_metadata: { full_name: name } } : {}),
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    return { status: "error", message: error?.message ?? "Could not create a dev sign-in link." };
  }
  // Redeeming the token through the cookie-backed server client is what sets
  // the session cookies, exactly as /auth/callback does for an emailed link.
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) return { status: "error", message: verifyError.message };
  return null;
}

export type MagicLinkState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

/**
 * Passwordless sign-in: emails the learner a one-time link that lands on
 * /auth/callback. The same call signs up a first-time learner, and `name` is
 * only stored then (Supabase ignores options.data for existing users) - it
 * becomes lis_person_name_full on Cogniterra launches.
 */
export async function sendMagicLink(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  if (DEV_INSTANT_SIGN_IN) {
    const failure = await devInstantSignIn(email, name);
    if (failure) return failure;
    redirect(next);
  }

  const callback = new URL("/auth/callback", await platformBaseUrl());
  callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callback.toString(),
      shouldCreateUser: true,
      ...(name ? { data: { full_name: name } } : {}),
    },
  });

  if (error) {
    return { status: "error", message: error.message };
  }
  return { status: "sent", email };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
