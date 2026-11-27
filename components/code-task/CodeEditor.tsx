"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Monaco (VS Code's editor) via @monaco-editor/react, which loads the editor
// itself from the jsDelivr CDN on first use. Client-only: Monaco touches
// window at import time.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
      <Loader2 size={16} className="animate-spin" aria-hidden />
      Loading editor...
    </div>
  ),
});

export default function CodeEditor({
  value,
  onChange,
  language,
  height = 420,
  onRunShortcut,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  language: "python" | "java";
  height?: number;
  /** Ctrl/Cmd+Enter inside the editor. */
  onRunShortcut?: () => void;
  ariaLabel: string;
}) {
  // Monaco registers the command once, at mount; read the latest handler through a ref.
  const runRef = useRef(onRunShortcut);
  useEffect(() => {
    runRef.current = onRunShortcut;
  }, [onRunShortcut]);

  return (
    <div style={{ height }} className="w-full">
      <MonacoEditor
        value={value}
        onChange={(next) => onChange(next ?? "")}
        language={language}
        theme="vs"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          tabSize: 4,
          insertSpaces: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          lineNumbersMinChars: 3,
          padding: { top: 12, bottom: 12 },
          ariaLabel,
        }}
        onMount={(editor, monaco) => {
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
        }}
      />
    </div>
  );
}
