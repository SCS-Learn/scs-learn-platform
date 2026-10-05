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
    <main className="grid min-h-screen bg-white text-black lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel (desktop): the landing page's campus photo + CMU unitmark. */}
      <section className="relative isolate hidden flex-col justify-between overflow-hidden bg-black p-10 text-white lg:flex xl:p-14">
        <Image src="/hero-background.webp" alt="" fill priority unoptimized sizes="55vw" className="-z-20 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/55 to-black/40" />
        <Link href="/" aria-label="SCS Learn home" className="flex items-center gap-4">
          <Image src="/brand/scs-learn-icon-red.png" alt="" width={56} height={56} className="h-14 w-14 rounded-lg" />
          <Image
            src="/brand/scs-unitmark-white.png"
            alt="Carnegie Mellon University School of Computer Science"
            width={3833}
            height={686}
            className="h-9 w-auto"
          />
        </Link>
        <div className="max-w-md">
          <p className="font-serif text-4xl font-semibold leading-tight">Take real Carnegie Mellon courses.</p>
          <p className="mt-4 text-base leading-relaxed text-white/80">
            Lectures, notes, autograded coursework and quizzes from the Griffin School of Computer Science.
          </p>
        </div>
      </section>

      <section className="flex flex-col">
        {/* Slim brand bar (mobile/tablet only - the photo panel covers it on desktop). */}
        <header className="flex items-center gap-3 border-b border-gray-200 px-5 py-3 lg:hidden">
          <Link href="/" aria-label="SCS Learn home" className="flex items-center gap-2.5">
            <Image src="/brand/scs-learn-icon-red.png" alt="" width={36} height={36} className="h-9 w-9 rounded-md" priority />
            <span className="text-[15px] font-bold tracking-tight">SCS Learn</span>
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
          <div className="w-full max-w-sm">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-primary">
              {isInstructor ? "Instructors" : "Students"}
            </p>
            <h1 className="mt-2 font-serif text-4xl font-semibold">{isInstructor ? "Instructor sign in" : "Sign in"}</h1>
            <p className="mt-2 mb-8 text-sm leading-relaxed text-gray-600">
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
            <p className="mt-8 border-t border-gray-100 pt-5 text-sm text-gray-600">
              {isInstructor ? (
                <>
                  Taking a course?{" "}
                  <Link href="/login?next=/student" className="font-semibold text-primary hover:underline">
                    Student sign in
                  </Link>
                </>
              ) : (
                <>
                  Teaching a course?{" "}
                  <Link href="/login?next=/instructor" className="font-semibold text-primary hover:underline">
                    Instructor sign in
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
