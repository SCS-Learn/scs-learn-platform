import type { Metadata } from "next";

// The privacy policy for CS Learn's YouTube publishing tool. Google's OAuth
// consent screen and the YouTube API Services audit both require a public
// privacy policy URL, and YouTube's Developer Policies require it to cover the
// points below (use of YouTube API Services, links to the YouTube Terms of
// Service and Google Privacy Policy, what we access, store and share, and how
// to revoke access). learn.cs.cmu.edu/privacy is exempt from the domain
// redirect in next.config.ts so this page stays reachable.

export const metadata: Metadata = { title: "Privacy policy" };

const LAST_UPDATED = "November 16, 2026";
const CONTACT_EMAIL = "pcompeau@andrew.cmu.edu";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-neutral-900">
      <h1 className="mb-2 text-3xl font-semibold">CS Learn privacy policy</h1>
      <p className="mb-8 text-sm text-neutral-600">Last updated {LAST_UPDATED}</p>

      <section className="space-y-4">
        <p>
          CS Learn is the open courseware program of the Kenneth C. Griffin School of Computer
          Science at Carnegie Mellon University. It publishes recorded Carnegie Mellon lectures on
          the CS Learn YouTube channel. This policy covers CS Learn&apos;s publishing tool, an
          internal application that CS Learn staff use to upload lectures and manage their titles,
          descriptions, captions, playlists and release schedules on that channel.
        </p>

        <h2 className="pt-4 text-xl font-semibold">YouTube API Services</h2>
        <p>
          The publishing tool uses YouTube API Services. By using it, you agree to the{" "}
          <a className="text-[var(--color-primary)] underline" href="https://www.youtube.com/t/terms">
            YouTube Terms of Service
          </a>
          , and your information is also handled under the{" "}
          <a className="text-[var(--color-primary)] underline" href="https://policies.google.com/privacy">
            Google Privacy Policy
          </a>
          .
        </p>

        <h2 className="pt-4 text-xl font-semibold">Who uses the tool</h2>
        <p>
          Only CS Learn staff sign in to the tool, and only to manage the CS Learn channel. It is
          not offered to the public, and viewers of our videos never interact with it.
        </p>

        <h2 className="pt-4 text-xl font-semibold">What we access</h2>
        <p>
          When a staff member signs in with Google, the tool asks for permission to manage the
          YouTube channel they choose. It reads and writes that channel&apos;s videos, video
          metadata (titles, descriptions, tags, publish times), caption tracks and playlists. It
          does not read comments, subscriber lists, viewer data or any other Google account data.
        </p>

        <h2 className="pt-4 text-xl font-semibold">What we store</h2>
        <p>
          The sign-in token Google issues is stored only on the computer of the staff member who
          signed in, so the tool can act on the channel without asking them to sign in each time.
          We keep our own records of the videos we publish (titles, descriptions, release dates and
          video IDs) to run the schedule. We store no personal information about YouTube viewers.
        </p>

        <h2 className="pt-4 text-xl font-semibold">What we share</h2>
        <p>
          We do not sell or share any data obtained through YouTube API Services. Data goes only to
          YouTube, to publish and update videos on the CS Learn channel.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Revoking access and deleting data</h2>
        <p>
          A staff member can revoke the tool&apos;s access at any time on the{" "}
          <a
            className="text-[var(--color-primary)] underline"
            href="https://security.google.com/settings/security/permissions"
          >
            Google security settings page
          </a>
          , and can delete the stored token from their computer. To ask us to delete any data we
          hold that came from YouTube API Services, email us at the address below and we will
          delete it within 30 days.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Contact</h2>
        <p>
          Questions about this policy go to Phillip Compeau, Carnegie Mellon University, at{" "}
          <a className="text-[var(--color-primary)] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>
    </main>
  );
}
