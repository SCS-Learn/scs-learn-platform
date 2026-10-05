"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { joinEmailList, type EmailSignupState } from "@/lib/landing/email-signup";

type EmailSignupFormProps = {
  buttonLabel: string;
  placeholder?: string;
  className?: string;
  /** Recorded with the signup so we know which form it came from. */
  source?: string;
};

// Square input fused to a Carnegie Red submit, matching cmu.edu's form style.
// Assumes a dark background (the hero and the final CTA both are).
export default function EmailSignupForm({
  buttonLabel,
  placeholder = "Enter your email",
  className = "",
  source = "landing",
}: EmailSignupFormProps) {
  const [state, formAction, pending] = useActionState<EmailSignupState, FormData>(joinEmailList, {
    status: "idle",
  });

  if (state.status === "done") {
    return (
      <p role="status" className={`flex items-center gap-2 text-base font-semibold ${className}`}>
        <span className="flex h-6 w-6 items-center justify-center bg-primary">
          <Check size={15} strokeWidth={3} />
        </span>
        You&apos;re on the list. We&apos;ll be in touch at {state.email}.
      </p>
    );
  }

  return (
    <div className={`w-full max-w-[30rem] ${className}`}>
      <form action={formAction} className="flex w-full flex-col gap-2 sm:flex-row sm:gap-0">
        <input type="hidden" name="source" value={source} />
        <input
          type="email"
          name="email"
          required
          maxLength={254}
          placeholder={placeholder}
          aria-label="Email address"
          className="min-w-0 flex-1 border border-white/60 bg-white px-4 py-3 text-base text-black placeholder:text-gray-medium focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 whitespace-nowrap bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-70"
        >
          {pending ? "Saving…" : buttonLabel}
        </button>
      </form>
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {state.message}
        </p>
      )}
    </div>
  );
}
