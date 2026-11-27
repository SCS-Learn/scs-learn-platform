"use client";

import { useState } from "react";
import TopicLessonViewer, { type TopicLessonBlock } from "@/components/lesson/TopicLessonViewer";
import InstructorQuizEditor from "@/components/instructor/InstructorQuizEditor";
import LessonTitle from "@/components/lesson/LessonTitle";
import InstructorCodeTaskPane from "@/components/instructor/InstructorCodeTaskPane";
import type { LessonBlockView, LessonType, QuestionView } from "@/lib/instructor/mock-data";

export default function BlockLessonViewer({
  courseCode,
  blocks,
  lessonType,
  lessonTitle,
  onTitleChange,
  onQuestionSaved,
  onQuestionAdded,
  onQuestionDeleted,
}: {
  courseCode: string;
  blocks: LessonBlockView[];
  lessonType: LessonType;
  lessonTitle: string;
  onTitleChange?: (title: string) => void;
  onQuestionSaved?: (question: QuestionView) => void;
  onQuestionAdded?: (question: QuestionView) => void;
  onQuestionDeleted?: (questionId: string) => void;
}) {
  const questionBlocks = blocks.filter((b) => b.kind === "question_group");
  const questionGroupId = questionBlocks.find((b) => b.questionGroupId)?.questionGroupId ?? null;
  const initialQuestions = questionBlocks.flatMap((block) => block.questions ?? []);
  const [questions, setQuestions] = useState(initialQuestions);

  if (blocks.length === 0) {
    return (
      <div className="topic-lesson min-h-full flex flex-col">
        <div className="topic-lesson-header">
          <LessonTitle title={lessonTitle} onChange={onTitleChange} />
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          This lesson has no content yet.
        </div>
      </div>
    );
  }

  const codeTaskBlock = blocks.find((b) => b.kind === "code_task" && b.codeTask);
  if (codeTaskBlock?.codeTask) {
    return (
      <InstructorCodeTaskPane
        key={codeTaskBlock.id}
        courseCode={courseCode}
        blockId={codeTaskBlock.id}
        initialTask={codeTaskBlock.codeTask}
        lessonTitle={lessonTitle}
        onTitleChange={onTitleChange}
      />
    );
  }

  if (lessonType === "external") {
    return <TopicLessonViewer blocks={blocks as TopicLessonBlock[]} lessonTitle={lessonTitle} onTitleChange={onTitleChange} />;
  }

  if (lessonType === "quiz" || questionBlocks.length > 0) {
    return (
      <InstructorQuizEditor
        courseCode={courseCode}
        lessonTitle={lessonTitle}
        onTitleChange={onTitleChange}
        questionGroupId={questionGroupId}
        questions={questions}
        onQuestionSaved={(updated) => {
          setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
          onQuestionSaved?.(updated);
        }}
        onQuestionAdded={(added) => {
          setQuestions((prev) => [...prev, added]);
          onQuestionAdded?.(added);
        }}
        onQuestionDeleted={(questionId) => {
          setQuestions((prev) => prev.filter((q) => q.id !== questionId));
          onQuestionDeleted?.(questionId);
        }}
      />
    );
  }

  return <TopicLessonViewer blocks={blocks as TopicLessonBlock[]} lessonTitle={lessonTitle} onTitleChange={onTitleChange} />;
}
