"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export type TopicLessonBlock = {
  id: string;
  kind: "slide_file" | "video" | "question_group" | "course_notes";
  title: string | null;
  renderMode: "pdf_embed" | "slide_card_images" | "slide_rendered_images" | null;
  bodyHtml: string | null;
  renderedImageUrls: string[] | null;
  pdfUrl: string | null;
  videoUrl: string | null;
};

type LessonTab = "video" | "files" | "content";

function youtubeEmbedUrl(url: string): string | null {
  const watch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  return watch ? `https://www.youtube.com/embed/${watch[1]}` : null;
}

function slideBlockHasContent(block: TopicLessonBlock): boolean {
  if (block.kind !== "slide_file") return false;
  if (block.renderMode === "pdf_embed" && block.pdfUrl) return true;
  if (block.renderMode === "slide_card_images" && block.bodyHtml) return true;
  return block.renderMode === "slide_rendered_images" && (block.renderedImageUrls?.length ?? 0) > 0;
}

function SlideFileContent({ block }: { block: TopicLessonBlock }) {
  const hasPdf = block.renderMode === "pdf_embed" && block.pdfUrl;
  const hasCards = block.renderMode === "slide_card_images" && block.bodyHtml;
  const hasImages =
    block.renderMode === "slide_rendered_images" && (block.renderedImageUrls?.length ?? 0) > 0;

  if (hasPdf) {
    return <iframe src={block.pdfUrl!} className="slide-deck-pdf" title={block.title ?? "Slides"} />;
  }
  if (hasCards) {
    return (
      <div
        className="slide-deck lesson-content-editor prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: block.bodyHtml! }}
      />
    );
  }
  if (hasImages) {
    return (
      <div className="slide-deck">
        {block.renderedImageUrls!.map((url, index) => (
          <div key={url}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Slide ${index + 1}`} className="slide-image" />
            {index < block.renderedImageUrls!.length - 1 && <hr className="slide-divider" />}
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-gray-400 py-2">This file could not be rendered.</p>;
}

function CollapsibleFileItem({
  block,
  defaultOpen,
}: {
  block: TopicLessonBlock;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="supporting-file-item">
      <button
        type="button"
        className="supporting-file-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={18} className="shrink-0 text-gray-500" />
        ) : (
          <ChevronRight size={18} className="shrink-0 text-gray-500" />
        )}
        <span className="supporting-file-toggle-label">{block.title ?? "Untitled file"}</span>
      </button>
      {open && (
        <div className="supporting-file-panel">
          <SlideFileContent block={block} />
        </div>
      )}
    </div>
  );
}

function LessonVideoPanel({ block }: { block: TopicLessonBlock }) {
  if (!block.videoUrl) return null;
  const embedUrl = youtubeEmbedUrl(block.videoUrl);

  return (
    <div className="lesson-video-wrap">
      {embedUrl ? (
        <iframe src={embedUrl} className="lesson-video-embed" allowFullScreen title="Lesson video" />
      ) : (
        <a href={block.videoUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
          Watch video
        </a>
      )}
    </div>
  );
}

function SupportingFilesPanel({ blocks }: { blocks: TopicLessonBlock[] }) {
  const renderable = blocks.filter(slideBlockHasContent);
  if (renderable.length === 0) {
    return <p className="text-sm text-gray-400">No lesson files in this lesson.</p>;
  }

  return (
    <div className="supporting-files-list">
      {renderable.map((block, index) => (
        <CollapsibleFileItem key={block.id} block={block} defaultOpen={index === 0} />
      ))}
    </div>
  );
}

function LessonContentPanel({ block }: { block: TopicLessonBlock }) {
  if (!block.bodyHtml) {
    return <p className="text-sm text-gray-400">No lesson content in this lesson.</p>;
  }

  return (
    <div
      className="lesson-content-body lesson-content-editor prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: block.bodyHtml }}
    />
  );
}

const TAB_LABELS: Record<LessonTab, string> = {
  video: "Lesson Video",
  files: "Lesson Files",
  content: "Lesson Content",
};

/**
 * Topic lesson with a tab bar to switch between video, lesson files, and
 * lesson content — only tabs with material are shown.
 */
export default function TopicLessonViewer({
  blocks,
  lessonTitle,
}: {
  blocks: TopicLessonBlock[];
  lessonTitle: string;
}) {
  const videoBlock = blocks.find((b) => b.kind === "video" && b.videoUrl);
  const slideBlocks = blocks.filter((b) => b.kind === "slide_file");
  const notesBlock = blocks.find((b) => b.kind === "course_notes" && b.bodyHtml);

  const availableTabs = useMemo(() => {
    const tabs: LessonTab[] = [];
    if (videoBlock) tabs.push("video");
    if (slideBlocks.some(slideBlockHasContent)) tabs.push("files");
    if (notesBlock?.bodyHtml) tabs.push("content");
    return tabs;
  }, [videoBlock, slideBlocks, notesBlock]);

  const [activeTab, setActiveTab] = useState<LessonTab>(() => availableTabs[0] ?? "video");

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] ?? "video");
    }
  }, [activeTab, availableTabs]);

  if (availableTabs.length === 0) {
    return (
      <article className="topic-lesson min-h-full flex flex-col w-full">
        <h1 className="topic-lesson-title">{lessonTitle}</h1>
        <p className="px-8 py-6 text-sm text-gray-400">
          No content loaded for this lesson. Re-import the course folder.
        </p>
      </article>
    );
  }

  return (
    <article className="topic-lesson min-h-full flex flex-col w-full">
      <h1 className="topic-lesson-title">{lessonTitle}</h1>

      {availableTabs.length > 1 && (
        <div className="lesson-tab-bar" role="tablist" aria-label="Lesson sections">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`lesson-tab${activeTab === tab ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      )}

      <div className="lesson-tab-panel" role="tabpanel">
        {activeTab === "video" && videoBlock && <LessonVideoPanel block={videoBlock} />}
        {activeTab === "files" && <SupportingFilesPanel blocks={slideBlocks} />}
        {activeTab === "content" && notesBlock && <LessonContentPanel block={notesBlock} />}
      </div>
    </article>
  );
}
