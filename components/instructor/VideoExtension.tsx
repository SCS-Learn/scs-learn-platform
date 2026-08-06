"use client";

import { Node, mergeAttributes, type CommandProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";

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
  const embed = getVideoEmbed(src);

  return (
    <NodeViewWrapper data-video-src={src} className="my-4">
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
    };
  },

  parseHTML() {
    return [{ tag: "div[data-video-src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-video-src": HTMLAttributes.src })];
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
