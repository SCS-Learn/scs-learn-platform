"use client";

import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor";

export default function LessonEditor({
  content,
  onContentChange,
  wordCount,
  savedLabel,
}: {
  content: string;
  onContentChange: (html: string) => void;
  wordCount: number;
  savedLabel: string;
}) {
  return (
    <div className="min-w-0 min-h-0 h-full bg-white flex flex-col border border-gray-300 overflow-hidden">
      <div className="flex-1 min-h-0">
        <SimpleEditor content={content} onContentChange={onContentChange} />
      </div>

      <div className="shrink-0 border-t border-gray-100 px-4 py-1.5 text-[11px] text-gray-400 tabular-nums">
        {savedLabel}
        <span className="mx-1.5 text-gray-300">·</span>
        {wordCount.toLocaleString()} words
      </div>
    </div>
  );
}
