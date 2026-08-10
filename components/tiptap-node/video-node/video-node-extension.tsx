"use client";

import { Node, mergeAttributes, type CommandProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { Link2 } from "lucide-react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      setVideo: (options: { src: string }) => ReturnType;
    };
  }
}

function getVideoEmbed(rawUrl: string): { kind: "iframe" | "file"; src: string } {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtube.com") {
      const id = url.searchParams.get("v") ?? url.pathname.split("/").pop();
      return { kind: "iframe", src: `https://www.youtube.com/embed/${id}` };
    }
    if (host === "youtu.be") {
      return { kind: "iframe", src: `https://www.youtube.com/embed/${url.pathname.slice(1)}` };
    }
    if (host === "vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean).pop();
      return { kind: "iframe", src: `https://player.vimeo.com/video/${id}` };
    }
    if (host === "loom.com") {
      const id = url.pathname.split("/").filter(Boolean).pop();
      return { kind: "iframe", src: `https://www.loom.com/embed/${id}` };
    }
    if (/\.(mp4|webm|ogg|mov)$/i.test(url.pathname)) {
      return { kind: "file", src: rawUrl };
    }
    return { kind: "iframe", src: rawUrl };
  } catch {
    return { kind: "file", src: rawUrl };
  }
}

function VideoView({ node }: ReactNodeViewProps<HTMLDivElement>) {
  const src = node.attrs.src as string;
  const href = node.attrs.href as string | null;
  const embed = getVideoEmbed(src);

  return (
    <NodeViewWrapper data-video-src={src} className="relative my-4">
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={`Linked to ${href}`}
          className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-black/70 text-white text-xs rounded px-1.5 py-1 hover:bg-black"
        >
          <Link2 size={12} />
        </a>
      )}
      {embed.kind === "iframe" ? (
        <div className="relative w-full rounded-md overflow-hidden bg-black" style={{ paddingTop: "56.25%" }}>
          <iframe
            src={embed.src}
            className="absolute inset-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <video src={embed.src} controls className="w-full rounded-md bg-black" />
      )}
    </NodeViewWrapper>
  );
}

export const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      href: {
        default: null,
        rendered: false,
        parseHTML: (element) =>
          element.parentElement?.tagName === "A"
            ? element.parentElement.getAttribute("href")
            : null,
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-video-src]" }];
  },

  renderHTML({ HTMLAttributes, node }): DOMOutputSpec {
    const div = ["div", mergeAttributes(HTMLAttributes, { "data-video-src": HTMLAttributes.src })] as const;
    return node.attrs.href ? ["a", { href: node.attrs.href }, div] : div;
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoView);
  },

  addCommands() {
    return {
      setVideo:
        (options: { src: string }) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name, attrs: options }),
    };
  },
});
