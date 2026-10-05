import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentInstructor } from "@/lib/instructor/data/current-instructor";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimInstructorForDev } from "@/lib/auth/profile-actions";
import { signOut } from "@/lib/auth/actions";

/** Where requireInstructor() sends a signed-in account that isn't linked to an instructors row. */
export default async function InstructorAccessPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/instructor");
  if (await getCurrentInstructor()) redirect("/instructor");

  const isDev = process.env.NODE_ENV === "development";
  const admin = isDev ? createAdminClient() : null;
  const unclaimed = admin
    ? (((await admin.from("instructors").select("id, name").is("auth_user_id", null).order("name")).data ?? []) as {
        id: string;
        name: string;
      }[])
    : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-black">
      <div className="w-full max-w-md border border-gray-200 bg-white p-6 sm:p-8">
        <span className="flex h-10 w-10 items-center justify-center bg-gray-100 text-primary">
          <GraduationCap size={20} />
        </span>
        <h1 className="mt-4 font-brand text-2xl font-semibold">No instructor access yet</h1>
        <p className="mt-2 text-sm text-gray-600">
          You&apos;re signed in as <span className="font-bold text-black">{user.email}</span>, which isn&apos;t
          registered as an instructor. Ask an SCS Learn admin to add this email to the instructors list, then sign in
          again.
        </p>

        {isDev && unclaimed.length > 0 && (
          <div className="mt-6 border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold text-amber-900">DEV ONLY · link this account to an instructor</p>
            <p className="mt-1 text-xs text-amber-900">
              Shown under <code>next dev</code> only. Production access is granted by email (see
              supabase/migrations/add-instructor-accounts.sql).
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {unclaimed.map((row) => (
                <form key={row.id} action={claimInstructorForDev}>
                  <input type="hidden" name="instructorId" value={row.id} />
                  <button
                    type="submit"
                    className="w-full border border-amber-900 bg-white px-3 py-2 text-left text-sm font-bold text-amber-900 hover:bg-amber-100"
                  >
                    Continue as {row.name}
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-100 pt-4 text-sm">
          <Link href="/student" className="font-bold underline underline-offset-4">
            Go to my courses
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-gray-600 underline underline-offset-4 hover:text-black">
              Sign in with a different email
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
