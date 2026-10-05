import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * cmu.edu's call-to-action: a solid Carnegie Red square holding an arrow,
 * fused to a bordered label. On hover the red wipes up through the label (as
 * cmu.edu's .Button:before does) and the arrow nudges out. `tone` is the
 * background it sits on.
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
  return (
    <Link href={href} className={`group inline-flex items-stretch text-sm font-semibold ${className}`}>
      <span className="flex w-11 shrink-0 items-center justify-center overflow-hidden bg-primary text-white">
        <ArrowUpRight
          size={22}
          strokeWidth={1.75}
          className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      </span>
      <span
        className={`relative isolate flex items-center overflow-hidden border border-l-0 border-primary px-5 py-3 transition-colors duration-200 group-hover:text-white before:absolute before:inset-0 before:-z-10 before:translate-y-full before:bg-primary before:transition-transform before:duration-200 group-hover:before:translate-y-0 ${
          tone === "dark" ? "text-white" : "text-black"
        }`}
      >
        {children}
      </span>
    </Link>
  );
}
