"use client";

import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor";

export default function LessonEditor({
  lessonId,
  title,
  onTitleChange,
  content,
  onContentChange,
}: {
  lessonId: string;
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  onContentChange: (html: string) => void;
}) {
  return (
    <div className="min-h-full flex flex-col">
      <div className="px-8 pt-6 pb-4">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Lesson title"
          className="w-full text-3xl font-serif font-bold outline-none placeholder:text-gray-300"
        />
      </div>

      <div className="lesson-content-editor flex-1">
        <SimpleEditor lessonId={lessonId} content={content} onContentChange={onContentChange} />
      </div>
    </div>
  );
}
