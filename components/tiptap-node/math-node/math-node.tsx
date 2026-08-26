"use client"

import { useEffect, useRef, useState } from "react"
import type { NodeViewProps } from "@tiptap/react"
import { NodeViewWrapper } from "@tiptap/react"
import katex from "katex"
import "katex/dist/katex.min.css"
import "@/components/tiptap-node/math-node/math-node.scss"

/** Shared node view for both the "mathInline" and "mathBlock" nodes - renders KaTeX, or an editable textarea for the raw LaTeX source while selected. */
export function MathNode({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const displayMode = node.type.name === "mathBlock"
  const [isEditing, setIsEditing] = useState(node.attrs.latex === "")
  const [draft, setDraft] = useState<string>(node.attrs.latex)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!selected && isEditing) {
      updateAttributes({ latex: draft })
      setIsEditing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const html = (() => {
    try {
      return katex.renderToString(node.attrs.latex || "", {
        displayMode,
        throwOnError: false,
      })
    } catch {
      return katex.renderToString("\\text{Invalid LaTeX}", { displayMode })
    }
  })()

  const Wrapper = displayMode ? "div" : "span"

  return (
    <NodeViewWrapper
      as={Wrapper}
      className={`math-node math-node--${displayMode ? "block" : "inline"}`}
      data-selected={selected || undefined}
      onClick={() => editor.isEditable && setIsEditing(true)}
    >
      {isEditing ? (
        <textarea
          ref={inputRef}
          className="math-node__input"
          rows={displayMode ? Math.max(1, draft.split("\n").length) : 1}
          value={draft}
          placeholder="LaTeX, e.g. x^2 + y^2 = z^2"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !displayMode) {
              e.preventDefault()
              updateAttributes({ latex: draft })
              setIsEditing(false)
              editor.commands.focus()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              setDraft(node.attrs.latex)
              setIsEditing(false)
              editor.commands.focus()
            }
          }}
          onBlur={() => {
            updateAttributes({ latex: draft })
            setIsEditing(false)
          }}
        />
      ) : (
        <span
          className="math-node__rendered"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </NodeViewWrapper>
  )
}

export default MathNode
