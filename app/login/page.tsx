import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirect";
import { isDevInstantSignIn } from "@/lib/auth/actions";

const ERROR_MESSAGES: Record<string, string> = {
  link_invalid: "That sign-in link is invalid or has expired. Request a new one below.",
};

/**
 * One login for everyone - students and instructors share Supabase Auth, and
 * the role comes from whether the account is linked to an instructors row
 * (lib/instructor/data/current-instructor.ts). The instructor variant is just
 * copy: it's shown whenever the sign-in was triggered from an instructor page,
 * or picked with the toggle at the bottom.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNextPath(rawNext);
  const isInstructor = next.startsWith("/instructor");

  if (await getSessionUser()) {
    redirect(next);
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50 text-black">
      <header className="bg-black">
        <Link href="/" aria-label="SCS Learn home" className="inline-flex">
          <Image src="/brand/scs-learn-icon-red.png" alt="" width={56} height={56} className="h-14 w-14" priority />
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm border border-gray-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-primary">
            {isInstructor ? "Instructors" : "Students"}
          </p>
          <h1 className="mt-2 mb-1 font-brand text-3xl font-semibold">
            {isInstructor ? "Instructor sign in" : "Sign in"}
          </h1>
          <p className="mb-6 text-sm text-gray-600">
            {isInstructor
              ? "Use the email your department registered for instructor access. No password needed."
              : "New or returning, it's the same form. No password needed: we'll email you a link."}
          </p>
          <LoginForm
            next={next}
            initialError={error ? ERROR_MESSAGES[error] : undefined}
            devInstant={await isDevInstantSignIn()}
            showName={!isInstructor}
          />
          <p className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-600">
            {isInstructor ? (
              <>
                Taking a course?{" "}
                <Link href="/login?next=/student" className="font-semibold text-black underline underline-offset-4">
                  Student sign in
                </Link>
              </>
            ) : (
              <>
                Teaching a course?{" "}
                <Link href="/login?next=/instructor" className="font-semibold text-black underline underline-offset-4">
                  Instructor sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
