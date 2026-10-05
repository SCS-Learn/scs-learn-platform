"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Renders an external activity inside a lesson. Two shapes, because the two
// tools behave differently:
//
// Cogniterra (LTI 1.1): a visible iframe pointed at the DIRECT (non-LTI)
// lesson URL when we have one - Cogniterra's LTI launch doesn't honor its own
// custom_lesson deep-link param (verified: it lands on the course's first
// lesson regardless of which assignment was launched), while the same lesson
// id opens correctly when visited directly. The LTI launch itself still
// fires alongside it, in a hidden iframe the learner never sees. It does two
// jobs: it registers this resource_link_id/sourcedid so grades come back
// through the outcomes endpoint, and it signs the learner in to Cogniterra -
// creating their account and enrolling them in the course on first launch,
// no invite needed. The course is private, so the direct iframe is only
// mounted once the launch has landed. Loading both at once is not just a
// race a reload can fix: the direct page's signed-out request gets its own
// anonymous Cogniterra session that clobbers the launch's, and the lesson
// stays "Access denied" (reproduced in headless Firefox 2026-10-05; the
// sequenced order loads the lesson). Falls back to showing the LTI iframe directly when
// there's no directUrl (e.g. a course-level-only link with no specific
// lesson match).
//
// Autolab: a link out, plus a manual "check my score" pull. Autolab enforces
// its own SSO and sets SameSite cookies, so a cross-origin iframe is unreliable
// even when its LTI is configured, and its LTI cannot report grades at all.

export type ExternalActivityProps = {
  lessonId: string;
  title: string;
  kind: "lti" | "autolab";
  // LTI: the signed-launch route for this link. Autolab: the assessment URL.
  url: string;
  openInNewTab?: boolean;
  /**
   * LTI only: a direct, non-LTI URL to the same activity - see the file-level
   * comment. When present, this is what's actually shown (the LTI launch
   * still fires in the background for grading). Null falls back to showing
   * the LTI iframe itself (e.g. a course-level-only link with no specific
   * lesson match).
   */
  directUrl?: string | null;
  initialScore?: number | null;
  pointsPossible?: number;
  /** Hide the activity title when a parent already shows the lesson title. */
  hideTitle?: boolean;
  /**
   * Grow to fill a flex parent with a defined height. Parent should be
   * `flex flex-col` with `flex-1 min-h-0` (or similar).
   */
  fillAvailableHeight?: boolean;
};

/** Must match the form id renderAutoSubmitForm (lib/lti/launch.ts) emits. */
const LAUNCH_FORM_ID = "lti-launch";
const NEW_TAB_LAUNCH_TIMEOUT_MS = 20_000;
// Reveal the activity anyway if a launch stalls (slow network, blocked
// cookies) rather than leave the learner on a placeholder.
const EMBED_LAUNCH_TIMEOUT_MS = 15_000;

const subscribeNever = () => () => {};

type SyncState =
  | { status: "idle" }
  | { status: "syncing" }
  | { status: "done"; score: number | null }
  | { status: "no_submission" }
  | { status: "error"; message: string };

export default function ExternalActivity({
  lessonId,
  title,
  kind,
  url,
  openInNewTab = false,
  directUrl = null,
  initialScore = null,
  pointsPossible = 100,
  hideTitle = false,
  fillAvailableHeight = false,
}: ExternalActivityProps) {
  const [sync, setSync] = useState<SyncState>(
    initialScore === null ? { status: "idle" } : { status: "done", score: initialScore }
  );
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The hidden launch iframe is only rendered after hydration. Server-rendered,
  // it starts loading before React attaches onLoad, and a launch that lands
  // first would never reveal the activity.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  // Which launch url has landed on Cogniterra (i.e. signed the learner in).
  // Keyed by url so switching lessons waits for that lesson's own launch.
  const [launchedUrl, setLaunchedUrl] = useState<string | null>(null);
  const launched = launchedUrl === url;

  useEffect(() => {
    if (kind !== "lti" || !directUrl) return;
    const timer = window.setTimeout(() => setLaunchedUrl(url), EMBED_LAUNCH_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [kind, url, directUrl]);

  const onLaunchFrameLoad = useCallback(
    (event: React.SyntheticEvent<HTMLIFrameElement>) => {
      let doc: Document | null = null;
      try {
        doc = event.currentTarget.contentDocument;
      } catch {
        doc = null;
      }
      // Still about:blank or our own auto-submitting launch page: the POST
      // to Cogniterra hasn't completed. Anything else - a cross-origin
      // Cogniterra page (contentDocument is null) or one of our own error
      // responses, e.g. the 401 an instructor previewing without a learner
      // session gets - means the launch is as done as it will get.
      if (doc && (doc.URL === "about:blank" || doc.getElementById(LAUNCH_FORM_ID))) return;
      setLaunchedUrl(url);
    },
    [url]
  );

  // "Open in Cogniterra" runs the launch in the new tab first - a first-party
  // context, so it works even where the browser blocks Cogniterra's cookies
  // inside our iframe - then steers that same tab to the right lesson once it
  // has landed on Cogniterra (reading a cross-origin location throws, which is
  // the signal; the launch itself always lands on the course's first lesson).
  // The tab keeps its opener on purpose: disowning it lets Chrome move the
  // tab to a fresh browsing context on the cross-site hop, which closes our
  // handle on it and the redirect to the right lesson never happens.
  const openInCogniterra = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!directUrl) return;
      const tab = window.open(url, "_blank");
      if (!tab) return; // Popup blocked: let the plain link navigate instead.
      event.preventDefault();
      const startedAt = Date.now();
      const poll = window.setInterval(() => {
        if (tab.closed || Date.now() - startedAt > NEW_TAB_LAUNCH_TIMEOUT_MS) {
          window.clearInterval(poll);
          return;
        }
        try {
          void tab.location.href;
        } catch {
          window.clearInterval(poll);
          tab.location.replace(directUrl);
        }
      }, 150);
    },
    [url, directUrl]
  );

  const pullAutolabScore = useCallback(async () => {
    setSync({ status: "syncing" });
    try {
      const response = await fetch("/api/autolab/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setSync({ status: "error", message: payload?.error ?? "Could not reach Autolab" });
        return;
      }
      if (payload.status === "no_submission") {
        setSync({ status: "no_submission" });
        return;
      }
      setSync({ status: "done", score: payload.score ?? null });
    } catch {
      setSync({ status: "error", message: "Could not reach Autolab" });
    }
  }, [lessonId]);

  // The LTI return URL posts a message up when a tool declares the activity
  // finished. Only same-origin messages are trusted: the tool's own frame is
  // cross-origin and must not be able to fake a completion.
  useEffect(() => {
    if (kind !== "lti") return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "scs-learn:lti-return") {
        // The score arrived over the outcomes endpoint rather than through the
        // browser, so a router refresh is what surfaces it.
        window.location.reload();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [kind]);

  const scoreLabel =
    sync.status === "done" && sync.score !== null
      ? `${sync.score} / ${pointsPossible}`
      : null;

  const frameClassName = fillAvailableHeight
    ? "min-h-0 w-full flex-1 border border-stone-200 bg-white"
    : "h-[calc(100vh-10rem)] min-h-[32rem] w-full border border-stone-200 bg-white";

  const showDirectLink = kind === "lti" && Boolean(directUrl);
  const showHeader = !hideTitle || scoreLabel !== null || showDirectLink;

  return (
    <section
      className={`flex flex-col gap-3 ${fillAvailableHeight ? "h-full min-h-0" : ""}`}
    >
      {showHeader ? (
        <header className="flex shrink-0 items-baseline justify-between gap-4">
          {!hideTitle ? (
            <h2 className="text-lg font-medium text-stone-800">{title}</h2>
          ) : scoreLabel ? (
            <span className="text-sm text-stone-500">Score</span>
          ) : (
            <span />
          )}
          <span className="flex items-baseline gap-4">
            {scoreLabel ? (
              <span className="text-sm font-medium text-stone-700">{scoreLabel}</span>
            ) : null}
            {showDirectLink ? (
              <a
                href={directUrl!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openInCogniterra}
                title="Cookie blockers can stop Cogniterra from signing you in inside this page - use this if the activity below doesn't load."
                className="text-sm font-medium text-stone-700 underline hover:text-stone-900 whitespace-nowrap"
              >
                Open in Cogniterra ↗
              </a>
            ) : null}
          </span>
        </header>
      ) : null}

      {kind === "lti" && directUrl ? (
        <>
          {/* Fires the LTI launch, which signs the learner in to Cogniterra
              and registers this resource link for grading - never shown to
              the learner, who never needs to see its (currently wrong)
              landing page. */}
          {mounted ? (
            <iframe
              key={url}
              src={url}
              title=""
              aria-hidden="true"
              className="hidden"
              tabIndex={-1}
              onLoad={onLaunchFrameLoad}
            />
          ) : null}
          {/* Browsers that block all cross-site cookies (Safari by default,
              Brave, strict Firefox) drop Cogniterra's session inside our
              iframe, and Cogniterra then shows its own "Access denied" /
              "log in" page, which points the learner the wrong way. Our page
              can't detect the blocking, so name the real cause up front and
              offer the new-tab launch, which works under any cookie setting. */}
          <p className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>
              Seeing &ldquo;Access denied&rdquo; or a Cogniterra login below? Your browser&apos;s cookie
              blocker is stopping Cogniterra from signing you in inside this page. You don&apos;t need a
              Cogniterra account.
            </span>
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={openInCogniterra}
              className="whitespace-nowrap rounded bg-amber-900 px-3 py-1 font-medium text-white hover:bg-amber-800"
            >
              Open in a new tab ↗
            </a>
          </p>
          {launched ? (
            <iframe
              ref={frameRef}
              src={directUrl}
              title={title}
              className={frameClassName}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              allow="clipboard-write"
            />
          ) : (
            <div className={`${frameClassName} flex items-center justify-center text-sm text-stone-500`}>
              Signing you in to Cogniterra...
            </div>
          )}
        </>
      ) : kind === "lti" && !openInNewTab ? (
        <iframe
          ref={frameRef}
          src={url}
          title={title}
          className={
            fillAvailableHeight
              ? "min-h-0 w-full flex-1 border border-stone-200 bg-white"
              : "h-[calc(100vh-10rem)] min-h-[32rem] w-full border border-stone-200 bg-white"
          }
          // Cogniterra needs scripts, its own origin, forms for the launch POST,
          // and popups for links out of a step.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          allow="clipboard-write"
        />
      ) : (
        <div className="flex flex-col gap-3 border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-600">
            {kind === "autolab"
              ? "This assessment is graded in Autolab. Open it, submit your work, then check your score here."
              : "This activity opens in a new tab."}
          </p>
          <div className="flex items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Open {kind === "autolab" ? "in Autolab" : "activity"}
            </a>
            {kind === "autolab" ? (
              <button
                type="button"
                onClick={pullAutolabScore}
                disabled={sync.status === "syncing"}
                className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {sync.status === "syncing" ? "Checking..." : "Check my score"}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {sync.status === "no_submission" ? (
        <p className="text-sm text-stone-500">No submission in Autolab yet.</p>
      ) : null}
      {sync.status === "error" ? (
        <p className="text-sm text-red-700">{sync.message}</p>
      ) : null}
    </section>
  );
}
