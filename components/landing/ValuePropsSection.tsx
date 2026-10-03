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
      "No application, no payment, and no prerequisites. Just sign up with your email to save your spot.",
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
    <section className="bg-black text-white font-text py-24 md:py-36">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-14 px-6 md:grid-cols-3 md:gap-8 md:px-12 lg:gap-10 lg:px-16">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div key={title}>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 lg:h-20 lg:w-20">
              <Icon strokeWidth={2} className="h-7 w-7 text-white lg:h-9 lg:w-9" />
            </div>
            <h3 className="mt-6 text-balance text-xl font-bold leading-[1.4] lg:text-[22px]">{title}</h3>
            <p className="mt-2 text-pretty text-lg leading-[1.5] text-white/70 lg:text-xl">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
