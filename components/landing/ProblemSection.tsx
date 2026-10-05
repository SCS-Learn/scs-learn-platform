import { X } from "lucide-react";
import Container from "./ui/Container";
import { heading2, sectionPadding } from "./ui/typography";

const ISSUES = [
  { text: "A degree that you may not have", emphasis: "time", suffix: "for" },
  { text: "A bootcamp you cannot justify the", emphasis: "price", suffix: "of" },
  { text: "Free material to work through", emphasis: "on your own", suffix: "" },
];

export default function ProblemSection() {
  return (
    <section className={`bg-black text-white ${sectionPadding}`}>
      <Container>
        <h2 className={`${heading2} max-w-3xl mb-16`}>
          The world is undergoing a computational revolution, and your learning options are...
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
          {ISSUES.map(({ text, emphasis, suffix }) => (
            <div key={emphasis} className="flex gap-3">
              <X className="text-primary shrink-0" />
              <p className="text-2xl text-gray-400">
                {text} <strong className="text-gray-400">{emphasis}</strong> {suffix}
              </p>
            </div>
          ))}
        </div>

        <p className={heading2}>It doesn&apos;t have to be that way.</p>
      </Container>
    </section>
  );
}
