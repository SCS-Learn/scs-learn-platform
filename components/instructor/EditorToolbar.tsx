"use client";

import { type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Link2,
  List,
  ListOrdered,
  Code,
  Image as ImageIcon,
  Video as VideoIcon,
  Paperclip,
  Table as TableIcon,
  Undo2,
  Redo2,
} from "lucide-react";

const PARAGRAPH_STYLES = [
  { label: "Paragraph", value: "paragraph" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
];

function currentParagraphStyle(editor: Editor) {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  return "paragraph";
}

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`p-1.5 rounded ${
        active ? "bg-gray-200 text-black" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

export default function EditorToolbar({
  editor,
  onInsertImage,
  onInsertVideo,
  onInsertAttachment,
}: {
  editor: Editor | null;
  onInsertImage: () => void;
  onInsertVideo: () => void;
  onInsertAttachment: () => void;
}) {
  if (!editor) return null;

  const setParagraphStyle = (value: string) => {
    if (value === "paragraph") {
      editor.chain().focus().setParagraph().run();
    } else {
      const level = Number(value.replace("h", "")) as 1 | 2 | 3;
      editor.chain().focus().toggleHeading({ level }).run();
    }
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previousUrl ?? "");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertTable = () => {
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  };

  return (
    <div className="flex items-center gap-1 border-b border-gray-200 px-2 py-1.5">
      <select
        value={currentParagraphStyle(editor)}
        onChange={(e) => setParagraphStyle(e.target.value)}
        className="text-sm border border-gray-200 rounded px-2 py-1 mr-2 bg-white"
      >
        {PARAGRAPH_STYLES.map((style) => (
          <option key={style.value} value={style.value}>
            {style.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline size={16} />
        </ToolbarButton>
        <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>
          <Link2 size={16} />
        </ToolbarButton>
      </div>

      <div className="w-px h-5 bg-gray-200 mx-1.5" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Ordered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code size={16} />
        </ToolbarButton>
      </div>

      <div className="w-px h-5 bg-gray-200 mx-1.5" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton label="Insert image" onClick={onInsertImage}>
          <ImageIcon size={16} />
        </ToolbarButton>
        <ToolbarButton label="Insert video" onClick={onInsertVideo}>
          <VideoIcon size={16} />
        </ToolbarButton>
        <ToolbarButton label="Insert attachment" onClick={onInsertAttachment}>
          <Paperclip size={16} />
        </ToolbarButton>
        <ToolbarButton label="Insert table" onClick={insertTable}>
          <TableIcon size={16} />
        </ToolbarButton>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </ToolbarButton>
      </div>
    </div>
  );
}
