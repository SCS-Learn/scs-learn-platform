import type { ReactNode } from "react";
import { Award, Check, Code2, TrendingUp } from "lucide-react";
import { eyebrow as eyebrowStyle, heading2, sectionPadding } from "./ui/typography";

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-11 w-11 items-center justify-center bg-primary text-white">{children}</span>
  );
}

function ProjectGraphic() {
  return (
    <>
      <IconBadge>
        <Code2 size={22} />
      </IconBadge>
      <p className="mt-4 font-brand text-2xl font-semibold leading-tight">Genome assembler</p>
      <p className="text-sm text-iron-gray">Submitted today at 10:21 AM</p>
      <p className="mt-6 font-brand text-4xl font-semibold">24/24 tests</p>
      <div className="my-6 h-px bg-steel-gray" />
      <p className="font-semibold">Autograder results</p>
      <ul className="mt-3 flex flex-col gap-2.5 text-[15px] font-medium">
        {["Builds and runs", "Handles edge cases", "Beats the reference runtime"].map((item) => (
          <li key={item} className="flex items-center gap-2.5">
            <Check size={18} className="text-primary" />
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}

function FoundationsGraphic() {
  const rows = [
    { label: "Brute force", value: "41.8 s", width: "100%", color: "bg-steel-gray" },
    { label: "Greedy", value: "9.3 s", width: "38%", color: "bg-gray-medium" },
    { label: "Dynamic programming", value: "0.4 s", width: "8%", color: "bg-primary" },
  ];
  return (
    <>
      <p className="font-brand text-2xl font-semibold leading-tight">Runtime analysis</p>
      <p className="text-sm text-iron-gray">Sequence alignment, n = 10,000</p>
      <ul className="mt-6 flex flex-col gap-5">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex items-center justify-between text-[15px] font-medium">
              <span>{row.label}</span>
              <span className="tabular-nums text-iron-gray">{row.value}</span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-gray-light">
              <div className={`h-full rounded-full ${row.color}`} style={{ width: row.width }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="my-6 h-px bg-steel-gray" />
      <div className="flex items-center justify-between text-[15px] font-medium">
        <span>Time complexity</span>
        <span className="font-mono text-primary">O(n·m)</span>
      </div>
    </>
  );
}

function ProgressGraphic() {
  const milestones = [
    { week: "Week 1", title: "Your first program" },
    { week: "Week 3", title: "Sorting algorithms" },
    { week: "Week 6", title: "Sequence alignment" },
    { week: "Week 8", title: "Final project" },
  ];
  return (
    <>
      <IconBadge>
        <TrendingUp size={22} />
      </IconBadge>
      <p className="mt-4 font-brand text-2xl font-semibold leading-tight">Your progress</p>
      <p className="text-sm text-iron-gray">Week 8 of 8</p>
      <div className="mt-5 h-2.5 rounded-full bg-primary" />
      <ul className="mt-6 flex flex-col gap-3.5">
        {milestones.map(({ week, title }) => (
          <li key={week} className="flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-primary text-white">
              <Check size={14} strokeWidth={3} />
            </span>
            <span className="text-[15px] font-medium">{title}</span>
            <span className="ml-auto text-sm text-iron-gray">{week}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function PortfolioGraphic() {
  return (
    <>
      <IconBadge>
        <Award size={22} />
      </IconBadge>
      <p className="mt-4 font-brand text-2xl font-semibold leading-tight">Certificate of completion</p>
      <p className="text-sm text-iron-gray">06-204 · Great Ideas in Computational Biology</p>
      <div className="my-6 h-px bg-steel-gray" />
      <p className="font-semibold">Your portfolio</p>
      <ul className="mt-3 flex flex-col gap-3 text-[15px] font-medium">
        {["Genome assembler", "Motif finder", "Phylogeny builder"].map((project) => (
          <li key={project} className="flex items-center justify-between">
            {project}
            <span className="text-sm text-primary underline underline-offset-4">View</span>
          </li>
        ))}
      </ul>
      <span className="mt-6 inline-flex border border-black px-5 py-2 text-sm font-semibold">
        Add to resume
      </span>
    </>
  );
}

const FEATURES = [
  {
    eyebrow: "Real projects",
    text: "Build real projects, not just quizzes.",
    panel: "bg-primary",
    graphic: <ProjectGraphic />,
  },
  {
    eyebrow: "Foundations",
    text: "Appreciate the computational and quantitative underpinnings of modern computing.",
    panel: "bg-black",
    graphic: <FoundationsGraphic />,
  },
  {
    eyebrow: "Confidence",
    text: "Walk away knowing you can build what once felt out of reach.",
    panel: "bg-gray-light",
    graphic: <ProgressGraphic />,
  },
  {
    eyebrow: "Portfolio",
    text: "Leave with work for your resume and portfolio, and the skills to back it up.",
    panel: "bg-black",
    graphic: <PortfolioGraphic />,
  },
];

export default function BuildSection() {
  return (
    <section className={`bg-white text-black ${sectionPadding}`}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 md:px-12 lg:px-16">
        <h2 className={`${heading2} max-w-3xl`}>You&apos;ll learn how to build, and have the project to prove it.</h2>

        <div className="mt-12 flex flex-col gap-14 lg:mt-16 lg:gap-20">
          {FEATURES.map(({ eyebrow, text, panel, graphic }, i) => (
            <div key={eyebrow} className="grid grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-16">
              <div className="md:col-span-5">
                <p className={eyebrowStyle}>{eyebrow}</p>
                <p className="mt-3 text-balance font-brand text-[1.75rem] font-semibold leading-[1.2] md:text-[2rem]">
                  {text}
                </p>
              </div>

              <div
                aria-hidden
                className={`relative flex h-[22rem] justify-center overflow-hidden px-6 pt-10 md:col-span-7 md:h-[25rem] ${panel} ${
                  i % 2 === 1 ? "md:order-first" : ""
                }`}
              >
                <div className="h-full w-full max-w-sm overflow-hidden border border-gray-200 border-b-0 bg-white p-7 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)]">
                  {graphic}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
