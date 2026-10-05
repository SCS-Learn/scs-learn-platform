"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { sendMagicLink, type MagicLinkState } from "@/lib/auth/actions";

export default function LoginForm({
  next,
  initialError,
  devInstant = false,
  showName = true,
}: {
  next: string;
  initialError?: string;
  devInstant?: boolean;
  /** Instructors' names come from their instructors row, so the instructor variant skips the field. */
  showName?: boolean;
}) {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(sendMagicLink, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <div className="space-y-2 text-center">
        <Mail className="mx-auto text-primary" size={28} />
        <p className="font-bold">Check your inbox</p>
        <p className="text-sm text-gray-600">
          We sent a sign-in link to <span className="font-bold">{state.email}</span>. Open it in this same
          browser to continue.
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : initialError;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-sm font-semibold text-gray-800">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1.5 w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
        />
      </label>
      {showName && (
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">
            Name <span className="font-normal text-gray-400">(first sign-in only)</span>
          </span>
          <input
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {devInstant && (
        <p className="text-xs text-gray-500">Dev mode: signs in as any email instantly, no email sent.</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {pending ? (devInstant ? "Signing in…" : "Sending…") : devInstant ? "Sign in" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
