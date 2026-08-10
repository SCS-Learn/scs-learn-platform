"use client";

import { useRef, useState } from "react";
import { X, FileText, Upload } from "lucide-react";
import { lessonTypeOptions, type Attachment } from "@/lib/instructor/mock-data";
import { uploadLessonFile } from "@/lib/instructor/upload";
import { addAttachment, deleteAttachment } from "@/lib/instructor/data/attachments";

export default function ModuleSettingsSidebar({
  lessonId,
  attachments,
  moduleOptions,
  selectedModule,
  onModuleChange,
  selectedType,
  onTypeChange,
}: {
  lessonId: string;
  attachments: Attachment[];
  moduleOptions: string[];
  selectedModule: string;
  onModuleChange: (value: string) => void;
  selectedType: string;
  onTypeChange: (value: string) => void;
}) {
  const [localAttachments, setLocalAttachments] = useState<Attachment[]>(attachments);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const removeAttachment = (id: string) => {
    setLocalAttachments((prev) => prev.filter((a) => a.id !== id));
    deleteAttachment(id).catch((err) => window.alert(err.message));
  };

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      const uploaded = await uploadLessonFile(lessonId, file);
      const attachment = await addAttachment(lessonId, { name: file.name, ...uploaded });
      setLocalAttachments((prev) => [...prev, attachment]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setIsUploading(false);
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
          <span className="text-xs text-gray-400">{localAttachments.length}</span>
        </div>

        <div className="flex flex-col gap-1 mb-3">
          {localAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className="group flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-gray-50"
            >
              <FileText size={14} className="text-gray-400 shrink-0" />
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0 truncate text-gray-700 hover:text-primary hover:underline"
              >
                {attachment.name}
              </a>
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

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded py-2 hover:border-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          <Upload size={13} />
          {isUploading ? "Uploading…" : "Upload a file"}
        </button>
      </div>
    </div>
  );
}
