const LINKS = [
  { label: "How it works", href: "#" },
  { label: "For educators", href: "#" },
  { label: "FAQ", href: "#" },
];

export default function NavBar() {
  return (
    <header className="bg-white text-black font-text">
      <div className="flex h-20 w-full items-center justify-between gap-6 px-6 md:px-12 lg:px-16 xl:px-24">
        <div className="flex items-center gap-6">
          <a
            href="#"
            aria-label="SCS Learn home"
            className="shrink-0 whitespace-nowrap rounded-lg bg-gray-light px-4 py-2.5 font-display text-lg font-extrabold leading-none tracking-[-0.02em]"
          >
            SCS <span className="text-primary">Learn</span>
          </a>

          <nav className="hidden lg:flex items-center">
            {LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="rounded-full px-4 py-2 text-lg font-medium text-black hover:bg-primary/[0.08] transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="#"
            className="hidden sm:inline-flex items-center rounded-full px-4 py-2 text-lg font-medium text-black underline underline-offset-4"
          >
            I&apos;m a student
          </a>
          <a
            href="#"
            className="inline-flex items-center whitespace-nowrap rounded-full bg-primary px-4 py-2 text-base sm:text-lg font-medium text-white hover:bg-primary-dark transition-colors"
          >
            I&apos;m an instructor
          </a>
        </div>
      </div>
    </header>
  );
}
