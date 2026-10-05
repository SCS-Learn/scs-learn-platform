import Image from "next/image";
import Link from "next/link";

const LINKS = [
  { label: "Courses", href: "#courses" },
  { label: "How it works", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
];

// Modeled on cmu.edu's header: black bar, a solid Carnegie Red block (here the
// official SCS Learn icon), the SCS unitmark, white links, and square outlined
// buttons. Brand assets are from the SCS Learn logo kit (public/brand/).
export default function NavBar() {
  return (
    <header className="bg-black text-white">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-stretch justify-between gap-4 pr-4 sm:pr-6 md:px-12 lg:px-16">
        <Link href="/" aria-label="SCS Learn home" className="flex shrink-0 items-center gap-4">
          <Image src="/brand/scs-learn-icon-red.png" alt="" width={64} height={64} priority className="h-16 w-16" />
          <Image
            src="/brand/scs-unitmark-white.png"
            alt="Carnegie Mellon University School of Computer Science"
            width={3833}
            height={686}
            priority
            className="hidden h-8 w-auto lg:block"
          />
        </Link>

        <div className="flex items-center gap-5 sm:gap-7">
          <nav className="hidden md:flex items-center gap-7">
            {LINKS.map(({ label, href }) => (
              <a key={label} href={href} className="link-swipe text-[15px] font-bold">
                {label}
              </a>
            ))}
            <Link href="/instructor" className="link-swipe text-[15px] font-bold">
              For instructors
            </Link>
          </nav>
          <Link
            href="/login"
            className="border border-white px-4 py-2 text-sm font-semibold transition-colors hover:bg-white hover:text-black"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
