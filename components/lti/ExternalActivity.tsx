"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Renders an external activity inside a lesson. Two shapes, because the two
// tools behave differently:
//
// Cogniterra (LTI 1.1): iframe pointed at our own signed-launch route, which
// posts itself to Cogniterra. Grades arrive on their own through the outcomes
// endpoint, so there is nothing to poll and nothing for the learner to do.
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
  initialScore = null,
  pointsPossible = 100,
  hideTitle = false,
  fillAvailableHeight = false,
}: ExternalActivityProps) {
  const [sync, setSync] = useState<SyncState>(
    initialScore === null ? { status: "idle" } : { status: "done", score: initialScore }
  );
  const frameRef = useRef<HTMLIFrameElement>(null);

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

  const showHeader = !hideTitle || scoreLabel !== null;

  return (
    <section
      className={`flex flex-col gap-3 ${fillAvailableHeight ? "h-full min-h-0" : ""}`}
    >
      {showHeader ? (
        <header className="flex shrink-0 items-baseline justify-between gap-4">
          {!hideTitle ? (
            <h2 className="text-lg font-medium text-stone-800">{title}</h2>
          ) : (
            <span className="text-sm text-stone-500">Score</span>
          )}
          {scoreLabel ? (
            <span className="text-sm font-medium text-stone-700">{scoreLabel}</span>
          ) : null}
        </header>
      ) : null}

      {kind === "lti" && !openInNewTab ? (
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
