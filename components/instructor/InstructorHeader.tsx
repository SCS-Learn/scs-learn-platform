import Link from "next/link";
import { ArrowLeft, GraduationCap, LogOut, UserRound } from "lucide-react";
import { signOut } from "@/lib/auth/actions";

export default function InstructorHeader({
  backHref,
  backLabel,
}: {
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <Link href="/instructor" className="text-lg font-serif font-bold text-black">
          SCS Learn
        </Link>
        <span className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 rounded px-2 py-1">
          <GraduationCap size={12} />
          Instructor
        </span>
      </div>

      <div className="flex items-center gap-4">
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-black"
          >
            <ArrowLeft size={15} />
            {backLabel ?? "Back"}
          </Link>
        )}
        <Link href="/account" className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-black">
          <UserRound size={15} />
          Account
        </Link>
        <form action={signOut}>
          <button type="submit" className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-black">
            <LogOut size={15} />
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
