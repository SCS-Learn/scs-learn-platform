"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Container from "./ui/Container";

export default function AnnouncementBar() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="sticky top-0 z-50 bg-primary text-white text-xs md:text-sm">
      <Container className="flex items-center justify-center py-2 text-center">
        <span>
          Free live session with Prof. Compeau — Aug 16, 10:00 AM ET.{" "}
          <a href="#" className="underline decoration-1 underline-offset-4 font-semibold">
            Save your spot →
          </a>
        </span>
        <button
          onClick={() => setVisible(false)}
          aria-label="Dismiss announcement"
          className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 opacity-80 hover:opacity-100"
        >
          <X size={14} />
        </button>
      </Container>
    </div>
  );
}
