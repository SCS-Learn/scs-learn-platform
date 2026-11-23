import type { Metadata } from "next";
import Link from "next/link";

// The preview card for learn.cs.cmu.edu/give. People never see this page:
// next.config.ts redirects them straight to the giving form. Link-preview
// crawlers (LinkedIn, Slack, iMessage and the rest) are let through to here
// instead, so a shared /give link shows a CS Learn card and not the giving
// form's own cropped university wordmark. The card image is
// public/og/give-card.jpg (1200x627).

const TITLE = "Give to CS Learn";
const DESCRIPTION =
  "Free Carnegie Mellon computer science courses, open to everyone. Your gift to the Computing Education Innovation Fund helps bring more of them to learners everywhere.";
const CARD_IMAGE = { url: "/og/give-card.jpg", width: 1200, height: 627, alt: TITLE };

export const metadata: Metadata = {
  metadataBase: new URL("https://learn.cs.cmu.edu"),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "CS Learn",
    title: TITLE,
    description: DESCRIPTION,
    images: [CARD_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [CARD_IMAGE.url],
  },
  robots: { index: false },
};

type GivePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Rebuilds the visitor's query string so tracking tags survive the hop to /give. */
function buildQueryString(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      query.append(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
    }
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export default async function GivePage({ searchParams }: GivePageProps) {
  // A person only lands here if their browser looks like a preview crawler.
  // The link below goes back through /give, which redirects a real browser.
  const giveHref = `/give${buildQueryString(await searchParams)}`;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 text-neutral-900">
      <h1 className="mb-4 text-3xl font-semibold">{TITLE}</h1>
      <p className="mb-8 text-[17px] leading-relaxed">{DESCRIPTION}</p>
      <Link
        href={giveHref}
        prefetch={false}
        className="inline-block rounded-md bg-[#C41230] px-5 py-3 font-semibold text-white"
      >
        Continue to the giving form
      </Link>
    </main>
  );
}
