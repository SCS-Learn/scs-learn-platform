"use client";

import type { ReactNode } from "react";

/** Flowing question stem — text and inline controls on the same line(s). */
export function InlineStem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-sm font-medium leading-relaxed whitespace-pre-wrap ${className}`}
    >
      {children}
    </p>
  );
}

export function inlineTextInputClass(disabled: boolean): string {
  return `inline-block align-baseline min-w-[5rem] max-w-[12rem] mx-0.5 px-2 py-0.5 text-sm font-normal border border-gray-300 bg-white outline-none focus:border-primary/50 ${
    disabled ? "text-gray-700" : ""
  }`;
}

export function inlineSelectClass(disabled: boolean): string {
  return `inline-block align-baseline max-w-full mx-0.5 px-1.5 py-0.5 text-sm font-normal border border-gray-300 bg-white outline-none focus:border-primary/50 ${
    disabled ? "text-gray-700" : ""
  }`;
}
