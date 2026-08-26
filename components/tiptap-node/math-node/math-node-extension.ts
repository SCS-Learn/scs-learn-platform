import { Node, ReactNodeViewRenderer, mergeAttributes, nodeInputRule } from "@tiptap/react"
import { MathNode as MathNodeComponent } from "@/components/tiptap-node/math-node/math-node"

// Matches "$latex$" typed inline, but not the "$" pair that opens/closes a
// "$$latex$$" block (the negative lookarounds keep the two rules from firing
// on each other's text).
const inlineMathInputRegex = /(?<!\$)\$([^$\n]+)\$(?!\$)$/

// Matches a "$$latex$$" block. Meant to be typed on its own line, same as
// Markdown / LaTeX convention - a block-level atom can't sit mid-paragraph.
const blockMathInputRegex = /\$\$([^$\n]+)\$\$$/

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    mathInline: {
      insertMathInline: (latex?: string) => ReturnType
    }
    mathBlock: {
      insertMathBlock: (latex?: string) => ReturnType
    }
  }
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: "" },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="math-inline"]',
        getAttrs: (el) => ({
          latex: (el as HTMLElement).getAttribute("data-latex") ?? (el as HTMLElement).textContent ?? "",
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "math-inline", "data-latex": node.attrs.latex }, HTMLAttributes),
      node.attrs.latex,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeComponent)
  },

  addCommands() {
    return {
      insertMathInline:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    }
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: inlineMathInputRegex,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ]
  },
})

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      latex: { default: "" },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-block"]',
        getAttrs: (el) => ({
          latex: (el as HTMLElement).getAttribute("data-latex") ?? (el as HTMLElement).textContent ?? "",
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "math-block", "data-latex": node.attrs.latex }, HTMLAttributes),
      node.attrs.latex,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeComponent)
  },

  addCommands() {
    return {
      insertMathBlock:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    }
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: blockMathInputRegex,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ]
  },
})

export default MathInline
