import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getCurrentLearner } from "@/lib/lti/config";
import { safeNextPath } from "@/lib/auth/redirect";
import { isDevInstantSignIn } from "@/lib/auth/actions";

const ERROR_MESSAGES: Record<string, string> = {
  link_invalid: "That sign-in link is invalid or has expired. Request a new one below.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNextPath(rawNext);

  if (await getCurrentLearner()) {
    redirect(next);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-black">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-serif font-bold">
          SCS <span className="text-primary">Learn</span>
        </p>
        <h1 className="mt-4 mb-1 text-2xl font-serif font-bold">Sign in</h1>
        <p className="mb-6 text-sm text-gray-600">No password needed: we&apos;ll email you a link.</p>
        <LoginForm
          next={next}
          initialError={error ? ERROR_MESSAGES[error] : undefined}
          devInstant={await isDevInstantSignIn()}
        />
      </div>
    </main>
  );
}
