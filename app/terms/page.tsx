import type { Metadata } from "next";

// Terms of use for CS Learn's YouTube publishing tool, the companion to
// app/privacy/page.tsx. The YouTube API Services audit asks for terms of
// service documentation; learn.cs.cmu.edu/terms is exempt from the domain
// redirect in next.config.ts so this page stays reachable.

export const metadata: Metadata = { title: "Terms of use" };

const LAST_UPDATED = "November 16, 2026";
const CONTACT_EMAIL = "pcompeau@andrew.cmu.edu";
const LINK = "text-[var(--color-primary)] underline";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-neutral-900">
      <h1 className="mb-2 text-3xl font-semibold">CS Learn terms of use</h1>
      <p className="mb-8 text-sm text-neutral-600">Last updated {LAST_UPDATED}</p>

      <section className="space-y-4">
        <p>
          These terms cover the CS Learn publishing tool, the internal application that staff of
          CS Learn, the open courseware program of the Kenneth C. Griffin School of Computer
          Science at Carnegie Mellon University, use to publish lectures on the CS Learn YouTube
          channel.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Who may use the tool</h2>
        <p>
          The tool is for CS Learn staff with Carnegie Mellon Google accounts who have been given
          access to the CS Learn channel. It is not offered, sold or distributed to anyone else.
        </p>

        <h2 className="pt-4 text-xl font-semibold">YouTube terms</h2>
        <p>
          The tool uses YouTube API Services. Anyone using it agrees to be bound by the{" "}
          <a className={LINK} href="https://www.youtube.com/t/terms">
            YouTube Terms of Service
          </a>{" "}
          and acknowledges the{" "}
          <a className={LINK} href="https://policies.google.com/privacy">
            Google Privacy Policy
          </a>
          . Videos published with the tool must follow YouTube&apos;s Community Guidelines and
          may only be lectures and related material that CS Learn has permission to publish.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Your data</h2>
        <p>
          How the tool handles data is described in the{" "}
          <a className={LINK} href="/privacy">
            CS Learn privacy policy
          </a>
          , including how to revoke the tool&apos;s access to a Google account.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Changes and contact</h2>
        <p>
          We may update these terms, and the date above shows the latest version. Questions go to
          Phillip Compeau, Carnegie Mellon University, at{" "}
          <a className={LINK} href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>
    </main>
  );
}
