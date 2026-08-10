"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { ImagePlus, Video as VideoIcon } from "lucide-react";
import EditorToolbar from "./EditorToolbar";
import { Video } from "./VideoExtension";
import { LinkableImage } from "./ImageExtension";
import { uploadLessonFile } from "@/lib/instructor/upload";

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
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      LinkableImage,
      Placeholder.configure({ placeholder: "Start writing this lesson…" }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Video,
    ],
    content,
    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[400px] px-8 py-6",
      },
    },
  });

  const insertImage = () => imageInputRef.current?.click();
  const insertVideo = () => videoInputRef.current?.click();

  const insertImageFromUrl = () => {
    const url = window.prompt("Image URL");
    if (url) editor?.chain().focus().setImage({ src: url }).run();
  };

  const insertVideoFromUrl = () => {
    const url = window.prompt("Video URL — YouTube, Vimeo, Loom, or a direct .mp4/.webm link");
    if (url) editor?.chain().focus().setVideo({ src: url }).run();
  };

  const handleImageFile = async (file: File) => {
    setIsUploading(true);
    try {
      const uploaded = await uploadLessonFile(lessonId, file);
      editor?.chain().focus().setImage({ src: uploaded.url }).run();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleVideoFile = async (file: File) => {
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

  return (
    <div className="flex-1 min-w-0 border border-gray-200 rounded-md overflow-hidden bg-white flex flex-col">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleImageFile(file);
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleVideoFile(file);
        }}
      />

      <div className="px-8 pt-6">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Lesson title"
          className="w-full text-3xl font-serif font-bold outline-none placeholder:text-gray-300"
        />
      </div>

      <EditorToolbar editor={editor} onInsertImage={insertImage} onInsertVideo={insertVideo} />

      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />

        <div className="px-8 pb-8 flex gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={insertImage}
              disabled={isUploading}
              className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-md py-6 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-500 disabled:opacity-50"
            >
              <ImagePlus size={16} />
              {isUploading ? "Uploading…" : "Upload an image"}
            </button>
            <button
              type="button"
              onClick={insertImageFromUrl}
              className="text-xs text-gray-400 hover:text-primary hover:underline self-center"
            >
              or paste an image URL
            </button>
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={insertVideo}
              disabled={isUploading}
              className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-md py-6 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-500 disabled:opacity-50"
            >
              <VideoIcon size={16} />
              {isUploading ? "Uploading…" : "Upload a video"}
            </button>
            <button
              type="button"
              onClick={insertVideoFromUrl}
              className="text-xs text-gray-400 hover:text-primary hover:underline self-center"
            >
              or paste a YouTube/Vimeo/video link
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 px-8 py-2 text-xs text-gray-400">
        {wordCount.toLocaleString()} words
      </div>
    </div>
  );
}
