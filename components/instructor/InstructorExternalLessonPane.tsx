"use client";

import { useEffect, useMemo, useState } from "react";
import ExternalActivity from "@/components/lti/ExternalActivity";
import type { LessonBlockView } from "@/lib/instructor/mock-data";

type ExternalTab = "assignment" | "writeup";

const TAB_LABELS: Record<ExternalTab, string> = {
  assignment: "Assignment",
  writeup: "Writeup",
};

export default function InstructorExternalLessonPane({
  lessonId,
  lessonTitle,
  ltiLinkId,
  blocks,
}: {
  lessonId: string;
  lessonTitle: string;
  ltiLinkId: string | null;
  blocks: LessonBlockView[];
}) {
  const writeupBlock = useMemo(
    () => blocks.find((block) => block.kind === "course_notes" && block.bodyHtml),
    [blocks]
  );
  const hasWriteup = Boolean(writeupBlock?.bodyHtml);
  const hasAssignment = Boolean(ltiLinkId);

  const tabs = useMemo(() => {
    const next: ExternalTab[] = [];
    if (hasAssignment) next.push("assignment");
    if (hasWriteup) next.push("writeup");
    return next;
  }, [hasAssignment, hasWriteup]);

  const [activeTab, setActiveTab] = useState<ExternalTab>(() => tabs[0] ?? "assignment");

  useEffect(() => {
    if (!tabs.includes(activeTab)) {
      setActiveTab(tabs[0] ?? "assignment");
    }
  }, [activeTab, tabs]);

  if (tabs.length === 0) {
    return (
      <div className="min-h-full flex items-center justify-center text-sm text-gray-400">
        This external assignment has no linked activity or writeup yet.
      </div>
    );
  }

  const currentTab = tabs.includes(activeTab) ? activeTab : tabs[0];
  const showTabBar = tabs.length > 1;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="topic-lesson-header shrink-0">
        <h1 className="topic-lesson-title">{lessonTitle}</h1>
        {showTabBar && (
          <div className="lesson-tab-bar" role="tablist" aria-label="External assignment sections">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={currentTab === tab}
                className={`lesson-tab${currentTab === tab ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {currentTab === "assignment" && ltiLinkId && (
          <div className="flex flex-1 min-h-0 flex-col px-8 py-4">
            <ExternalActivity
              lessonId={lessonId}
              title={lessonTitle}
              kind="lti"
              url={`/api/lti/launch/${ltiLinkId}`}
              hideTitle
              fillAvailableHeight
            />
          </div>
        )}

        {currentTab === "writeup" && writeupBlock?.bodyHtml && (
          <div
            className="flex-1 min-h-0 overflow-y-auto lesson-tab-panel"
            role="tabpanel"
            aria-label="Writeup"
          >
            <div
              className="course-notes-content lesson-content-editor"
              dangerouslySetInnerHTML={{ __html: writeupBlock.bodyHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
