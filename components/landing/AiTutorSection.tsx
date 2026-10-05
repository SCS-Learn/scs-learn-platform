import { MessageCircle, ClipboardCheck } from "lucide-react";
import Container from "./ui/Container";
import Button from "./ui/Button";
import { heading2, sectionPadding } from "./ui/typography";

const PREVIEWS = [
  {
    icon: MessageCircle,
    caption: "Ask anything, anytime — get an explanation grounded in your course's material.",
  },
  {
    icon: ClipboardCheck,
    caption: "Get a specific explanation of what you got wrong, and what to review next.",
  },
];

export default function AiTutorSection() {
  return (
    <section className={`bg-white text-black ${sectionPadding}`}>
      <Container>
        <h2 className={`${heading2} mb-4`}>Your AI tutor, trained on the course itself.</h2>
        <p className="text-iron-gray max-w-2xl mb-16">
          It&apos;s built using each course&apos;s material, past assignments, and lectures, so it knows
          every concept covered in the course.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {PREVIEWS.map(({ icon: Icon, caption }) => (
            <div key={caption} className="flex flex-col gap-3">
              <div className="w-full aspect-video bg-gray-light border border-steel-gray flex items-center justify-center">
                <Icon className="text-primary" size={40} />
              </div>
              <p className="text-sm text-iron-gray italic">{caption}</p>
            </div>
          ))}
        </div>

        <div className="bg-primary text-white p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <p className="max-w-xl">
            Try the AI tutor for free, then pay for deeper access and a certificate. The course and
            lectures stay free either way.
          </p>
          <Button href="#" variant="outlineInverse" className="shrink-0">
            Get early access →
          </Button>
        </div>
      </Container>
    </section>
  );
}
