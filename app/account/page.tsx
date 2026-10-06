import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, GraduationCap, User } from "lucide-react";
import AppHeader from "@/components/app/AppHeader";
import { card } from "@/components/app/ui";
import ProfileNameForm from "@/components/auth/ProfileNameForm";
import PasswordForm from "@/components/auth/PasswordForm";
import { displayNameFor, getSessionUser } from "@/lib/auth/session";
import { getCurrentInstructor } from "@/lib/instructor/data/current-instructor";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");
  const instructor = await getCurrentInstructor();
  const name = instructor?.name ?? displayNameFor(user);

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <AppHeader mode="account" />

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        <div>
          <p className="text-xs font-bold tracking-wide text-primary mb-1">ACCOUNT</p>
          <h1 className="text-3xl font-serif font-semibold">{name}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>

        <section className={`${card} p-5`}>
          <h2 className="text-sm font-bold mb-4">Profile</h2>
          <ProfileNameForm initialName={name} />
          <p className="mt-5 text-xs font-bold text-gray-600">Email</p>
          <p className="text-sm">{user.email}</p>
        </section>

        <section className={`${card} p-5`}>
          <h2 className="text-sm font-bold mb-1">Password</h2>
          <p className="mb-4 text-xs text-gray-500">
            Set one to sign in with your email and password - no waiting for an emailed link.
          </p>
          <PasswordForm />
        </section>

        <section className={`${card} p-5`}>
          <h2 className="text-sm font-bold mb-4">Your dashboards</h2>
          <ul className="flex flex-col divide-y divide-gray-100">
            <li>
              <Link href="/student" className="flex items-center gap-3 py-3 text-sm hover:text-primary">
                <User size={16} className="text-gray-400" />
                <span className="flex-1">
                  <span className="font-bold">Student</span>
                  <span className="block text-xs text-gray-500">Your courses and progress</span>
                </span>
                <ArrowRight size={15} />
              </Link>
            </li>
            {instructor ? (
              <li>
                <Link href="/instructor" className="flex items-center gap-3 py-3 text-sm hover:text-primary">
                  <GraduationCap size={16} className="text-gray-400" />
                  <span className="flex-1">
                    <span className="font-bold">Instructor</span>
                    <span className="block text-xs text-gray-500">Courses you teach</span>
                  </span>
                  <ArrowRight size={15} />
                </Link>
              </li>
            ) : (
              <li className="py-3 text-xs text-gray-500">
                Teaching a course? Instructor access is granted by email.{" "}
                <Link href="/instructor-access" className="underline underline-offset-2 hover:text-black">
                  How to get it
                </Link>
              </li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
