"use client";

import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff, Mail } from "lucide-react";
import {
  requestPasswordReset,
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
  type AuthFormState,
} from "@/lib/auth/actions";

type Mode = "signin" | "signup" | "forgot" | "link";

/** Supabase's per-address cooldown between auth emails. */
const RESEND_COOLDOWN_SECONDS = 60;

type Stamped = AuthFormState & { at: number };

const inputClass =
  "mt-1.5 w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10";
const primaryButton =
  "w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60";
const linkButton = "font-semibold text-primary hover:underline";

/** useActionState whose results carry their arrival time, so cooldowns can tick without reading the clock in render. */
function useStampedAction(action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>) {
  return useActionState<Stamped, FormData>(
    async (prev, formData) => ({ ...(await action(prev, formData)), at: Date.now() }),
    { status: "idle", at: 0 }
  );
}

function useNow() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function secondsLeft(state: Stamped, now: number): number {
  const total =
    state.status === "sent" ? RESEND_COOLDOWN_SECONDS : state.status === "error" ? (state.retryAfterSeconds ?? 0) : 0;
  const elapsed = Math.max(0, ((now || state.at) - state.at) / 1000);
  return Math.max(0, Math.ceil(total - elapsed));
}

function PasswordInput({ name, autoComplete, label }: { name: string; autoComplete: string; label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <span className="relative block">
        <input
          name={name}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded-md p-1.5 text-gray-400 hover:text-gray-700"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </label>
  );
}

function ErrorText({ state, fallback }: { state: Stamped; fallback?: string }) {
  const message = state.status === "error" ? state.message : fallback;
  return message ? <p className="text-sm text-red-600">{message}</p> : null;
}

const SENT_COPY = {
  link: { title: "Check your inbox", body: "We sent a sign-in link to" },
  confirm: { title: "Confirm your email", body: "Almost done - we sent a confirmation link to" },
  reset: { title: "Check your inbox", body: "If there's an account for this address, we sent a password reset link to" },
} as const;

export default function LoginForm({
  next,
  initialError,
  devInstant = false,
}: {
  next: string;
  initialError?: string;
  devInstant?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [signInState, signInAction, signingIn] = useStampedAction(signInWithPassword);
  const [signUpState, signUpAction, signingUp] = useStampedAction(signUpWithPassword);
  const [resetState, resetAction, resetting] = useStampedAction(requestPasswordReset);
  const [linkState, linkAction, linking] = useStampedAction(sendMagicLink);
  const now = useNow();
  // initialError (e.g. an expired link) shows until the user tries something.
  const [showInitialError, setShowInitialError] = useState(true);

  const sentState =
    mode === "signup" ? signUpState : mode === "forgot" ? resetState : mode === "link" ? linkState : null;
  if (sentState?.status === "sent") {
    const copy = SENT_COPY[sentState.kind];
    const resendAction = sentState.kind === "reset" ? resetAction : sentState.kind === "link" ? linkAction : null;
    const remaining = secondsLeft(sentState, now);
    return (
      <div className="space-y-5">
        <div className="space-y-2 text-center">
          <Mail className="mx-auto text-primary" size={28} />
          <p className="font-bold">{copy.title}</p>
          <p className="text-sm text-gray-600">
            {copy.body} <span className="font-bold">{sentState.email}</span>. The link works in any browser. It can take
            a minute to arrive, so check spam too.
          </p>
        </div>
        {resendAction && (
          <form action={resendAction}>
            <input type="hidden" name="email" value={sentState.email} />
            <input type="hidden" name="name" value={sentState.name} />
            <input type="hidden" name="next" value={sentState.next} />
            <button
              type="submit"
              disabled={resetting || linking || remaining > 0}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resetting || linking ? "Sending…" : remaining > 0 ? `Resend in ${remaining}s` : "Resend email"}
            </button>
          </form>
        )}
        <button type="button" onClick={() => setMode("signin")} className={`w-full text-center text-sm ${linkButton}`}>
          Back to sign in
        </button>
      </div>
    );
  }

  const switchMode = (m: Mode) => {
    setShowInitialError(false);
    setMode(m);
  };
  const initial = showInitialError ? initialError : undefined;
  const emailField = (
    <label className="block">
      <span className="text-sm font-semibold text-gray-800">Email</span>
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
    </label>
  );

  return (
    <div className="space-y-6">
      {(mode === "signin" || mode === "signup") && (
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded-md py-2 text-sm font-semibold transition ${
                mode === m ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}

      {mode === "signin" && (
        <form action={signInAction} onSubmit={() => setShowInitialError(false)} className="space-y-5">
          <input type="hidden" name="next" value={next} />
          {emailField}
          <PasswordInput name="password" autoComplete="current-password" label="Password" />
          <div className="-mt-2 text-right">
            <button type="button" onClick={() => switchMode("forgot")} className={`text-sm ${linkButton}`}>
              Forgot password?
            </button>
          </div>
          <ErrorText state={signInState} fallback={initial} />
          <button type="submit" disabled={signingIn} className={primaryButton}>
            {signingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}

      {mode === "signup" && (
        <form action={signUpAction} className="space-y-5">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-sm font-semibold text-gray-800">Full name</span>
            <input name="name" type="text" required autoComplete="name" placeholder="Ada Lovelace" className={inputClass} />
          </label>
          {emailField}
          <PasswordInput name="password" autoComplete="new-password" label="Password" />
          <p className="-mt-3 text-xs text-gray-500">At least 8 characters.</p>
          <ErrorText state={signUpState} />
          <button type="submit" disabled={signingUp} className={primaryButton}>
            {signingUp ? "Creating account…" : "Create account"}
          </button>
          {devInstant && <p className="text-xs text-gray-500">Dev mode: new accounts are confirmed instantly, no email sent.</p>}
        </form>
      )}

      {mode === "forgot" && (
        <form action={resetAction} className="space-y-5">
          <div>
            <p className="font-semibold">Reset your password</p>
            <p className="mt-1 text-sm text-gray-600">
              We&apos;ll email you a link to choose a new one. This also works if you&apos;ve never set a password.
            </p>
          </div>
          {emailField}
          <ErrorText state={resetState} />
          <button type="submit" disabled={resetting || secondsLeft(resetState, now) > 0} className={primaryButton}>
            {resetting ? "Sending…" : "Email me a reset link"}
          </button>
          <button type="button" onClick={() => switchMode("signin")} className={`w-full text-center text-sm ${linkButton}`}>
            Back to sign in
          </button>
        </form>
      )}

      {mode === "link" && (
        <form action={linkAction} className="space-y-5">
          <input type="hidden" name="next" value={next} />
          <div>
            <p className="font-semibold">Sign in with an email link</p>
            <p className="mt-1 text-sm text-gray-600">No password needed - we&apos;ll email you a one-time link.</p>
          </div>
          {emailField}
          <ErrorText state={linkState} />
          <button type="submit" disabled={linking || secondsLeft(linkState, now) > 0} className={primaryButton}>
            {linking ? (devInstant ? "Signing in…" : "Sending…") : devInstant ? "Sign in (dev, no email)" : "Email me a link"}
          </button>
          <button type="button" onClick={() => switchMode("signin")} className={`w-full text-center text-sm ${linkButton}`}>
            Sign in with a password instead
          </button>
        </form>
      )}

      {mode === "signin" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />
            or
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <button
            type="button"
            onClick={() => switchMode("link")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
          >
            <Mail size={15} />
            Email me a sign-in link instead
          </button>
        </div>
      )}
    </div>
  );
}
