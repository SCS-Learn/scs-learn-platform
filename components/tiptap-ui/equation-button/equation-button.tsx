"use client"

import type { Editor } from "@tiptap/react"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { Button, type ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { SigmaIcon } from "@/components/tiptap-icons/sigma-icon"

export interface EquationButtonProps extends Omit<ButtonProps, "type"> {
  editor?: Editor | null
  text?: string
}

/** Inserts an empty math node at the cursor, which opens straight into edit mode. */
export function EquationButton({
  editor: providedEditor,
  text,
  onClick,
  ...buttonProps
}: EquationButtonProps) {
  const { editor } = useTiptapEditor(providedEditor)

  if (!editor?.isEditable) return null

  return (
    <Button
      type="button"
      variant="ghost"
      role="button"
      tabIndex={-1}
      aria-label="Insert equation"
      tooltip="Equation"
      {...buttonProps}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        editor.chain().focus().insertMathInline().run()
      }}
    >
      <SigmaIcon className="tiptap-button-icon" />
      {text && <span className="tiptap-button-text">{text}</span>}
    </Button>
  )
}

export default EquationButton
