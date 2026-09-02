import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";

export default function StudentHeader({
  backHref,
  backLabel,
  learnerName,
}: {
  backHref?: string;
  backLabel?: string;
  learnerName?: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <Link href="/student" className="text-lg font-serif font-bold">
          SCS <span className="text-primary">Learn</span>
        </Link>
        <span className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 rounded px-2 py-1">
          <User size={12} />
          {learnerName ?? "Student"}
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
