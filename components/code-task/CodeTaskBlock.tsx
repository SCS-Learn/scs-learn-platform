"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, EyeOff, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import CodeEditor from "@/components/code-task/CodeEditor";
import { PyodideRunner } from "@/lib/code-task/pyodide-runner";
import type { CodeTask, CodeTaskRun, ParsedTest, TestRunResult } from "@/lib/code-task/types";

function storageKey(blockId: string) {
  return `cslearn:code-task:${blockId}`;
}

function readSaved(blockId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(blockId));
  } catch {
    return null;
  }
}

function writeSaved(blockId: string, code: string | null) {
  try {
    if (code === null) window.localStorage.removeItem(storageKey(blockId));
    else window.localStorage.setItem(storageKey(blockId), code);
  } catch {
    // Private mode / blocked storage: the code just isn't remembered.
  }
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function StatusIcon({ result }: { result: TestRunResult | undefined }) {
  if (!result) return <Circle size={16} className="shrink-0 text-gray-300" aria-label="Not run" />;
  if (result.status === "passed") return <CheckCircle2 size={16} className="shrink-0 text-green-600" aria-label="Passed" />;
  return <XCircle size={16} className="shrink-0 text-primary" aria-label={result.status === "error" ? "Error" : "Failed"} />;
}

function TestRow({ test, result, showOutputByDefault }: { test: ParsedTest; result?: TestRunResult; showOutputByDefault: boolean }) {
  const hasOutput = Boolean(result?.output);
  // Remounted per run (see key below), so this starts fresh each time.
  const [open, setOpen] = useState(showOutputByDefault);

  return (
    <li className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => hasOutput && setOpen((v) => !v)}
        aria-expanded={hasOutput ? open : undefined}
        className={`flex w-full items-start gap-2 px-3 py-2.5 text-left ${hasOutput ? "hover:bg-gray-50" : "cursor-default"}`}
      >
        <StatusIcon result={result} />
        <span className="min-w-0 flex-1 text-sm leading-snug">
          {test.number && <span className="mr-1.5 font-semibold text-gray-500 tabular-nums">{test.number}</span>}
          {test.name}
          {test.visibility !== "visible" && (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-gray-600">
              <EyeOff size={11} aria-hidden /> hidden
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs font-semibold text-gray-500 tabular-nums">
          {result ? `${formatPoints(result.score)}/` : ""}
          {formatPoints(test.maxScore)} pt{test.maxScore === 1 ? "" : "s"}
        </span>
        {hasOutput &&
          (open ? (
            <ChevronDown size={14} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
          ) : (
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
          ))}
      </button>
      {hasOutput && open && (
        <pre className="mx-3 mb-3 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2.5 font-mono text-xs leading-relaxed text-gray-800">
          {result!.output}
        </pre>
      )}
    </li>
  );
}

/**
 * An IDE task: instructions, a Monaco editor, and the autograder's tests,
 * run in the browser. Students see visible tests by name; hidden tests only
 * as a count and a combined score, as on Gradescope. `revealHiddenTests`
 * (instructor preview) shows everything.
 */
export default function CodeTaskBlock({
  blockId,
  task,
  revealHiddenTests = false,
  persist = true,
  onRun,
}: {
  blockId: string;
  task: CodeTask;
  revealHiddenTests?: boolean;
  /** Remember the student's code in this browser (off for instructor previews). */
  persist?: boolean;
  onRun?: (run: CodeTaskRun) => void;
}) {
  // The editor itself only renders in the browser, so reading saved code
  // during the first render can't cause a hydration mismatch.
  const [code, setCode] = useState(() =>
    persist && typeof window !== "undefined" ? (readSaved(blockId) ?? task.starterCode) : task.starterCode
  );
  const [run, setRun] = useState<CodeTaskRun | null>(null);
  const [runCount, setRunCount] = useState(0);
  const [phase, setPhase] = useState<"idle" | "booting" | "running">("idle");
  const runnerRef = useRef<PyodideRunner | null>(null);

  useEffect(() => {
    if (persist) writeSaved(blockId, code === task.starterCode ? null : code);
  }, [blockId, code, persist, task.starterCode]);

  // Start Python in the background so the first click isn't a 5-second wait.
  useEffect(() => {
    const runner = new PyodideRunner();
    runnerRef.current = runner;
    const idle = window.setTimeout(() => void runner.warmup().catch(() => {}), 1500);
    return () => {
      window.clearTimeout(idle);
      runner.dispose();
      runnerRef.current = null;
    };
  }, []);

  const tests = useMemo(() => task.autograder?.tests ?? [], [task.autograder]);
  const shownTests = revealHiddenTests ? tests : tests.filter((t) => t.visibility === "visible");
  const hiddenTests = revealHiddenTests ? [] : tests.filter((t) => t.visibility !== "visible");
  const resultById = useMemo(() => new Map((run?.results ?? []).map((r) => [r.testId, r])), [run]);
  const hiddenResults = hiddenTests.map((t) => resultById.get(t.id)).filter((r): r is TestRunResult => Boolean(r));
  const hiddenPassed = hiddenResults.filter((r) => r.status === "passed").length;
  const hiddenScore = hiddenResults.reduce((sum, r) => sum + r.score, 0);
  const hiddenMax = hiddenTests.reduce((sum, t) => sum + t.maxScore, 0);
  const totalPoints = task.autograder?.totalPoints ?? 0;
  const passedCount = (run?.results ?? []).filter((r) => r.status === "passed").length;
  const isBusy = phase !== "idle";
  const canRun = tests.length > 0 && task.language === "python";

  const runTests = useCallback(async () => {
    const runner = runnerRef.current;
    if (!runner || isBusy || !canRun) return;
    setPhase("booting");
    try {
      await runner.warmup();
      setPhase("running");
      const result = await runner.run(task, code);
      setRun(result);
      setRunCount((n) => n + 1);
      onRun?.(result);
    } catch (error) {
      setRun({
        results: [],
        score: 0,
        maxScore: totalPoints,
        runError: error instanceof Error ? error.message : "Python could not start in this browser.",
        stdout: "",
      });
    } finally {
      setPhase("idle");
    }
  }, [canRun, code, isBusy, onRun, task, totalPoints]);

  const allPassed = run !== null && !run.runError && run.results.length > 0 && passedCount === run.results.length;

  return (
    <section className="px-8 py-6" aria-label="Programming task">
      {task.promptHtml && (
        <div
          className="course-notes-content lesson-content-editor mb-5 max-w-3xl"
          dangerouslySetInnerHTML={{ __html: task.promptHtml }}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2">
            <span className="font-mono text-xs font-semibold text-gray-700">{task.entryFile}</span>
            <div className="flex items-center gap-1">
              <span className="mr-2 text-[11px] text-gray-400">Ctrl/Cmd + Enter to run</span>
              <button
                type="button"
                onClick={() => {
                  if (code === task.starterCode || window.confirm("Replace your code with the starter code?")) {
                    setCode(task.starterCode);
                    setRun(null);
                  }
                }}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-gray-600 btn-fill-gray-50"
              >
                <RotateCcw size={12} aria-hidden /> Reset
              </button>
            </div>
          </div>
          <CodeEditor
            value={code}
            onChange={setCode}
            language={task.language}
            onRunShortcut={() => void runTests()}
            ariaLabel={`Code editor for ${task.entryFile}`}
          />
        </div>

        <aside className="flex min-w-0 flex-col rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-3 py-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Autograder</p>
              <p className="text-lg font-bold tabular-nums" aria-live="polite">
                {run ? formatPoints(run.score) : "–"}
                <span className="text-sm font-semibold text-gray-500"> / {formatPoints(totalPoints)} pts</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runTests()}
              disabled={isBusy || !canRun}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white btn-fill-primary-dark disabled:opacity-50"
            >
              {isBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
              {phase === "booting" ? "Starting Python..." : phase === "running" ? "Running..." : "Run tests"}
            </button>
          </div>

          {allPassed && (
            <p className="flex items-center gap-2 border-b border-green-100 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
              <CheckCircle2 size={15} aria-hidden /> All tests passed.
            </p>
          )}

          {!canRun && (
            <p className="px-3 py-3 text-sm text-gray-500">
              {tests.length === 0
                ? "No autograder tests yet."
                : "This task's tests are in Java, which can't run in the browser yet."}
            </p>
          )}

          {run?.runError && (
            <div className="border-b border-gray-100 px-3 py-3">
              <p className="mb-1.5 text-sm font-semibold text-primary">Your code didn&apos;t run</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2.5 font-mono text-xs leading-relaxed text-gray-900">
                {run.runError}
              </pre>
            </div>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Tests">
            {shownTests.map((test) => {
              const result = resultById.get(test.id);
              return <TestRow key={`${test.id}-${runCount}`} test={test} result={result} showOutputByDefault={result?.status !== "passed" && Boolean(result?.output)} />;
            })}
            {hiddenTests.length > 0 && (
              <li className="flex items-start gap-2 px-3 py-2.5">
                <EyeOff size={16} className="shrink-0 text-gray-400" aria-hidden />
                <span className="min-w-0 flex-1 text-sm leading-snug text-gray-600">
                  {hiddenTests.length} hidden test{hiddenTests.length === 1 ? "" : "s"}
                  {run && !run.runError && (
                    <span className="block text-xs text-gray-500">
                      {hiddenPassed} of {hiddenTests.length} passed
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-semibold text-gray-500 tabular-nums">
                  {run && !run.runError ? `${formatPoints(hiddenScore)}/` : ""}
                  {formatPoints(hiddenMax)} pts
                </span>
              </li>
            )}
          </ul>

          {run?.stdout && (
            <details className="border-t border-gray-100 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-gray-600">Printed output</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-gray-800">{run.stdout}</pre>
            </details>
          )}

          <p className="border-t border-gray-100 px-3 py-2 text-[11px] leading-relaxed text-gray-400">
            Tests run in your browser.{persist ? " Your code is saved on this device." : ""}
          </p>
        </aside>
      </div>
    </section>
  );
}
