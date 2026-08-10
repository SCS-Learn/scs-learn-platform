"use client";

import { useState } from "react";
import { X, FileText, Upload, Save, Send } from "lucide-react";
import {
  lessonTypeOptions,
  initialAttachments,
  type Attachment,
} from "@/lib/instructor/mock-data";

export default function ModuleSettingsSidebar({
  lessonTitle,
  onLessonTitleChange,
  selectedType,
  onTypeChange,
  onSaveDraft,
  onPublish,
}: {
  lessonTitle: string;
  onLessonTitleChange: (title: string) => void;
  selectedType: string;
  onTypeChange: (value: string) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const addAttachment = () => {
    const name = window.prompt("File name (mock — no upload yet)");
    if (name) {
      setAttachments((prev) => [...prev, { id: `att-${Date.now()}`, name }]);
    }
  };

  return (
    <div className="h-full min-h-0 bg-white flex flex-col overflow-hidden border border-gray-300">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-6">
        <div>
          <h3 className="text-lg font-bold mb-3">Lesson settings</h3>

          <label className="block text-sm text-gray-500 mb-1">Title</label>
          <input
            value={lessonTitle}
            onChange={(e) => onLessonTitleChange(e.target.value)}
            placeholder="Title"
            className="w-full text-base border border-gray-200 px-3 py-2.5 mb-3 bg-white outline-none focus:border-primary/50"
          />

          <label className="block text-sm text-gray-500 mb-1">Type</label>
          <select
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full text-base border border-gray-200 px-3 py-2.5 pr-8 bg-white appearance-none bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            }}
          >
            {lessonTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            A lesson holds content or a quiz, never both.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold">Attachments</h3>
            <span className="text-sm text-gray-400">{attachments.length}</span>
          </div>

          <div className="flex flex-col gap-1 mb-3">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group flex items-center gap-2 text-sm px-3 py-2.5 hover:bg-gray-50"
              >
                <FileText size={15} className="text-gray-400 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-gray-700">
                  {attachment.name}
                </span>
                <button
                  type="button"
                  aria-label="Remove attachment"
                  className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addAttachment}
            className="w-full flex items-center justify-center gap-1.5 text-base text-gray-500 border border-dashed border-gray-300 px-4 py-3 hover:border-gray-400 hover:text-gray-600"
          >
            <Upload size={15} />
            Upload a file
          </button>
        </div>
      </div>

      <div className="shrink-0 p-3 border-t border-gray-100 flex flex-col gap-2">
        <button
          type="button"
          onClick={onSaveDraft}
          className="w-full flex items-center justify-center gap-2 text-base font-bold bg-white text-primary border border-primary px-4 py-3 hover:bg-primary/5"
        >
          <Save size={16} />
          Save draft
        </button>
        <button
          type="button"
          onClick={onPublish}
          className="w-full flex items-center justify-center gap-2 text-base font-bold bg-primary text-white px-4 py-3 hover:opacity-90"
        >
          <Send size={16} />
          Publish
        </button>
      </div>
    </div>
  );
}
