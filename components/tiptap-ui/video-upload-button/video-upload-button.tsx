"use client";

import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Video as VideoIcon } from "lucide-react";

import { useTiptapEditor } from "@/hooks/use-tiptap-editor";
import { Button, type ButtonProps } from "@/components/tiptap-ui-primitive/button";
import { uploadLessonFile } from "@/lib/instructor/upload";

export interface VideoUploadButtonProps extends Omit<ButtonProps, "type"> {
  editor?: Editor | null;
  lessonId: string;
  text?: string;
}

export function VideoUploadButton({
  editor: providedEditor,
  lessonId,
  text,
  onClick,
  ...buttonProps
}: VideoUploadButtonProps) {
  const { editor } = useTiptapEditor(providedEditor);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      const uploaded = await uploadLessonFile(lessonId, file);
      editor?.chain().focus().setVideo({ src: uploaded.url }).run();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to upload video");
    } finally {
      setIsUploading(false);
    }
  };

  if (!editor?.isEditable) return null;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        role="button"
        tabIndex={-1}
        disabled={isUploading}
        aria-label="Add video"
        tooltip="Add video"
        {...buttonProps}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          inputRef.current?.click();
        }}
      >
        <VideoIcon className="tiptap-button-icon" size={16} />
        {text && <span className="tiptap-button-text">{isUploading ? "Uploading…" : text}</span>}
      </Button>
    </>
  );
}
