"use client";

import { useActionState } from "react";
import { updatePassword, type AuthFormState } from "@/lib/auth/actions";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10";

/**
 * Set / change password. `redirectTo` (the reset-link landing page) moves on
 * after saving; without it (the /account section) it shows "saved" in place.
 */
export default function PasswordForm({ redirectTo, submitLabel = "Save password" }: { redirectTo?: string; submitLabel?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, { status: "idle" });
  return (
    <form action={action} className="space-y-4">
      {redirectTo && (
        <>
          <input type="hidden" name="redirect" value="1" />
          <input type="hidden" name="next" value={redirectTo} />
        </>
      )}
      <label className="block">
        <span className="text-sm font-semibold text-gray-800">New password</span>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-gray-800">Confirm new password</span>
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </label>
      <p className="text-xs text-gray-500">At least 8 characters.</p>
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      {state.status === "done" && <p className="text-sm text-green-700">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
