"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ChevronDown, GraduationCap, LogOut, UserRound, BookOpen } from "lucide-react";
import { signOut } from "@/lib/auth/actions";

export default function AppHeaderBar({
  mode,
  name,
  initials,
  email,
  isInstructor,
  backHref,
  backLabel,
}: {
  mode: "learning" | "teaching" | "account";
  name: string;
  initials: string;
  email: string | null;
  isInstructor: boolean;
  backHref?: string;
  backLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Student and instructor are deliberately separate experiences: no shared
  // tabs, and the bar only ever offers the current side's links. An account
  // that is both gets one "switch view" entry, tucked in the avatar menu.
  const isTeaching = mode === "teaching";
  const home = isTeaching ? "/instructor" : "/student";

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
        <Link href={home} className="flex shrink-0 items-center gap-2.5">
          <Image src="/brand/scs-learn-icon-red.png" alt="" width={32} height={32} className="h-8 w-8 rounded-md" />
          <span className="hidden text-[15px] font-bold tracking-tight sm:inline">SCS Learn</span>
        </Link>

        {isTeaching && (
          <span className="flex items-center gap-1 rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white">
            <GraduationCap size={13} />
            Instructor
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {backHref && (
            <Link
              href={backHref}
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 hover:text-black sm:flex"
            >
              <ArrowLeft size={15} />
              {backLabel ?? "Back"}
            </Link>
          )}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 hover:bg-gray-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {initials}
              </span>
              <ChevronDown size={14} className="text-gray-500" />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
              >
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  {email && <p className="truncate text-xs text-gray-500">{email}</p>}
                </div>
                <MenuLink href="/account" icon={<UserRound size={15} />} label="Account" />
                {isTeaching ? (
                  <MenuLink href="/instructor" icon={<GraduationCap size={15} />} label="My courses" />
                ) : (
                  <MenuLink href="/student" icon={<BookOpen size={15} />} label="My learning" />
                )}
                {isInstructor && (
                  <div className="mt-1 border-t border-gray-100 pt-1">
                    {isTeaching ? (
                      <MenuLink href="/student" icon={<BookOpen size={15} />} label="Switch to student view" />
                    ) : (
                      <MenuLink href="/instructor" icon={<GraduationCap size={15} />} label="Switch to instructor view" />
                    )}
                  </div>
                )}
                <form action={signOut} className="border-t border-gray-100 mt-1 pt-1">
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <LogOut size={15} className="text-gray-400" />
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} role="menuitem" className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
      <span className="text-gray-400">{icon}</span>
      {label}
    </Link>
  );
}
