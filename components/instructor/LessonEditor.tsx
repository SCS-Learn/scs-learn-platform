"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { ImagePlus, Video as VideoIcon } from "lucide-react";
import EditorToolbar from "./EditorToolbar";
import { Video } from "./VideoExtension";

export default function LessonEditor({
  title,
  onTitleChange,
  content,
  onContentChange,
  wordCount,
}: {
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  onContentChange: (html: string) => void;
  wordCount: number;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image,
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

  const insertImage = () => {
    const url = window.prompt("Image URL");
    if (url) editor?.chain().focus().setImage({ src: url }).run();
  };

  const insertVideo = () => {
    const url = window.prompt("Video URL — YouTube, Vimeo, Loom, or a direct .mp4/.webm link");
    if (url) editor?.chain().focus().setVideo({ src: url }).run();
  };

  const insertAttachment = () => {
    const name = window.prompt("Attachment file name (mock — no upload yet)");
    if (name) {
      editor
        ?.chain()
        .focus()
        .insertContent(
          `<p><a href="#" data-attachment="${name}">📎 ${name}</a></p>`
        )
        .run();
    }
  };

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

      <EditorToolbar
        editor={editor}
        onInsertImage={insertImage}
        onInsertVideo={insertVideo}
        onInsertAttachment={insertAttachment}
      />

      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />

        <div className="px-8 pb-8 flex gap-3">
          <button
            type="button"
            onClick={insertImage}
            className="flex-1 flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-md py-6 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-500"
          >
            <ImagePlus size={16} />
            Paste an image URL
          </button>
          <button
            type="button"
            onClick={insertVideo}
            className="flex-1 flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-md py-6 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-500"
          >
            <VideoIcon size={16} />
            Paste a video URL
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 px-8 py-2 text-xs text-gray-400">
        {wordCount.toLocaleString()} words
      </div>
    </div>
  );
}
