"use client";

import { ChevronRight, Eye, Save, Send } from "lucide-react";

export default function EditorTopBar({
  unitLabel,
  lessonLabel,
  wordCount,
  isPublished,
  savedLabel,
  onPreview,
  onSaveDraft,
  onPublish,
}: {
  unitLabel: string;
  lessonLabel: string;
  wordCount: number;
  isPublished: boolean;
  savedLabel: string;
  onPreview: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
      <div className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
        <span>Content</span>
        <ChevronRight size={12} />
        <span className="truncate">{unitLabel}</span>
        <ChevronRight size={12} />
        <span className="text-gray-700">{lessonLabel}</span>
        <span
          className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${
            isPublished
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {isPublished ? "PUBLISHED" : "DRAFT"}
        </span>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs text-gray-400">
          {savedLabel} · {wordCount.toLocaleString()} words
        </span>

        <button
          type="button"
          onClick={onPreview}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-black"
        >
          <Eye size={13} />
          Preview
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          className="flex items-center gap-1 text-xs border border-gray-300 rounded px-2.5 py-1.5 text-gray-700 hover:bg-gray-50"
        >
          <Save size={13} />
          Save draft
        </button>
        <button
          type="button"
          onClick={onPublish}
          className="flex items-center gap-1 text-xs bg-primary text-white rounded px-2.5 py-1.5 hover:opacity-90"
        >
          <Send size={13} />
          Publish
        </button>
      </div>
    </div>
  );
}
