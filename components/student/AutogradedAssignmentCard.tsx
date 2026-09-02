"use client";

import { useState } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import type { AutolabStatus } from "@/lib/student/types";

/**
 * Autolab is pull-only (no grade services), so the score shown here is
 * whatever was last synced into autolab_scores — this card's "Check for
 * updated score" button re-triggers that pull via /api/autolab/sync. A demo
 * environment with no autolab_credentials row configured will just show the
 * "not configured" message instead of a score, which is expected.
 */
export default function AutogradedAssignmentCard({
  lessonId,
  autolab,
}: {
  lessonId: string;
  autolab: AutolabStatus;
}) {
  const [status, setStatus] = useState(autolab);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdate = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/autolab/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? "Could not reach Autolab");
        return;
      }
      if (payload.status === "synced") {
        setStatus((prev) => ({ ...prev, score: payload.score, noSubmission: false, syncedAt: new Date().toISOString() }));
      } else if (payload.status === "no_submission") {
        setStatus((prev) => ({ ...prev, score: null, noSubmission: true, syncedAt: new Date().toISOString() }));
      }
    } catch {
      setError("Could not reach Autolab");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="mx-8 my-6 border border-gray-200 rounded-md p-5 bg-gray-50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-primary tracking-wide mb-1">AUTOGRADED · AUTOLAB</p>
          <h3 className="text-base font-bold">{status.title}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {status.courseName} / {status.assessmentName}
          </p>
        </div>
        <div className="text-right shrink-0">
          {status.score != null ? (
            <p className="text-2xl font-bold">
              {status.score}
              <span className="text-sm text-gray-400"> / {status.pointsPossible}</span>
            </p>
          ) : (
            <p className="text-sm text-gray-400">{status.noSubmission ? "No submission yet" : "Not synced yet"}</p>
          )}
          {status.syncedAt && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              Synced {new Date(status.syncedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-1.5 text-sm font-bold bg-primary text-white rounded px-3 py-1.5 opacity-90 cursor-not-allowed"
          title="Demo only — no live Autolab instance configured"
        >
          <ExternalLink size={14} />
          Open in Autolab
        </a>
        <button
          type="button"
          onClick={checkForUpdate}
          disabled={isSyncing}
          className="flex items-center gap-1.5 text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
          Check for updated score
        </button>
      </div>
      {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
    </div>
  );
}
