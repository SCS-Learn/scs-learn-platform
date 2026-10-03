"use client";

import { useState, type CSSProperties } from "react";
import { Check, Mail, Video } from "lucide-react";

const GRID_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.14) 1px, transparent 1px)",
  backgroundSize: "2.5rem 2.5rem",
  backgroundPosition: "center",
  maskImage: "radial-gradient(ellipse at center, black 25%, transparent 75%)",
  WebkitMaskImage: "radial-gradient(ellipse at center, black 25%, transparent 75%)",
};

function FilledCheck({ className = "" }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-primary text-white ${className}`}>
      <Check size={12} strokeWidth={3.5} />
    </span>
  );
}

const STEPS = [
  {
    tab: "Sign up",
    title: "Sign up for free",
    description:
      "No application, no payment, no prerequisites. Just your email to reserve your spot.",
    points: ["Completely free", "No application or prerequisites", "Takes less than a minute"],
    cta: "Claim my spot",
    panel: "bg-primary",
    visual: (
      <div className="w-56 rounded-2xl bg-white p-4 text-left shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-2.5 rounded-full bg-gray-light px-3 py-2 text-sm text-iron-gray">
          <Mail size={16} />
          you@email.com
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <FilledCheck className="h-[18px] w-[18px]" />
          Spot reserved
        </div>
      </div>
    ),
  },
  {
    tab: "Join live",
    title: "Join your professor live",
    description:
      "Real sessions with the CMU faculty member teaching the course, answering your questions in real time.",
    points: [
      "Taught by the faculty who built the course",
      "Ask questions in real time",
      "Learn alongside other students",
    ],
    cta: "See the first course",
    panel: "bg-hornbostel-teal",
    visual: (
      <div className="w-56 overflow-hidden rounded-2xl bg-white text-left shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
        <div className="flex gap-3 p-3.5">
          <div className="flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-gray-light">
            <span className="text-[10px] font-bold uppercase leading-none tracking-wide text-primary">Sep</span>
            <span className="mt-0.5 text-lg font-semibold leading-none">21</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">06-204 Live</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-iron-gray">
              <Video size={12} className="shrink-0 text-primary" />
              7:00 – 8:00 PM ET
            </p>
            <p className="mt-0.5 truncate text-xs text-iron-gray">Phillip Compeau</p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-gray-light px-3.5 py-2 text-xs">
          <span className="text-iron-gray">Going?</span>
          <div className="flex gap-1">
            <span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-white">Yes</span>
            <span className="rounded-full border border-gray-light px-2 py-0.5 text-iron-gray">No</span>
            <span className="rounded-full border border-gray-light px-2 py-0.5 text-iron-gray">Maybe</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    tab: "AI tutor",
    title: "Learn with an AI tutor",
    description:
      "Trained on the course materials, it reviews your work, explains what went wrong, and what to try next.",
    points: [
      "Trained on the actual course materials",
      "Explains mistakes, not just answers",
      "Available whenever you're stuck",
    ],
    cta: "Meet the AI tutor",
    panel: "bg-weaver-blue",
    visual: (
      <div className="flex w-56 flex-col gap-2 text-left text-sm">
        <span className="self-end rounded-2xl rounded-br-md bg-white px-3.5 py-2">Why is my loop stuck?</span>
        <span className="self-start rounded-2xl rounded-bl-md bg-primary px-3.5 py-2 text-white">
          Check your stop condition on line 4.
        </span>
      </div>
    ),
  },
];

export default function HowItWorksSection() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <section className="bg-gray-light text-black font-text py-24 md:py-32">
      <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-16">
        <h2 className="max-w-[12em] font-display font-black leading-[0.95] tracking-[-0.02em] text-[2.5rem] sm:text-[3.5rem] lg:text-[4.5rem]">
          Here&apos;s how it works
        </h2>
        <p className="mt-5 max-w-3xl text-pretty text-lg leading-[1.55] text-iron-gray md:text-xl">
          Three steps from signing up to learning alongside Carnegie Mellon faculty.
        </p>

        <div
          role="tablist"
          aria-label="How it works steps"
          className="mt-10 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1.5 [scrollbar-width:none]"
        >
          {STEPS.map(({ tab }, i) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`how-tab-${i}`}
              aria-selected={i === active}
              aria-controls="how-panel"
              onClick={() => setActive(i)}
              className={`whitespace-nowrap rounded-full px-5 py-2.5 text-base font-medium transition-colors sm:px-8 lg:px-12 ${
                i === active ? "bg-black text-white" : "text-iron-gray hover:text-black"
              }`}
            >
              <span className="tabular-nums">{i + 1}.</span> {tab}
            </button>
          ))}
        </div>

        <div
          id="how-panel"
          role="tabpanel"
          aria-labelledby={`how-tab-${active}`}
          className="mt-4 grid grid-cols-1 overflow-hidden rounded-[2rem] bg-white md:grid-cols-2"
        >
          <div
            aria-hidden
            className={`relative isolate flex min-h-[22rem] items-center justify-center overflow-hidden rounded-[2rem] transition-colors duration-500 md:min-h-[30rem] ${step.panel}`}
          >
            <div className="absolute inset-0 -z-10" style={GRID_STYLE} />
            <div key={active} className="scale-110 sm:scale-125 lg:scale-[1.4]">
              {step.visual}
            </div>
          </div>

          <div className="flex flex-col justify-center px-8 py-12 sm:px-12 lg:px-16">
            <h3 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight md:text-[2.125rem]">
              {step.title}
            </h3>
            <p className="mt-4 max-w-md text-pretty text-lg leading-[1.55] text-iron-gray">{step.description}</p>
            <ul className="mt-7 flex flex-col gap-3">
              {step.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-base font-medium leading-snug md:text-[17px]">
                  <FilledCheck className="mt-px h-5 w-5" />
                  {point}
                </li>
              ))}
            </ul>
            <a
              href="#"
              className="mt-9 inline-flex items-center self-start whitespace-nowrap rounded-full bg-primary px-7 py-3 text-base font-medium text-white transition-colors hover:bg-primary-dark sm:text-lg"
            >
              {step.cta}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
