import { GRADESCOPE_UTILS_SHIM, PYTHON_HARNESS } from "./python-harness.ts";
import type { CodeTask, CodeTaskRun, TestRunResult } from "./types.ts";

// Runs a Python IDE task's autograder in the student's browser: Pyodide
// (CPython compiled to WebAssembly) inside a Web Worker, so a slow or looping
// submission never freezes the page, and a timeout simply kills the worker.
//
// Trial-run trade-off: the autograder's files, hidden tests included, are
// sent to the browser, so a determined student can read them and the score
// is self-reported. Fine for practice; graded work needs a server-side
// runner (Docker / Tango) behind the same CodeTaskRun shape.

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
export const DEFAULT_RUN_TIMEOUT_MS = 15_000;

// Classic (non-module) worker built from a string: importScripts() needs a
// classic worker, and a Blob URL keeps it out of the Next bundler entirely.
export const WORKER_SOURCE = `
let pyodideReady = null;
function boot() {
  if (!pyodideReady) {
    importScripts(${JSON.stringify(`${PYODIDE_BASE}pyodide.js`)});
    pyodideReady = loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_BASE)} });
  }
  return pyodideReady;
}
function writeFile(py, path, content) {
  const full = "/work/" + path;
  const dir = full.slice(0, full.lastIndexOf("/"));
  if (dir) py.FS.mkdirTree(dir);
  py.FS.writeFile(full, content);
}
self.onmessage = async (event) => {
  const msg = event.data;
  try {
    const py = await boot();
    if (msg.type === "warmup") {
      self.postMessage({ id: msg.id, ok: true });
      return;
    }
    py.runPython("import os, shutil\\nshutil.rmtree('/work', ignore_errors=True)\\nos.makedirs('/work', exist_ok=True)");
    for (const file of msg.files) writeFile(py, file.path, file.content);
    writeFile(py, msg.entryFile, msg.code);
    py.runPython(msg.harness);
    const runTask = py.globals.get("run_task");
    const testFiles = py.toPy(msg.testFiles);
    try {
      const json = runTask("/work", testFiles, msg.entryModule);
      self.postMessage({ id: msg.id, ok: true, report: JSON.parse(json) });
    } finally {
      testFiles.destroy();
      runTask.destroy();
    }
  } catch (error) {
    self.postMessage({ id: msg.id, ok: false, error: String(error && error.message ? error.message : error) });
  }
};
`;

type WorkerReply =
  | { id: number; ok: true; report?: { stdout: string; runError: string | null; results: TestRunResult[] } }
  | { id: number; ok: false; error: string };

export class PyodideRunner {
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private nextId = 1;
  private pending = new Map<number, (reply: WorkerReply) => void>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(this.workerUrl);
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const resolve = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      resolve?.(event.data);
    };
    worker.onerror = (event) => {
      const error = event.message || "The Python runner crashed.";
      for (const [id, resolve] of this.pending) resolve({ id, ok: false, error });
      this.pending.clear();
      this.dispose();
    };
    this.worker = worker;
    return worker;
  }

  private send(message: Record<string, unknown>, timeoutMs: number): Promise<WorkerReply> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // The only way to stop runaway Python is to kill its worker; the
        // next run boots a fresh one.
        this.dispose();
        resolve({ id, ok: false, error: `Timed out after ${Math.round(timeoutMs / 1000)} seconds. Check for an infinite loop.` });
      }, timeoutMs);
      this.pending.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      worker.postMessage({ ...message, id });
    });
  }

  /** Downloads and starts Python ahead of the first run (~10 MB, cached by the browser afterwards). */
  async warmup(): Promise<void> {
    const reply = await this.send({ type: "warmup" }, 120_000);
    if (!reply.ok) throw new Error(reply.error);
  }

  async run(task: CodeTask, code: string, timeoutMs = DEFAULT_RUN_TIMEOUT_MS): Promise<CodeTaskRun> {
    const autograder = task.autograder;
    if (!autograder || autograder.tests.length === 0) {
      return { results: [], score: 0, maxScore: 0, runError: "This task has no autograder tests yet.", stdout: "" };
    }
    if (task.language !== "python") {
      return { results: [], score: 0, maxScore: autograder.totalPoints, runError: "Only Python tasks can run in the browser so far.", stdout: "" };
    }

    // Python boot time is not the student's fault: warm up on a long timer first.
    await this.warmup();

    const hasOwnUtils = autograder.files.some((f) => f.path.startsWith("gradescope_utils/"));
    const files = [...(hasOwnUtils ? [] : GRADESCOPE_UTILS_SHIM), ...autograder.files];
    const reply = await this.send(
      {
        type: "run",
        files,
        entryFile: task.entryFile,
        entryModule: task.entryFile.replace(/\.py$/, "").replace(/\//g, "."),
        code,
        harness: PYTHON_HARNESS,
        testFiles: [...new Set(autograder.tests.map((t) => t.file))],
      },
      timeoutMs
    );

    if (!reply.ok) {
      return { results: [], score: 0, maxScore: autograder.totalPoints, runError: reply.error, stdout: "" };
    }
    const report = reply.report!;
    // Score against the parsed test list, so a test the runner never reached counts as 0.
    const byId = new Map(report.results.map((r) => [r.testId, r]));
    const results = autograder.tests.map(
      (test): TestRunResult =>
        byId.get(test.id) ?? { testId: test.id, status: "error", score: 0, maxScore: test.maxScore, output: "This test did not run." }
    );
    return {
      results,
      score: Math.round(results.reduce((sum, r) => sum + r.score, 0) * 100) / 100,
      maxScore: autograder.totalPoints,
      runError: report.runError,
      stdout: report.stdout,
    };
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
    this.workerUrl = null;
  }
}
