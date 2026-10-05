import Image from "next/image";
import Link from "next/link";
import Container from "./ui/Container";
import YouTubeIcon from "./ui/YouTubeIcon";
import { SCS_LEARN_YOUTUBE_URL } from "./links";

const COLUMNS = [
  {
    title: "Learn",
    links: [
      { label: "Courses", href: "#courses" },
      { label: "How it works", href: "#how-it-works" },
      { label: "FAQ", href: "#faq" },
      { label: "Lectures on YouTube", href: SCS_LEARN_YOUTUBE_URL },
    ],
  },
  {
    title: "Students",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "My courses", href: "/student" },
    ],
  },
  {
    title: "Instructors",
    links: [
      { label: "Instructor sign in", href: "/login?next=/instructor" },
      { label: "Instructor dashboard", href: "/instructor" },
    ],
  },
];

// cmu.edu's footer: the official mark beside plain link columns.
export default function Footer() {
  return (
    <footer className="bg-white text-black">
      <Container className="py-14">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="flex flex-col gap-5">
            <Image src="/brand/scs-learn-icon-red.png" alt="SCS Learn" width={88} height={88} className="h-22 w-22" />
            <Image
              src="/brand/scs-unitmark-color.png"
              alt="Carnegie Mellon University School of Computer Science"
              width={3833}
              height={686}
              className="h-10 w-auto"
            />
            <a
              href={SCS_LEARN_YOUTUBE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SCS Learn on YouTube"
              className="flex h-9 w-9 items-center justify-center border border-steel-gray text-black transition-colors hover:border-primary hover:bg-primary hover:text-white"
            >
              <YouTubeIcon className="h-4 w-4" />
            </a>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3 md:max-w-xl">
            {COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-3">
                <h3 className="font-sans text-sm font-bold">{col.title}</h3>
                {col.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    {...(link.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="link-swipe self-start text-sm text-iron-gray hover:text-black"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Container>

      <div className="border-t border-steel-gray px-6 py-4 text-center text-xs text-iron-gray">
        © {new Date().getFullYear()} Carnegie Mellon University. All rights reserved.
      </div>
    </footer>
  );
}
