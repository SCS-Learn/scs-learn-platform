"use client";

import { CircleHelp } from "lucide-react";
import TopicLessonViewer, { type TopicLessonBlock } from "@/components/lesson/TopicLessonViewer";
import type { StudentLesson } from "@/lib/student/types";
import QuizBlock from "@/components/student/QuizBlock";
import AutogradedAssignmentCard from "@/components/student/AutogradedAssignmentCard";

export default function StudentLessonViewer({ lesson }: { lesson: StudentLesson }) {
  return (
    <div className="flex-[3] min-w-0 border border-gray-200 rounded-md overflow-hidden bg-white flex flex-col">
      {lesson.type === "quiz" && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wide">
          <CircleHelp size={14} />
          Quiz / Homework
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {lesson.autolab && (
          <AutogradedAssignmentCard lessonId={lesson.id} autolab={lesson.autolab} />
        )}

        {lesson.contentSource === "blocks" ? (
          lesson.blocks.length === 0 ? (
            <p className="px-8 py-6 text-sm text-gray-400">This lesson has no content yet.</p>
          ) : lesson.type === "quiz" ? (
            lesson.blocks.map((block) => {
              if (block.questions && block.questions.length > 0) {
                return <QuizBlock key={block.id} questions={block.questions} />;
              }
              if (block.renderMode === "pdf_embed" && block.pdfUrl) {
                return (
                  <iframe
                    key={block.id}
                    src={block.pdfUrl}
                    className="slide-deck-pdf w-full"
                    title={block.title ?? "File"}
                  />
                );
              }
              return null;
            })
          ) : (
            <TopicLessonViewer blocks={lesson.blocks as TopicLessonBlock[]} lessonTitle={lesson.title} />
          )
        ) : (
          <div
            className="lesson-content-editor prose prose-sm max-w-none px-8 py-6"
            dangerouslySetInnerHTML={{ __html: lesson.contentHtml }}
          />
        )}
      </div>
    </div>
  );
}
