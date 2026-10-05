import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * cmu.edu's call-to-action: a solid Carnegie Red square holding an arrow,
 * fused to a bordered label. `tone` is the background it sits on.
 */
export default function CmuLink({
  href,
  children,
  tone = "light",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  const label =
    tone === "dark"
      ? "border-primary text-white group-hover:bg-primary"
      : "border-primary text-black group-hover:bg-primary group-hover:text-white";
  return (
    <Link href={href} className={`group inline-flex items-stretch text-sm font-semibold ${className}`}>
      <span className="flex w-11 shrink-0 items-center justify-center bg-primary text-white">
        <ArrowUpRight size={22} strokeWidth={1.75} />
      </span>
      <span className={`flex items-center border border-l-0 px-5 py-3 transition-colors ${label}`}>{children}</span>
    </Link>
  );
}
