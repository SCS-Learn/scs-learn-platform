"use client";

import { useState, type CSSProperties } from "react";
import { Check, CirclePlay, Code2, FileText, ListChecks, Mail, type LucideIcon } from "lucide-react";
import CmuLink from "./ui/CmuLink";
import { heading2, sectionPadding } from "./ui/typography";

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
    <span className={`flex shrink-0 items-center justify-center bg-primary text-white ${className}`}>
      <Check size={12} strokeWidth={3.5} />
    </span>
  );
}

type Feature = { icon: LucideIcon; title: string; text: string };

type Step = {
  tab: string;
  title: string;
  description: string;
  /** Plain check-mark list... */
  points?: string[];
  /** ...or an icon + title + one-liner feature list (the "what's included" step). */
  features?: Feature[];
  cta: string;
  href: string;
  panel: string;
  visual: React.ReactNode;
};

// What a course actually comes with on SCS Learn - each maps to something the
// platform delivers: YouTube lectures, lesson notes / slide decks, autograded
// Cogniterra + Autolab assignments, and in-app quizzes (incl. AI-graded free response).
const COURSE_RESOURCES: (Feature & { count: string })[] = [
  { icon: CirclePlay, title: "Watch the full lectures", text: "Every lecture from the course, recorded and free to rewatch.", count: "Lectures" },
  { icon: FileText, title: "Read the notes and slides", text: "The same lecture notes and slide decks CMU students use.", count: "Notes & slides" },
  { icon: Code2, title: "Do real coursework", text: "Programming assignments, autograded the moment you submit.", count: "Assignments" },
  { icon: ListChecks, title: "Check yourself with quizzes", text: "Instant feedback, including written answers graded by AI.", count: "Quizzes" },
];

const STEPS: Step[] = [
  {
    tab: "Sign in",
    title: "Sign in for free",
    description: "No application, no payment, no prerequisites. Just your email, and you're in.",
    points: ["Completely free", "No application or prerequisites", "Takes less than a minute"],
    cta: "Start learning",
    href: "/student",
    panel: "bg-primary",
    visual: (
      <div className="w-56  bg-white p-4 text-left shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-2.5 bg-gray-light px-3 py-2 text-sm text-iron-gray">
          <Mail size={16} />
          you@email.com
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <FilledCheck className="h-[18px] w-[18px]" />
          Signed in
        </div>
      </div>
    ),
  },
  {
    tab: "What's included",
    title: "Everything the course gives its own students",
    description:
      "Not a trimmed-down MOOC. You work through the real course, at your own pace, with the same materials Carnegie Mellon students get.",
    features: COURSE_RESOURCES,
    cta: "See the courses",
    href: "#courses",
    panel: "bg-black",
    visual: (
      <div className="w-56 bg-white text-left shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
        <div className="border-b border-gray-light px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-primary">06-204</p>
          <p className="text-sm font-semibold leading-tight">Course contents</p>
        </div>
        <ul className="flex flex-col py-1.5">
          {COURSE_RESOURCES.map(({ icon: Icon, count }) => (
            <li key={count} className="flex items-center gap-2.5 px-3.5 py-1.5 text-xs font-medium">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-primary text-white">
                <Icon size={12} strokeWidth={2.5} />
              </span>
              {count}
              <Check size={13} strokeWidth={3} className="ml-auto text-primary" />
            </li>
          ))}
        </ul>
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
    href: "/student",
    panel: "bg-[#222]",
    visual: (
      <div className="flex w-56 flex-col gap-2 text-left text-sm">
        <span className="self-end  bg-white px-3.5 py-2">Why is my loop stuck?</span>
        <span className="self-start  bg-primary px-3.5 py-2 text-white">
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
    <section id="how-it-works" className={`scroll-mt-4 bg-gray-light text-black ${sectionPadding}`}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 md:px-12 lg:px-16">
        <h2 className={`${heading2} reveal`}>Here&apos;s how it works</h2>
        <p className="reveal mt-4 max-w-3xl text-pretty text-lg leading-relaxed text-iron-gray">
          Three steps from signing in to working through a real Carnegie Mellon course.
        </p>

        <div
          role="tablist"
          aria-label="How it works steps"
          className="reveal mt-10 flex max-w-full gap-6 overflow-x-auto border-b border-steel-gray [scrollbar-width:none] sm:gap-10"
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
              className={`-mb-px whitespace-nowrap border-b-4 pb-3 pt-1 text-base font-semibold transition-colors ${
                i === active ? "border-primary text-black" : "border-transparent text-iron-gray hover:text-black"
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
          className="reveal mt-8 grid grid-cols-1 overflow-hidden bg-white md:grid-cols-2"
        >
          <div
            aria-hidden
            className={`relative isolate flex min-h-[20rem] items-center justify-center overflow-hidden transition-colors duration-500 md:min-h-[26rem] ${step.panel}`}
          >
            <div className="absolute inset-0 -z-10" style={GRID_STYLE} />
            <div key={active} className="scale-110 sm:scale-125 lg:scale-[1.4]">
              <div className="animate-fade-in-up">
                {step.visual}
              </div>
            </div>
          </div>

          <div key={active} className="flex animate-fade-in flex-col justify-center px-8 py-12 [animation-duration:400ms] sm:px-12 lg:px-16">
            <h3 className="font-brand text-[1.75rem] font-semibold leading-[1.2] md:text-[2rem]">
              {step.title}
            </h3>
            <p className="mt-4 max-w-md text-pretty text-lg leading-[1.55] text-iron-gray">{step.description}</p>
            {step.features ? (
              <ul className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2">
                {step.features.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-white">
                      <Icon size={18} strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-base font-semibold leading-snug">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-iron-gray">{text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-7 flex flex-col gap-3">
                {step.points?.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-base font-medium leading-snug md:text-[17px]">
                    <FilledCheck className="mt-px h-5 w-5" />
                    {point}
                  </li>
                ))}
              </ul>
            )}
            <CmuLink href={step.href} className="mt-9 self-start">
              {step.cta}
            </CmuLink>
          </div>
        </div>
      </div>
    </section>
  );
}
