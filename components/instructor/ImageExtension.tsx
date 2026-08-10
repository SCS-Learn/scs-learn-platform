"use client";

import Image from "@tiptap/extension-image";
import type { DOMOutputSpec } from "@tiptap/pm/model";

// Adds an optional `href` so an image can be wrapped in a link, same as text.
// Images are block atoms (no marks allowed), so this has to be a real node
// attribute rather than Tiptap's usual mark-based Link — that's what makes
// it survive a save/reload instead of silently dropping on parse.
export const LinkableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
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

  renderHTML(props): DOMOutputSpec {
    const base = this.parent?.(props) ?? (["img", props.HTMLAttributes] as const);
    return props.node.attrs.href ? ["a", { href: props.node.attrs.href }, base] : base;
  },
});
