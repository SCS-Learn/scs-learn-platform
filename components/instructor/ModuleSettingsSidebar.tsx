"use client";

import { useState } from "react";
import { X, FileText, Upload } from "lucide-react";
import {
  lessonTypeOptions,
  initialAttachments,
  type Attachment,
} from "@/lib/instructor/mock-data";

export default function ModuleSettingsSidebar({
  moduleOptions,
  selectedModule,
  onModuleChange,
  selectedType,
  onTypeChange,
}: {
  moduleOptions: string[];
  selectedModule: string;
  onModuleChange: (value: string) => void;
  selectedType: string;
  onTypeChange: (value: string) => void;
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
    <div className="w-64 shrink-0 border border-gray-200 rounded-md bg-white p-4 flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-bold mb-3">Module settings</h3>

        <label className="block text-xs text-gray-500 mb-1">Module</label>
        <select
          value={selectedModule}
          onChange={(e) => onModuleChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 mb-3 bg-white"
        >
          {moduleOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <label className="block text-xs text-gray-500 mb-1">Type</label>
        <select
          value={selectedType}
          onChange={(e) => onTypeChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
        >
          {lessonTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-gray-400 mt-1">
          A module holds content or a quiz, never both.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold">Attachments</h3>
          <span className="text-xs text-gray-400">{attachments.length}</span>
        </div>

        <div className="flex flex-col gap-1 mb-3">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="group flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-gray-50"
            >
              <FileText size={14} className="text-gray-400 shrink-0" />
              <span className="flex-1 min-w-0 truncate text-gray-700">
                {attachment.name}
              </span>
              <button
                type="button"
                aria-label="Remove attachment"
                className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                onClick={() => removeAttachment(attachment.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addAttachment}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded py-2 hover:border-gray-400 hover:text-gray-600"
        >
          <Upload size={13} />
          Upload a file
        </button>
      </div>
    </div>
  );
}
