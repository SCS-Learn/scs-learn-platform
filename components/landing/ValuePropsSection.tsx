import { DollarSign, Bot, Award } from "lucide-react";

const FEATURES = [
  {
    icon: Bot,
    title: "AI tutor",
    description:
      "A tutor trained on your course, ready whenever you are. It reviews your work and helps you get unstuck.",
  },
  {
    icon: DollarSign,
    title: "Completely free",
    description:
      "No application, no payment, and no prerequisites. Just sign in with your email to get started.",
  },
  {
    icon: Award,
    title: "Certificates",
    description:
      "Earn a certificate to show what you've learned. Add it to your resume or share it on LinkedIn.",
  },
];

export default function ValuePropsSection() {
  return (
    <section className="bg-black text-white py-16 md:py-20">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 px-4 sm:px-6 md:grid-cols-3 md:gap-10 md:px-12 lg:px-16">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div key={title}>
            <div className="flex h-12 w-12 items-center justify-center bg-primary">
              <Icon strokeWidth={1.75} className="h-6 w-6 text-white" />
            </div>
            <h3 className="mt-5 font-brand text-2xl font-semibold">{title}</h3>
            <p className="mt-2 text-pretty text-base leading-relaxed text-white/75">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
