import { redirect } from "next/navigation";
import AppHeader from "@/components/app/AppHeader";
import PasswordForm from "@/components/auth/PasswordForm";
import { card } from "@/components/app/ui";
import { getSessionUser } from "@/lib/auth/session";

/** Where a password-reset email lands (via /auth/confirm or /auth/callback, which sign the user in first). */
export default async function ChoosePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?error=link_invalid");

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <AppHeader mode="account" />
      <div className="mx-auto max-w-md px-4 py-12">
        <div className={`${card} p-6 sm:p-8`}>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-primary">Account</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">Choose a new password</h1>
          <p className="mt-2 mb-6 text-sm text-gray-600">
            For <span className="font-semibold text-gray-800">{user.email}</span>. You&apos;ll use it to sign in from now on.
          </p>
          <PasswordForm redirectTo="/dashboard" submitLabel="Save and continue" />
        </div>
      </div>
    </main>
  );
}
