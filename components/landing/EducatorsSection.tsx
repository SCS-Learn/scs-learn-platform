import { User } from "lucide-react";
import Container from "./ui/Container";
import Card from "./ui/Card";
import { TextLink } from "./ui/Button";
import { heading2, sectionPadding } from "./ui/typography";

const EDUCATORS = [
  {
    name: "Phillip Compeau",
    title: "Teaching Professor, Computational Biology",
  },
  {
    name: "Instructor name",
    title: "Course title, Department",
  },
  {
    name: "Instructor name",
    title: "Course title, Department",
  },
];

export default function EducatorsSection() {
  return (
    <section className={`bg-gray-light text-black ${sectionPadding}`}>
      <Container>
        <h2 className={`${heading2} mb-4`}>Taught by world leading Carnegie Mellon educators.</h2>
        <p className="text-iron-gray max-w-2xl mb-16">
          The professors who built the course teach it — live, in every session.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {EDUCATORS.map(({ name, title }, i) => (
            <Card key={i} className="p-8 flex flex-col items-center text-center gap-3">
              <div className="w-24 h-24 rounded-full bg-gray-light flex items-center justify-center">
                <User className="text-gray-medium" size={36} />
              </div>
              <h3 className="font-semibold">{name}</h3>
              <p className="text-sm text-iron-gray">{title}</p>
              <TextLink href="#">Register for the course</TextLink>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
