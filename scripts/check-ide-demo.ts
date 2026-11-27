import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { GRADESCOPE_UTILS_SHIM, PYTHON_HARNESS } from "../lib/code-task/python-harness.ts";
import type { CodeTask } from "../lib/code-task/types.ts";
import { DEMO_DIR, DEMO_TASK_SLUGS, loadDemoTask } from "./ide-demo-tasks.ts";

// Sanity check for the demo IDE tasks, run with real CPython:
//   node --experimental-strip-types scripts/check-ide-demo.ts
// For each task: zip + parse the autograder, then run the same harness the
// browser uses against the reference solution (must earn full marks) and the
// starter code (must not). Also writes demo/ide-tasks/<slug>/autograder.zip,
// the file an instructor uploads in the editor.

type Report = {
  stdout: string;
  runError: string | null;
  results: { testId: string; status: string; score: number; maxScore: number; output: string }[];
};

function runHarness(task: CodeTask, code: string): Report {
  const work = mkdtempSync(join(tmpdir(), "ide-task-"));
  try {
    const write = (path: string, content: string) => {
      mkdirSync(dirname(join(work, path)), { recursive: true });
      writeFileSync(join(work, path), content);
    };
    for (const file of GRADESCOPE_UTILS_SHIM) write(file.path, file.content);
    for (const file of task.autograder!.files) write(file.path, file.content);
    write(task.entryFile, code);
    write("__harness__.py", PYTHON_HARNESS);
    const testFiles = [...new Set(task.autograder!.tests.map((t) => t.file))];
    const script = [
      "import json, sys",
      `exec(open(${JSON.stringify(join(work, "__harness__.py"))}).read())`,
      `print(run_task(${JSON.stringify(work)}, ${JSON.stringify(testFiles)}, ${JSON.stringify(task.entryFile.replace(/\.py$/, ""))}))`,
    ].join("\n");
    const out = execFileSync("python3", ["-c", script], { encoding: "utf8", cwd: work });
    return JSON.parse(out.trim().split("\n").at(-1)!) as Report;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

let failures = 0;
for (const slug of DEMO_TASK_SLUGS) {
  const demo = await loadDemoTask(slug);
  const ag = demo.task.autograder!;
  writeFileSync(join(DEMO_DIR, slug, "autograder.zip"), demo.zip);
  console.log(`\n== ${demo.title} (${slug}) — ${ag.tests.length} tests, ${ag.totalPoints} pts, submits ${ag.submissionFiles.join(", ")}`);
  for (const t of ag.tests) console.log(`   ${t.number ?? "-"}  ${t.maxScore}pt  ${t.visibility.padEnd(7)} ${t.name}`);
  if (ag.warnings.length) console.log(`   warnings: ${ag.warnings.join(" | ")}`);

  const solved = runHarness(demo.task, demo.solution);
  const solvedScore = solved.results.reduce((s, r) => s + r.score, 0);
  const unknown = solved.results.filter((r) => !ag.tests.some((t) => t.id === r.testId));
  const ok = !solved.runError && solved.results.length === ag.tests.length && solvedScore === ag.totalPoints && unknown.length === 0;
  console.log(`   solution: ${solvedScore}/${ag.totalPoints} ${ok ? "OK" : "FAIL"}`);
  if (!ok) {
    failures++;
    console.log(JSON.stringify(solved, null, 2));
  }

  const starter = runHarness(demo.task, demo.task.starterCode);
  const starterScore = starter.results.reduce((s, r) => s + r.score, 0);
  const starterOk = !starter.runError && starterScore < ag.totalPoints;
  console.log(`   starter:  ${starterScore}/${ag.totalPoints} ${starterOk ? "OK (fails as expected)" : "FAIL"}`);
  if (!starterOk) {
    failures++;
    console.log(JSON.stringify(starter, null, 2));
  }
}

const broken = runHarness((await loadDemoTask("pattern-count")).task, "def pattern_count(text, pattern)\n    return 0\n");
console.log(`\n== syntax error is reported once: ${broken.runError ? "OK" : "FAIL"}`);
if (!broken.runError) failures++;
else console.log(broken.runError.split("\n").slice(-3).join("\n"));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed.");
