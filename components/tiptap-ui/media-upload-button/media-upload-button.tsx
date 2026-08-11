"use client";

import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Image as ImageIcon, Video as VideoIcon, Upload, Link2 } from "lucide-react";

import { useTiptapEditor } from "@/hooks/use-tiptap-editor";
import { Button, type ButtonProps } from "@/components/tiptap-ui-primitive/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/tiptap-ui-primitive/popover";
import { Card, CardBody, CardItemGroup } from "@/components/tiptap-ui-primitive/card";
import { Input } from "@/components/tiptap-ui-primitive/input";
import { uploadLessonFile } from "@/lib/instructor/upload";

type MediaKind = "image" | "video";

const KIND_CONFIG: Record<
  MediaKind,
  {
    Icon: typeof ImageIcon;
    accept: string;
    label: string;
    placeholder: string;
    insert: (editor: Editor, src: string) => void;
  }
> = {
  image: {
    Icon: ImageIcon,
    accept: "image/*",
    label: "Add image",
    placeholder: "Paste an image link…",
    insert: (editor, src) => editor.chain().focus().setImage({ src }).run(),
  },
  video: {
    Icon: VideoIcon,
    accept: "video/*",
    label: "Add video",
    placeholder: "YouTube, Vimeo, Loom, or a direct video link…",
    insert: (editor, src) => editor.chain().focus().setVideo({ src }).run(),
  },
};

export interface MediaUploadButtonProps extends Omit<ButtonProps, "type"> {
  editor?: Editor | null;
  kind: MediaKind;
  lessonId?: string;
  text?: string;
}

export function MediaUploadButton({
  editor: providedEditor,
  kind,
  lessonId,
  text,
  onClick,
  ...buttonProps
}: MediaUploadButtonProps) {
  const { editor } = useTiptapEditor(providedEditor);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const config = KIND_CONFIG[kind];
  const Icon = config.Icon;

  const closeAndReset = () => {
    setIsOpen(false);
    setUrl("");
  };

  const handleAddLink = () => {
    if (!editor || !url.trim()) return;
    config.insert(editor, url.trim());
    closeAndReset();
  };

  const handleFile = async (file: File) => {
    if (!lessonId) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadLessonFile(lessonId, file);
      if (editor) config.insert(editor, uploaded.url);
      closeAndReset();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : `Failed to upload ${kind}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (!editor?.isEditable) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <input
        ref={inputRef}
        type="file"
        accept={config.accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFile(file);
        }}
      />

      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="button"
          tabIndex={-1}
          aria-label={config.label}
          tooltip={config.label}
          {...buttonProps}
          onClick={(event) => {
            onClick?.(event);
            if (event.defaultPrevented) return;
            setIsOpen((prev) => !prev);
          }}
        >
          <Icon className="tiptap-button-icon" size={16} />
          {text && <span className="tiptap-button-text">{text}</span>}
        </Button>
      </PopoverTrigger>

      <PopoverContent collisionPadding={4}>
        <Card style={{ color: "#000" }}>
          <CardBody>
            <CardItemGroup orientation="horizontal">
              <Input
                type="url"
                placeholder={config.placeholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddLink();
                  }
                }}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                className="tiptap-link-input"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={handleAddLink}
                disabled={!url.trim()}
                title="Add link"
              >
                <Link2 className="tiptap-button-icon" size={14} />
              </Button>
            </CardItemGroup>

            {lessonId && (
              <>
                <div className="flex items-center gap-2 py-1">
                  <span className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] text-gray-400">or</span>
                  <span className="flex-1 h-px bg-gray-200" />
                </div>
                <CardItemGroup>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isUploading}
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="tiptap-button-icon" size={14} />
                    {isUploading ? "Uploading…" : "Upload a file"}
                  </Button>
                </CardItemGroup>
              </>
            )}
          </CardBody>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
