"use client";

import { CircleHelp } from "lucide-react";
import TopicLessonViewer, { type TopicLessonBlock } from "@/components/lesson/TopicLessonViewer";
import QuizBlock from "@/components/student/QuizBlock";
import type { LessonBlockView, LessonType } from "@/lib/instructor/mock-data";
import type { StudentQuestion } from "@/lib/student/types";

function toStudentQuestions(blocks: LessonBlockView[]): StudentQuestion[] {
  return blocks.flatMap((block) =>
    (block.questions ?? []).map((question) => ({
      id: question.id,
      promptText: question.promptText,
      choices: question.choices,
      answerKey: question.answerKey,
      questionType: question.questionType as StudentQuestion["questionType"],
    }))
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
  const questions = toStudentQuestions(questionBlocks);

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
        <QuizBlock questions={questions} initialSubmission={null} previewMode />
        {lessonType !== "quiz" &&
          blocks
            .filter((b) => b.kind !== "question_group")
            .map((block) => <SlideFileFallback key={block.id} block={block} />)}
      </div>
    );
  }

  return <TopicLessonViewer blocks={blocks as TopicLessonBlock[]} lessonTitle={lessonTitle} />;
}
