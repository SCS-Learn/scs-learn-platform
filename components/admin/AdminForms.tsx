"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { addAdmin, addCourseInstructor, addInstructor, type AdminActionState } from "@/lib/admin/actions";

const input =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10";
const button =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60";

function Feedback({ state }: { state: AdminActionState }) {
  if (state.status === "idle") return null;
  return <p className={`text-sm ${state.status === "ok" ? "text-green-700" : "text-red-600"}`}>{state.message}</p>;
}

/** Resets the form after a successful add so the next one starts blank. */
function useResettingAction(action: (prev: AdminActionState, fd: FormData) => Promise<AdminActionState>) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(async (prev, fd) => {
    const result = await action(prev, fd);
    if (result.status === "ok") formRef.current?.reset();
    return result;
  }, { status: "idle" });
  return { formRef, state, formAction, pending };
}

export function AddInstructorForm() {
  const { formRef, state, formAction, pending } = useResettingAction(addInstructor);
  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="name" required placeholder="Full name" aria-label="Instructor name" className={input} />
        <input name="email" type="email" required placeholder="email@andrew.cmu.edu" aria-label="Instructor email" className={input} />
        <button type="submit" disabled={pending} className={button}>
          <Plus size={15} />
          {pending ? "Adding…" : "Add instructor"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function AddAdminForm() {
  const { formRef, state, formAction, pending } = useResettingAction(addAdmin);
  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="email" type="email" required placeholder="email@andrew.cmu.edu" aria-label="Admin email" className={input} />
        <button type="submit" disabled={pending} className={button}>
          <Plus size={15} />
          {pending ? "Adding…" : "Add admin"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function AddCourseInstructorForm({
  courseId,
  options,
}: {
  courseId: string;
  /** Instructors not already on this course. */
  options: { id: string; name: string; email: string | null }[];
}) {
  const { formRef, state, formAction, pending } = useResettingAction(addCourseInstructor);
  if (options.length === 0) return <p className="text-xs text-gray-400">Every instructor already teaches this course.</p>;
  return (
    <form ref={formRef} action={formAction} className="space-y-1.5">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex gap-2">
        <select name="instructorId" required defaultValue="" aria-label="Instructor to add" className={input}>
          <option value="" disabled>
            Add an instructor…
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.email ? ` (${o.email})` : ""}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={button}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
