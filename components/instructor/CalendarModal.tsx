"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import CalendarView from "@/components/instructor/CalendarView";
import type { CalendarEvent } from "@/lib/instructor/mock-data";

export default function CalendarModal({
  events,
  onClose,
}: {
  events: CalendarEvent[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-black rounded-md shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
      >
        <CalendarView events={events} onClose={onClose} />
      </div>
    </div>,
    document.body
  );
}
