import Image from "next/image";
import Container from "./ui/Container";
import { heading2, sectionPadding } from "./ui/typography";
import { SCS_LEARN_YOUTUBE_URL } from "./links";
import YouTubeIcon from "./ui/YouTubeIcon";

type Offering = {
  title: string;
  description: string;
  cta: string;
  /** Null until the real destination is known - the card renders without a link instead of a dead "#". */
  href: string | null;
  image?: string;
  color?: string;
  wide?: boolean;
};

const OFFERINGS: Offering[] = [
  {
    title: "Watch full lectures on YouTube",
    description: "Free and open, whenever you want to learn - every lecture, from the professors who teach it.",
    cta: "Start watching",
    href: SCS_LEARN_YOUTUBE_URL,
    image: "/landing/courses/classroom.jpg",
    wide: true,
  },
  {
    title: "Earn a CMU credential",
    description: "Go deeper with graded coursework and an official certificate through CMU Online.",
    cta: "Explore CMU Online",
    href: null,
    color: "bg-primary",
  },
  {
    title: "Train your organization",
    description: "Bring Carnegie Mellon computer science to your team with SCS Executive Education.",
    cta: "Learn more",
    href: null,
    color: "bg-black",
  },
  {
    title: "Study on campus",
    description: "Join the School of Computer Science in Pittsburgh as a full-time student at Carnegie Mellon University.",
    cta: "Explore admissions",
    href: null,
    image: "/landing/courses/workshop.jpg",
    wide: true,
  },
];

export default function OfferingsSection() {
  return (
    <section className={`bg-white text-black ${sectionPadding}`}>
      <Container>
        <h2 className={`${heading2} reveal mb-10`}>Ready for more?</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {OFFERINGS.map(({ title, description, cta, href, image, color, wide }, i) => {
            const isYouTube = href === SCS_LEARN_YOUTUBE_URL;
            const className = `reveal group relative isolate flex min-h-[18rem] flex-col justify-end overflow-hidden p-8 text-white md:min-h-[20rem] md:p-10 ${
              wide ? "md:col-span-2" : ""
            } ${image ? "bg-black" : color}`;
            const content = (
              <>
                {image && (
                  <>
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes="(min-width: 48rem) 66vw, 100vw"
                      className="-z-20 object-cover transition-transform duration-[3s] ease-out group-hover:scale-110"
                    />
                    <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/30" />
                  </>
                )}
                {isYouTube && <YouTubeIcon className="mb-4 h-9 w-9 text-white" />}
                <h3 className="max-w-md text-balance font-brand text-[1.875rem] font-semibold leading-[1.15] xl:text-[2.25rem]">
                  {title}
                </h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-white/85">
                  {description}
                  {href && (
                    <>
                      {" "}
                      <span className="whitespace-nowrap font-semibold text-white underline underline-offset-4">{cta}.</span>
                    </>
                  )}
                </p>
              </>
            );
            return href ? (
              <a
                key={title}
                href={href}
                target={isYouTube ? "_blank" : undefined}
                rel={isYouTube ? "noopener noreferrer" : undefined}
                className={className}
                style={{ "--reveal-delay": `${i * 100}ms` } as React.CSSProperties}
              >
                {content}
              </a>
            ) : (
              <div key={title} className={className} style={{ "--reveal-delay": `${i * 100}ms` } as React.CSSProperties}>
                {content}
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
