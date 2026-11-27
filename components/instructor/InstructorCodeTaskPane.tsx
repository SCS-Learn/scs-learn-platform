"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, EyeOff, FileArchive, Loader2, Save, Upload } from "lucide-react";
import LessonTitle from "@/components/lesson/LessonTitle";
import CodeEditor from "@/components/code-task/CodeEditor";
import CodeTaskBlock from "@/components/code-task/CodeTaskBlock";
import { updateCodeTask, uploadCodeTaskAutograder } from "@/lib/code-task/actions";
import type { CodeTask } from "@/lib/code-task/types";

type Tab = "setup" | "preview";

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** Instructor editor for an IDE task: instructions, starter code, and the Gradescope autograder. */
export default function InstructorCodeTaskPane({
  courseCode,
  blockId,
  initialTask,
  lessonTitle,
  onTitleChange,
}: {
  courseCode: string;
  blockId: string;
  initialTask: CodeTask;
  lessonTitle: string;
  onTitleChange?: (title: string) => void;
}) {
  const [saved, setSaved] = useState(initialTask);
  const [promptHtml, setPromptHtml] = useState(initialTask.promptHtml);
  const [starterCode, setStarterCode] = useState(initialTask.starterCode);
  const [entryFile, setEntryFile] = useState(initialTask.entryFile);
  const [tab, setTab] = useState<Tab>("setup");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isUploading, startUploading] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = promptHtml !== saved.promptHtml || starterCode !== saved.starterCode || entryFile !== saved.entryFile;
  const draft: CodeTask = { ...saved, promptHtml, starterCode, entryFile };
  const autograder = saved.autograder;

  const save = () => {
    setMessage(null);
    startSaving(async () => {
      try {
        const next = await updateCodeTask(courseCode, blockId, { promptHtml, starterCode, entryFile });
        setSaved(next);
        setMessage({ tone: "ok", text: "Saved." });
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save." });
      }
    });
  };

  const upload = (file: File) => {
    setMessage(null);
    startUploading(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const next = await uploadCodeTaskAutograder(courseCode, blockId, formData);
        setSaved(next);
        setEntryFile(next.entryFile);
        const tests = next.autograder?.tests.length ?? 0;
        setMessage({ tone: "ok", text: `Parsed ${file.name}: ${tests} test${tests === 1 ? "" : "s"}, ${formatPoints(next.autograder?.totalPoints ?? 0)} points.` });
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not read that zip." });
      } finally {
        if (fileInput.current) fileInput.current.value = "";
      }
    });
  };

  return (
    <article className="topic-lesson min-h-full flex flex-col w-full">
      <div className="topic-lesson-header">
        <LessonTitle title={lessonTitle} onChange={onTitleChange} />
        <div className="lesson-tab-bar" role="tablist" aria-label="IDE task sections">
          {(["setup", "preview"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`lesson-tab${tab === t ? " is-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "setup" ? "Task setup" : "Try it as a student"}
            </button>
          ))}
        </div>
      </div>

      {tab === "preview" ? (
        <div>
          <p className="mx-8 mt-5 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Preview of your current edits{dirty ? " (not saved yet)" : ""}. Hidden tests are shown here; students only see how many there are.
          </p>
          <CodeTaskBlock key={`${saved.autograder?.files.length}-${starterCode.length}`} blockId={blockId} task={draft} revealHiddenTests persist={false} />
        </div>
      ) : (
        <div className="flex flex-col gap-8 px-8 py-6">
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Autograder</h2>
                <p className="text-sm text-gray-500">
                  Upload the same Gradescope autograder zip you use on Gradescope (setup.sh, run_autograder, and tests).
                </p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".zip,application/zip"
                className="sr-only"
                id={`autograder-${blockId}`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                }}
              />
              <label
                htmlFor={`autograder-${blockId}`}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-black px-4 py-2 text-sm font-bold btn-fill-gray-50 ${isUploading ? "pointer-events-none opacity-50" : ""}`}
              >
                {isUploading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}
                {autograder ? "Replace zip" : "Upload zip"}
              </label>
            </div>

            {autograder ? (
              <div className="rounded-lg border border-gray-200">
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                  <span>
                    <span className="font-bold">{autograder.tests.length}</span> tests
                  </span>
                  <span>
                    <span className="font-bold">{formatPoints(autograder.totalPoints)}</span> points
                  </span>
                  <span>
                    <span className="font-bold">{autograder.tests.filter((t) => t.visibility !== "visible").length}</span> hidden
                  </span>
                  <span>
                    Language: <span className="font-bold capitalize">{autograder.language ?? "unknown"}</span>
                  </span>
                  {autograder.submissionFiles.length > 0 && (
                    <span>
                      Students submit: <span className="font-mono">{autograder.submissionFiles.join(", ")}</span>
                    </span>
                  )}
                </div>

                {autograder.warnings.length > 0 && (
                  <ul className="border-b border-gray-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                    {autograder.warnings.map((w) => (
                      <li key={w} className="flex items-start gap-2 py-0.5">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                        {w}
                      </li>
                    ))}
                  </ul>
                )}

                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-gray-500">
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-2 font-bold">#</th>
                      <th className="px-4 py-2 font-bold">Test</th>
                      <th className="px-4 py-2 font-bold">Points</th>
                      <th className="px-4 py-2 font-bold">Visibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autograder.tests.map((t) => (
                      <tr key={t.id} className="border-b border-gray-100 last:border-b-0 align-top">
                        <td className="px-4 py-2 tabular-nums text-gray-500">{t.number ?? "–"}</td>
                        <td className="px-4 py-2">
                          {t.name}
                          <span className="block font-mono text-[11px] text-gray-400">
                            {t.file} · {t.className}.{t.methodName}
                          </span>
                        </td>
                        <td className="px-4 py-2 tabular-nums">{formatPoints(t.maxScore)}</td>
                        <td className="px-4 py-2">
                          {t.visibility === "visible" ? (
                            "Visible"
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-600">
                              <EyeOff size={12} aria-hidden /> {t.visibility.replace(/_/g, " ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <details className="border-t border-gray-200 px-4 py-2.5">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-600">
                    <FileArchive size={12} className="mr-1 inline" aria-hidden />
                    {autograder.files.length} files in the zip
                  </summary>
                  <ul className="mt-2 grid gap-0.5 font-mono text-xs text-gray-600">
                    {autograder.files.map((f) => (
                      <li key={f.path}>{f.path}</li>
                    ))}
                  </ul>
                </details>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                No autograder yet. Upload a zip to see its tests here.
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-1 text-base font-bold">Instructions</h2>
            <p className="mb-2 text-sm text-gray-500">Shown above the editor. HTML is allowed.</p>
            <textarea
              value={promptHtml}
              onChange={(e) => setPromptHtml(e.target.value)}
              rows={6}
              aria-label="Task instructions (HTML)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs leading-relaxed"
            />
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="mb-1 text-base font-bold">Starter code</h2>
                <p className="text-sm text-gray-500">What students see when they open the task.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">File name</span>
                <input
                  value={entryFile}
                  onChange={(e) => setEntryFile(e.target.value)}
                  aria-label="Student file name"
                  className="w-48 rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                />
              </label>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <CodeEditor value={starterCode} onChange={setStarterCode} language={saved.language} height={280} ariaLabel="Starter code" />
            </div>
          </section>

          <div className="sticky bottom-0 -mx-8 flex items-center gap-3 border-t border-gray-100 bg-white px-8 py-4">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white btn-fill-primary-dark disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />}
              Save task
            </button>
            {message && (
              <p role="status" className={`text-sm ${message.tone === "error" ? "text-primary" : "text-green-700"}`}>
                {message.text}
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
