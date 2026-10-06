"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestOrigin } from "@/lib/auth/origin";
import { safeNextPath } from "@/lib/auth/redirect";

/**
 * Sign-in model: email + password is the everyday login (no email sent, so no
 * rate limits and no "open it in the same browser"). Email is only used for
 * one-time things - confirming a new account, resetting a forgotten password,
 * and the "email me a link instead" fallback.
 *
 * `next dev` shortcut: sign-ups are auto-confirmed and the link fallback signs
 * in instantly, because Supabase's built-in mailer refuses every address
 * outside the project's own team. Never true in a production build -
 * `next build`/`next start` set NODE_ENV=production.
 */
const IS_DEV = process.env.NODE_ENV === "development";
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function isDevInstantSignIn(): Promise<boolean> {
  return IS_DEV;
}

export type AuthFormState =
  | { status: "idle" }
  /** An email went out (sign-in link, confirmation, or password reset). */
  | { status: "sent"; kind: "link" | "confirm" | "reset"; email: string; name: string; next: string }
  | { status: "error"; message: string; retryAfterSeconds?: number; email?: string }
  | { status: "done"; message: string };

/** Kept for existing imports; the magic-link fallback returns the same shape. */
export type MagicLinkState = AuthFormState;

type SupabaseAuthError = { code?: string; status?: number; message: string };

/**
 * Supabase rate-limits auth emails twice over: a ~60s cooldown per address
 * ("...you can only request this after 42 seconds") and an hourly cap for the
 * whole project - tiny on the built-in mailer, raised only after custom SMTP is
 * configured (Authentication -> Rate Limits).
 */
function rateLimitMessage(error: SupabaseAuthError): AuthFormState | null {
  const cooldown = /after (\d+) seconds?/i.exec(error.message);
  if (cooldown) {
    const seconds = Number(cooldown[1]);
    return {
      status: "error",
      message: `We just emailed this address - check your inbox (and spam). You can request another email in ${seconds} seconds.`,
      retryAfterSeconds: seconds,
    };
  }
  if (error.code === "over_email_send_rate_limit" || (error.status === 429 && /email/i.test(error.message))) {
    return {
      status: "error",
      message: "We've hit the limit on emails for the moment. Please try again in a few minutes.",
    };
  }
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return { status: "error", message: "Too many attempts. Wait a minute, then try again.", retryAfterSeconds: 60 };
  }
  return null;
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    name: String(formData.get("name") ?? "").trim().replace(/\s+/g, " "),
    next: safeNextPath(String(formData.get("next") ?? "")),
  };
}

/**
 * Where links in auth emails land. /auth/confirm verifies a token_hash server
 * side, so the link works in any browser (see app/auth/confirm/route.ts and the
 * email templates in docs/auth.md); /auth/callback still handles the default
 * templates' PKCE ?code= links.
 */
async function emailRedirect(next: string): Promise<string> {
  const url = new URL("/auth/callback", await requestOrigin());
  url.searchParams.set("next", next);
  return url.toString();
}

// ---------------------------------------------------------------- password --

export async function signInWithPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password, next } = readCredentials(formData);
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Enter a valid email address." };
  if (!password) return { status: "error", message: "Enter your password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("signInWithPassword:", error.code ?? error.status, error.message);
    if (error.code === "email_not_confirmed") {
      return {
        status: "error",
        email,
        message: "Confirm your email first - we sent you a link when you created the account. Use \"Forgot password?\" to get a new email.",
      };
    }
    if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
      return {
        status: "error",
        email,
        message:
          "Wrong email or password. If you've only ever signed in with an emailed link, you don't have a password yet - use \"Forgot password?\" to set one.",
      };
    }
    return rateLimitMessage(error) ?? { status: "error", email, message: error.message };
  }
  redirect(next);
}

export async function signUpWithPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password, name, next } = readCredentials(formData);
  if (!name) return { status: "error", message: "Enter your name.", email };
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { status: "error", email, message: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.` };
  }

  const supabase = await createClient();

  if (IS_DEV) {
    const admin = createAdminClient();
    if (!admin) return { status: "error", message: "Dev sign-up needs SUPABASE_SERVICE_ROLE_KEY in .env.local." };
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error && !/already/i.test(error.message)) return { status: "error", email, message: error.message };
    if (error) {
      return { status: "error", email, message: "An account with this email already exists. Sign in instead." };
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) return { status: "error", email, message: signInError.message };
    redirect(next);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: await emailRedirect(next), data: { full_name: name } },
  });
  if (error) {
    console.error("signUpWithPassword:", error.code ?? error.status, error.message);
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
      return { status: "error", email, message: "An account with this email already exists. Sign in instead." };
    }
    if (error.code === "weak_password") return { status: "error", email, message: error.message };
    return rateLimitMessage(error) ?? { status: "error", email, message: error.message };
  }

  // With "Confirm email" on, Supabase returns no session and (to avoid
  // revealing which emails have accounts) an empty identities list when the
  // address is already registered.
  if (data.user && data.user.identities?.length === 0) {
    return {
      status: "error",
      email,
      message:
        "An account with this email already exists. Sign in - or, if you've only used emailed links before, use \"Forgot password?\" to set a password.",
    };
  }
  if (data.session) redirect(next);
  return { status: "sent", kind: "confirm", email, name, next };
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email } = readCredentials(formData);
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await emailRedirect("/account/password"),
  });
  if (error) {
    console.error("requestPasswordReset:", error.code ?? error.status, error.message);
    return rateLimitMessage(error) ?? { status: "error", email, message: error.message };
  }
  // Same response whether or not the address has an account, so the form can't
  // be used to find out who's registered.
  return { status: "sent", kind: "reset", email, name: "", next: "/account/password" };
}

/** Set or change the signed-in user's password (/account, and the reset-link landing page). */
export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { status: "error", message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) return { status: "error", message: "The two passwords don't match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/password");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { status: "error", message: "That's already your password." };
    return { status: "error", message: error.message };
  }
  if (formData.get("redirect") === "1") redirect(next);
  return { status: "done", message: "Password saved. You can sign in with it from now on." };
}

// ------------------------------------------------------- email link fallback --

async function devInstantSignIn(email: string, name: string): Promise<AuthFormState | null> {
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
  // the session cookies, exactly as /auth/confirm does for an emailed link.
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) return { status: "error", message: verifyError.message };
  return null;
}

/**
 * "Email me a sign-in link instead": passwordless fallback for anyone without
 * a password yet. Also signs up a first-time user; `name` is only stored then
 * (Supabase ignores options.data for existing users).
 */
export async function sendMagicLink(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, name, next } = readCredentials(formData);
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Enter a valid email address." };

  if (IS_DEV) {
    const failure = await devInstantSignIn(email, name);
    if (failure) return failure;
    redirect(next);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: await emailRedirect(next),
      shouldCreateUser: true,
      ...(name ? { data: { full_name: name } } : {}),
    },
  });
  if (error) {
    console.error("sendMagicLink:", error.code ?? error.status, error.message);
    return rateLimitMessage(error) ?? { status: "error", email, message: error.message };
  }
  return { status: "sent", kind: "link", email, name, next };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
