"use client";

import { CircleHelp } from "lucide-react";
import type { LessonBlockView, LessonType } from "@/lib/instructor/mock-data";

function youtubeEmbedUrl(url: string): string | null {
  const watch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  return watch ? `https://www.youtube.com/embed/${watch[1]}` : null;
}

function VideoBlock({ block }: { block: LessonBlockView }) {
  if (!block.videoUrl) return null;
  const embedUrl = youtubeEmbedUrl(block.videoUrl);
  return (
    <div className="px-8 py-6">
      {block.title && <h3 className="text-lg font-bold mb-3">{block.title}</h3>}
      {embedUrl ? (
        <iframe
          src={embedUrl}
          className="w-full aspect-video rounded-md border border-gray-200"
          allowFullScreen
        />
      ) : (
        <a
          href={block.videoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline"
        >
          Watch video
        </a>
      )}
    </div>
  );
}

function SlideFileBlock({ block }: { block: LessonBlockView }) {
  return (
    <div className="px-8 py-6">
      {block.title && <h3 className="text-lg font-bold mb-3">{block.title}</h3>}
      {block.renderMode === "pdf_embed" && block.pdfUrl && (
        <iframe src={block.pdfUrl} className="w-full h-[70vh] rounded-md border border-gray-200" />
      )}
      {block.renderMode === "slide_card_images" && block.bodyHtml && (
        <div
          className="lesson-content-editor prose prose-sm max-w-none [&_.slide-card]:border [&_.slide-card]:border-gray-200 [&_.slide-card]:rounded-md [&_.slide-card]:p-4 [&_.slide-card]:mb-4"
          dangerouslySetInnerHTML={{ __html: block.bodyHtml }}
        />
      )}
      {block.renderMode === "slide_rendered_images" && block.renderedImageUrls && (
        <div className="flex flex-col gap-4">
          {block.renderedImageUrls.map((url, index) => (
            <img
              key={url}
              src={url}
              alt={`Slide ${index + 1}`}
              className="w-full rounded-md border border-gray-200"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionGroupBlock({ block }: { block: LessonBlockView }) {
  return (
    <div className="px-8 py-6">
      {block.title && <h3 className="text-lg font-bold mb-3">{block.title}</h3>}
      <div className="flex flex-col gap-6">
        {(block.questions ?? []).map((question, index) => (
          <div key={question.id} className="border border-gray-200 rounded-md p-4">
            <p className="text-xs text-gray-400 mb-1">
              Question {index + 1}
              {question.needsReview && (
                <span className="ml-2 text-amber-600 font-bold">needs review - couldn&rsquo;t verify verbatim text</span>
              )}
            </p>
            <p className="text-sm whitespace-pre-wrap mb-2">{question.promptText}</p>
            {question.choices && (
              <ul className="text-sm text-gray-600 list-disc pl-5">
                {question.choices.map((choice, choiceIndex) => (
                  <li key={choiceIndex}>{choice}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {(block.questions ?? []).length === 0 && (
          <p className="text-sm text-gray-400">No questions could be extracted from this file.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Read-only render for an organize-mode lesson (content_source === "blocks") -
 * whole slide files, lecture videos, and near-verbatim questions, in position
 * order. No rich-text editing here: unlike an atomized lesson's content_html,
 * there's no free-text body to edit - only re-importing changes what a block
 * shows.
 */
export default function BlockLessonViewer({
  blocks,
  lessonType,
}: {
  blocks: LessonBlockView[];
  lessonType: LessonType;
}) {
  if (blocks.length === 0) {
    return (
      <div className="flex-1 min-w-0 border border-gray-200 rounded-md bg-white flex items-center justify-center min-h-[400px] text-sm text-gray-400">
        This lesson has no content yet.
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 border border-gray-200 rounded-md overflow-hidden bg-white flex flex-col">
      {lessonType === "quiz" && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wide">
          <CircleHelp size={14} />
          Quiz / Homework
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
        {blocks.map((block) => {
          if (block.kind === "video") return <VideoBlock key={block.id} block={block} />;
          if (block.kind === "slide_file") return <SlideFileBlock key={block.id} block={block} />;
          return <QuestionGroupBlock key={block.id} block={block} />;
        })}
      </div>
    </div>
  );
}
