"use client";

import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor";

export default function LessonEditor({
  lessonId,
  title,
  onTitleChange,
  content,
  onContentChange,
  wordCount,
}: {
  lessonId: string;
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  onContentChange: (html: string) => void;
  wordCount: number;
}) {
  return (
    <div className="flex-1 min-w-0 border border-gray-200 rounded-md overflow-hidden bg-white flex flex-col">
      <div className="px-8 pt-6">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Lesson title"
          className="w-full text-3xl font-serif font-bold outline-none placeholder:text-gray-300"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <SimpleEditor lessonId={lessonId} content={content} onContentChange={onContentChange} />
      </div>

      <div className="border-t border-gray-100 px-8 py-2 text-xs text-gray-400">
        {wordCount.toLocaleString()} words
      </div>
    </div>
  );
}
