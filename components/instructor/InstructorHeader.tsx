import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";

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
        <Link href="/instructor" className="text-lg font-serif font-bold">
          SCS <span className="text-primary">Learn</span>
        </Link>
        <span className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 rounded px-2 py-1">
          <GraduationCap size={12} />
          Instructor
        </span>
      </div>

      {backHref && (
        <Link
          href={backHref}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-black"
        >
          <ArrowLeft size={15} />
          {backLabel ?? "Back"}
        </Link>
      )}
    </header>
  );
}
