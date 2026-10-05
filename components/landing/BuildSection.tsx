import type { ReactNode } from "react";
import { Award, Check, Code2, TrendingUp } from "lucide-react";

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">{children}</span>
  );
}

function ProjectGraphic() {
  return (
    <>
      <IconBadge>
        <Code2 size={22} />
      </IconBadge>
      <p className="mt-4 font-display text-2xl font-semibold leading-tight">Genome assembler</p>
      <p className="text-sm text-iron-gray">Submitted today at 10:21 AM</p>
      <p className="mt-6 font-display text-4xl font-bold tracking-tight">24/24 tests</p>
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
      <p className="font-display text-2xl font-semibold leading-tight">Runtime analysis</p>
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
      <p className="mt-4 font-display text-2xl font-semibold leading-tight">Your progress</p>
      <p className="text-sm text-iron-gray">Week 8 of 8</p>
      <div className="mt-5 h-2.5 rounded-full bg-primary" />
      <ul className="mt-6 flex flex-col gap-3.5">
        {milestones.map(({ week, title }) => (
          <li key={week} className="flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
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
      <p className="mt-4 font-display text-2xl font-semibold leading-tight">Certificate of completion</p>
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
      <span className="mt-6 inline-flex rounded-full border border-black px-5 py-2 text-sm font-medium">
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
    panel: "bg-hornbostel-teal",
    graphic: <FoundationsGraphic />,
  },
  {
    eyebrow: "Confidence",
    text: "Walk away knowing you can build what once felt out of reach.",
    panel: "bg-brick-beige",
    graphic: <ProgressGraphic />,
  },
  {
    eyebrow: "Portfolio",
    text: "Make room in your resume, your portfolio, and your modern computing skills to the table.",
    panel: "bg-weaver-blue",
    graphic: <PortfolioGraphic />,
  },
];

export default function BuildSection() {
  return (
    <section className="bg-white text-black font-text py-24 md:py-32">
      <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-16">
        <h2 className="mx-auto max-w-[14em] text-center font-display font-black leading-[0.95] tracking-[-0.02em] text-[2.5rem] sm:text-[3.5rem] lg:text-[4.5rem]">
          You&apos;ll learn how to build <span className="text-primary">and have the project to prove it.</span>
        </h2>

        <div className="mx-auto mt-16 flex max-w-6xl flex-col gap-20 lg:mt-24 lg:gap-28">
          {FEATURES.map(({ eyebrow, text, panel, graphic }, i) => (
            <div key={eyebrow} className="grid grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-16">
              <div className="md:col-span-5">
                <p className="text-sm font-medium uppercase tracking-[0.08em] text-iron-gray">{eyebrow}</p>
                <p className="mt-4 text-balance font-display text-[1.75rem] font-medium leading-[1.15] tracking-tight md:text-[2.125rem]">
                  {text}
                </p>
              </div>

              <div
                aria-hidden
                className={`relative flex h-[24rem] justify-center overflow-hidden rounded-[2rem] px-6 pt-12 md:col-span-7 md:h-[28rem] ${panel} ${
                  i % 2 === 1 ? "md:order-first" : ""
                }`}
              >
                <div className="h-full w-full max-w-sm overflow-hidden rounded-t-[1.75rem] bg-white p-7 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)]">
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
