import Image from "next/image";
import Container from "./ui/Container";
import { sectionPadding } from "./ui/typography";

type Offering = {
  title: string;
  description: string;
  cta: string;
  href: string;
  image?: string;
  color?: string;
  wide?: boolean;
};

const OFFERINGS: Offering[] = [
  {
    title: "Watch full lectures on YouTube",
    description: "Free and open, whenever you want to learn — every lecture, from the professors who teach it.",
    cta: "Start watching",
    href: "#",
    image: "/landing/courses/classroom.jpg",
    wide: true,
  },
  {
    title: "Earn a CMU credential",
    description: "Go deeper with graded coursework and an official certificate through CMU Online.",
    cta: "Explore CMU Online",
    href: "#",
    color: "bg-primary",
  },
  {
    title: "Train your organization",
    description: "Bring Carnegie Mellon computer science to your team with SCS Executive Education.",
    cta: "Learn more",
    href: "#",
    color: "bg-weaver-blue",
  },
  {
    title: "Study on campus",
    description: "Join the School of Computer Science in Pittsburgh as a full-time student at Carnegie Mellon University.",
    cta: "Explore admissions",
    href: "#",
    image: "/hero-background.webp",
    wide: true,
  },
];

export default function OfferingsSection() {
  return (
    <section className={`bg-white text-black ${sectionPadding}`}>
      <Container>
        <h2 className="mx-auto mb-12 max-w-[12em] text-center font-display font-black leading-[0.95] tracking-[-0.02em] text-[2.5rem] sm:text-[3.5rem] lg:mb-16 lg:text-[4.5rem]">
          Ready for more?
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {OFFERINGS.map(({ title, description, cta, href, image, color, wide }) => (
            <a
              key={title}
              href={href}
              className={`group relative isolate flex min-h-[20rem] flex-col justify-end overflow-hidden rounded-[1.5rem] p-8 md:min-h-[22rem] md:p-10 ${
                wide ? "md:col-span-2" : ""
              } ${image ? "bg-black" : `${color} transition-[filter] hover:brightness-90`} text-white`}
            >
              {image && (
                <>
                  <Image
                    src={image}
                    alt=""
                    fill
                    sizes="(min-width: 48rem) 66vw, 100vw"
                    className="-z-20 object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/35"
                  />
                </>
              )}

              <h3 className="max-w-md text-balance font-display text-[2rem] font-semibold leading-[1.1] tracking-tight md:text-[1.875rem] xl:text-[2.375rem]">
                {title}
              </h3>
              <p className="mt-4 max-w-md text-[17px] leading-relaxed text-white/85 md:text-lg">
                {description}{" "}
                <span className="whitespace-nowrap font-semibold text-white underline underline-offset-4">
                  {cta}.
                </span>
              </p>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}
