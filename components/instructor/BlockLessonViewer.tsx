"use client";

import { CircleHelp } from "lucide-react";
import TopicLessonViewer, { type TopicLessonBlock } from "@/components/lesson/TopicLessonViewer";
import type { LessonBlockView, LessonType } from "@/lib/instructor/mock-data";

function QuestionGroupBlock({ block }: { block: LessonBlockView }) {
  return (
    <div className="px-8 py-6">
      {block.title && <h3 className="text-lg font-bold mb-3">{block.title}</h3>}
      <div className="flex flex-col gap-6">
        {(block.questions ?? []).map((question, index) => (
          <div key={question.id} className="border border-gray-200 rounded-md p-4">
            <p className="text-xs text-gray-400 mb-1">Question {index + 1}</p>
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

function SlideFileFallback({ block }: { block: LessonBlockView }) {
  if (block.renderMode === "pdf_embed" && block.pdfUrl) {
    return <iframe src={block.pdfUrl} className="slide-deck-pdf w-full" title={block.title ?? "File"} />;
  }
  if (block.renderMode === "slide_card_images" && block.bodyHtml) {
    return (
      <div
        className="slide-deck lesson-content-editor prose prose-sm max-w-none px-8 py-4"
        dangerouslySetInnerHTML={{ __html: block.bodyHtml }}
      />
    );
  }
  return null;
}

export default function BlockLessonViewer({
  blocks,
  lessonType,
  lessonTitle,
}: {
  blocks: LessonBlockView[];
  lessonType: LessonType;
  lessonTitle: string;
}) {
  const questionBlocks = blocks.filter((b) => b.kind === "question_group");

  if (blocks.length === 0) {
    return (
      <div className="min-h-full flex items-center justify-center text-sm text-gray-400">
        This lesson has no content yet.
      </div>
    );
  }

  if (lessonType === "quiz" || questionBlocks.length > 0) {
    return (
      <div className="topic-lesson min-h-full flex flex-col">
        <div className="flex items-center gap-2 px-8 py-3 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wide">
          <CircleHelp size={14} />
          Quiz / Homework
        </div>
        <h1 className="topic-lesson-title">{lessonTitle}</h1>
        {blocks.map((block) => {
          if (block.kind === "question_group") return <QuestionGroupBlock key={block.id} block={block} />;
          return <SlideFileFallback key={block.id} block={block} />;
        })}
      </div>
    );
  }

  return (
    <TopicLessonViewer blocks={blocks as TopicLessonBlock[]} lessonTitle={lessonTitle} />
  );
}
