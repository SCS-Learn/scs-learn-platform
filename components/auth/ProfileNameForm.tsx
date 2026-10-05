"use client";

import { useActionState } from "react";
import { updateProfileName, type ProfileState } from "@/lib/auth/profile-actions";

export default function ProfileNameForm({ initialName }: { initialName: string }) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(updateProfileName, { status: "idle" });

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="profile-name" className="text-xs font-bold text-gray-600">
        Name
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="profile-name"
          name="name"
          defaultValue={initialName}
          required
          maxLength={80}
          autoComplete="name"
          className="min-w-0 flex-1 border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state.status === "saved" && <p className="text-sm text-green-700">Saved.</p>}
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      <p className="text-xs text-gray-500">Shown to your instructors and in Cogniterra.</p>
    </form>
  );
}
