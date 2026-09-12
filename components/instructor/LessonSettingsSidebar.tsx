"use client";

import { useRef, useState, type ReactNode } from "react";
import { Eye, FileText, Save, Send, Upload, X } from "lucide-react";
import { lessonTypeOptions, type Attachment } from "@/lib/instructor/mock-data";
import { uploadLessonFile } from "@/lib/instructor/upload";
import { addAttachment, deleteAttachment } from "@/lib/instructor/data/attachments";

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
      {children}
    </p>
  );
}

function SectionBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <SectionLabel>{label}</SectionLabel>
      <div className="text-sm leading-relaxed text-gray-800">{children}</div>
    </section>
  );
}

export default function LessonSettingsSidebar({
  lessonId,
  attachments,
  unitLabel,
  lessonLabel,
  currentModule,
  selectedType,
  onTypeChange,
  wordCount,
  isPublished,
  savedLabel,
  showQuizCompletionThreshold,
  quizCompletionThreshold,
  onQuizCompletionThresholdChange,
  onPreview,
  onSaveDraft,
  onPublish,
}: {
  lessonId: string;
  attachments: Attachment[];
  unitLabel: string;
  lessonLabel: string;
  currentModule: string;
  selectedType: string;
  onTypeChange: (value: string) => void;
  wordCount: number;
  isPublished: boolean;
  savedLabel: string;
  showQuizCompletionThreshold: boolean;
  quizCompletionThreshold: number;
  onQuizCompletionThresholdChange: (value: number) => void;
  onPreview: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
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
    <div className="h-full min-h-0 bg-white flex flex-col overflow-hidden border border-gray-300">
      <div className="px-4 py-5 border-b border-gray-100">
        <h2 className="text-lg font-bold mb-5">Lesson settings</h2>

        {lessonLabel ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-base font-bold leading-snug">{lessonLabel}</p>
              {unitLabel && (
                <p className="text-sm text-gray-600 leading-relaxed">{unitLabel}</p>
              )}
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-3">
              <span
                className={`inline-block px-2 py-1 text-[11px] font-bold tracking-wide ${
                  isPublished ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {isPublished ? "PUBLISHED" : "DRAFT"}
              </span>

              {savedLabel && (
                <p className="text-sm text-gray-500 leading-relaxed">{savedLabel}</p>
              )}

              <p className="text-sm text-gray-500 leading-relaxed">
                {wordCount.toLocaleString()} words
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 leading-relaxed">
            Select a lesson to edit settings.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        <SectionBlock label="Module">
          <p className="leading-relaxed truncate">{currentModule || "—"}</p>
        </SectionBlock>

        <SectionBlock label="Type">
          <select
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
            disabled={!lessonId}
            className="w-full text-sm border border-gray-200 rounded px-3 py-2.5 bg-white disabled:opacity-50"
          >
            {lessonTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <p className="mt-3 text-sm text-gray-500 leading-relaxed">
            A module is content, a quiz, or an external assignment.
          </p>
        </SectionBlock>

        {showQuizCompletionThreshold && (
          <SectionBlock label="Completion threshold">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={quizCompletionThreshold}
                disabled={!lessonId}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  if (!Number.isNaN(parsed)) onQuizCompletionThresholdChange(parsed);
                }}
                className="w-20 text-sm border border-gray-200 rounded px-3 py-2.5 bg-white disabled:opacity-50"
              />
              <span className="text-sm text-gray-600">%</span>
            </div>
            <p className="mt-3 text-sm text-gray-500 leading-relaxed">
              Minimum quiz score required before students can mark this lesson complete.
            </p>
          </SectionBlock>
        )}

        <section>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Attachments
            </p>
            <span className="text-sm text-gray-400">{localAttachments.length}</span>
          </div>

          <div className="flex flex-col gap-1 mb-4">
            {localAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group flex items-center gap-2 px-2 py-2.5 hover:bg-gray-50 rounded"
              >
                <FileText size={14} className="text-gray-400 shrink-0" />
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-w-0 truncate text-sm text-gray-700 hover:text-iron-gray hover:underline text-left"
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
            disabled={!lessonId || isUploading}
            className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-bold text-black border border-black px-4 py-2.5 hover:bg-gray-50 disabled:opacity-50"
          >
            <Upload size={15} />
            {isUploading ? "Uploading…" : "Upload a file"}
          </button>
        </section>
      </div>

      <div className="p-4 border-t border-gray-100 flex flex-col gap-2">
        <button
          type="button"
          onClick={onPublish}
          disabled={!lessonId}
          className="w-full inline-flex items-center justify-center gap-1.5 text-base font-bold bg-primary text-white px-4 py-3 hover:opacity-90 disabled:opacity-40"
        >
          <Send size={16} />
          Publish
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={!lessonId}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-bold text-black border border-black px-4 py-2.5 hover:bg-gray-50 disabled:opacity-40"
        >
          <Save size={15} />
          Save draft
        </button>
        <button
          type="button"
          onClick={onPreview}
          disabled={!lessonId}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-bold text-black border border-black px-4 py-2.5 hover:bg-gray-50 disabled:opacity-40"
        >
          <Eye size={15} />
          Preview
        </button>
      </div>
    </div>
  );
}
