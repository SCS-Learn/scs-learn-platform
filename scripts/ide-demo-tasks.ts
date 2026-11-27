import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import JSZip from "jszip";
import { parseGradescopeAutograderZip } from "../lib/code-task/parse-gradescope.ts";
import type { CodeTask } from "../lib/code-task/types.ts";

// Shared by scripts/check-ide-demo.ts and scripts/seed-ide-demo.ts: loads the
// demo IDE tasks from demo/ide-tasks/<slug>/, zipping each autograder folder
// exactly as an instructor would before uploading it to Gradescope.

export const DEMO_DIR = join(import.meta.dirname, "..", "demo", "ide-tasks");
export const DEMO_TASK_SLUGS = ["pattern-count", "reverse-complement", "frequent-words"];

export type DemoTask = {
  slug: string;
  title: string;
  zip: Uint8Array;
  task: CodeTask;
  solution: string;
};

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

export async function zipAutograder(slug: string): Promise<Uint8Array> {
  const root = join(DEMO_DIR, slug, "autograder");
  const zip = new JSZip();
  for (const path of listFiles(root)) {
    if (path.includes("__pycache__")) continue;
    const name = relative(root, path).split("\\").join("/");
    zip.file(name, readFileSync(path), { unixPermissions: name === "run_autograder" || name.endsWith(".sh") ? 0o755 : 0o644 });
  }
  return zip.generateAsync({ type: "uint8array", platform: "UNIX" });
}

export async function loadDemoTask(slug: string): Promise<DemoTask> {
  const dir = join(DEMO_DIR, slug);
  const meta = JSON.parse(readFileSync(join(dir, "task.json"), "utf8")) as {
    title: string;
    language: "python";
    entryFile: string;
  };
  const zip = await zipAutograder(slug);
  const autograder = await parseGradescopeAutograderZip(zip);
  return {
    slug,
    title: meta.title,
    zip,
    solution: readFileSync(join(dir, "solution.py"), "utf8"),
    task: {
      language: meta.language,
      entryFile: meta.entryFile,
      starterCode: readFileSync(join(dir, "starter.py"), "utf8"),
      promptHtml: readFileSync(join(dir, "prompt.html"), "utf8").trim(),
      autograder,
    },
  };
}
