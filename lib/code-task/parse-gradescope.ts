import JSZip from "jszip";
import type {
  AutograderFile,
  CodeTaskLanguage,
  ParsedAutograder,
  ParsedTest,
  TestVisibility,
} from "./types.ts";

// Static parser for Gradescope-format autograder zips
// (https://gradescope-autograders.readthedocs.io/en/latest/specs/): setup.sh +
// run_autograder at the zip root, tests anywhere inside. It reads test
// metadata - names, points, numbers, visibility - without executing anything.
// Running the tests is the runner's job (lib/code-task/pyodide-runner.ts).
//
// Recognized test styles:
// - Python unittest with gradescope_utils decorators: @weight(2),
//   @partial_credit(2), @number("1.1"), @visibility("hidden"), and the
//   docstring's first line as the test name (that is what Gradescope's
//   JSONTestRunner shows).
// - Java JUnit with Gradescope's @GradedTest(name=..., number=...,
//   max_score=..., visibility=...).

const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const TEXT_EXTENSIONS = /\.(py|java|sh|txt|md|json|ya?ml|cfg|ini|toml|csv|tsv|fa|fasta|in|out|xml)$/i;
const VISIBILITIES: TestVisibility[] = ["visible", "hidden", "after_due_date", "after_published"];

/** Reads a zip into text files. Skips folders, macOS junk, binaries and oversized files. */
export async function readAutograderZip(data: ArrayBuffer | Uint8Array): Promise<AutograderFile[]> {
  const zip = await JSZip.loadAsync(data);
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && !entry.name.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(entry.name)
  );

  // Zipping the folder instead of its contents nests everything one level
  // down; Gradescope rejects that, but we can just strip the shared prefix.
  const prefix = commonFolderPrefix(entries.map((e) => e.name));

  const files: AutograderFile[] = [];
  let total = 0;
  for (const entry of entries) {
    const path = entry.name.slice(prefix.length);
    const isScript = path === "run_autograder" || path === "setup.sh";
    if (!isScript && !TEXT_EXTENSIONS.test(path)) continue;
    const content = await entry.async("string");
    const bytes = content.length;
    if (bytes > MAX_FILE_BYTES) continue;
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new Error("Autograder is too large (over 4 MB of text files).");
    files.push({ path, content: content.replace(/\r\n/g, "\n") });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function commonFolderPrefix(names: string[]): string {
  if (names.length === 0) return "";
  const first = names[0]!.split("/");
  if (first.length < 2) return "";
  const folder = `${first[0]}/`;
  return names.every((n) => n.startsWith(folder)) ? folder : "";
}

export async function parseGradescopeAutograderZip(data: ArrayBuffer | Uint8Array): Promise<ParsedAutograder> {
  return parseGradescopeAutograder(await readAutograderZip(data));
}

export function parseGradescopeAutograder(files: AutograderFile[]): ParsedAutograder {
  const warnings: string[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));

  if (!byPath.has("setup.sh")) warnings.push("No setup.sh at the zip root. Gradescope requires one.");
  const runAutograder = byPath.get("run_autograder");
  if (!runAutograder) warnings.push("No run_autograder at the zip root. Gradescope requires one.");

  const tests: ParsedTest[] = [];
  for (const file of files) {
    if (file.path.endsWith(".py") && /\bunittest\b/.test(file.content) && /def\s+test/.test(file.content)) {
      tests.push(...parsePythonTests(file));
    } else if (file.path.endsWith(".java") && file.content.includes("@GradedTest")) {
      tests.push(...parseJavaTests(file));
    }
  }

  const languages = new Set(tests.map((t) => (t.file.endsWith(".java") ? "java" : "python")));
  const language: CodeTaskLanguage | null =
    languages.size === 1 ? ([...languages][0] as CodeTaskLanguage) : languages.size === 0 ? null : "python";
  if (languages.size > 1) warnings.push("Found both Python and Java tests; only one language per task is supported.");
  if (tests.length === 0) {
    warnings.push(
      "No tests found. Expected Python unittest methods (def test_...) or Java @GradedTest methods."
    );
  }
  const unweighted = tests.filter((t) => t.maxScore === 0).length;
  if (unweighted > 0 && unweighted < tests.length) {
    warnings.push(`${unweighted} test(s) have no point value (@weight / max_score) and count for 0 points.`);
  }

  const submissionFiles = runAutograder ? submissionFilesFrom(runAutograder.content) : [];
  // A reference solution left in the zip under the submission's own name
  // would be sent to students' browsers along with the tests.
  for (const name of submissionFiles) {
    if (files.some((f) => f.path === name || f.path.endsWith(`/${name}`))) {
      warnings.push(`The zip contains ${name}, the same name students submit. Remove it if it is a reference solution.`);
    }
  }

  return {
    format: "gradescope",
    language,
    files,
    tests,
    totalPoints: round(tests.reduce((sum, t) => sum + t.maxScore, 0)),
    submissionFiles,
    warnings,
  };
}

/** `cp /autograder/submission/foo.py /autograder/source/` and friends - the files a student must hand in. */
export function submissionFilesFrom(script: string): string[] {
  const names = new Set<string>();
  for (const match of script.matchAll(/\/autograder\/submission\/([\w.*\-/]+)/g)) {
    const name = match[1]!.replace(/\/+$/, "");
    if (name && name !== "*" && !name.includes("*")) names.add(name);
  }
  return [...names];
}

// ------------------------------------------------------------------ Python --

type PendingDecorators = {
  weight: number | null;
  number: string | null;
  visibility: TestVisibility | null;
};

function emptyDecorators(): PendingDecorators {
  return { weight: null, number: null, visibility: null };
}

/**
 * Line-based on purpose: gradescope_utils tests are written in one
 * conventional shape (class -> decorators -> def -> docstring), and a regex
 * pass handles it without shipping a Python parser to the server.
 */
export function parsePythonTests(file: AutograderFile): ParsedTest[] {
  const lines = file.content.split("\n");
  const tests: ParsedTest[] = [];
  let currentClass: string | null = null;
  let classIndent = -1;
  let pending = emptyDecorators();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const classMatch = trimmed.match(/^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/);
    if (classMatch) {
      currentClass = classMatch[1]!;
      classIndent = indent;
      pending = emptyDecorators();
      continue;
    }
    if (currentClass && indent <= classIndent) {
      currentClass = null; // left the class body
    }

    if (trimmed.startsWith("@")) {
      const weight = trimmed.match(/^@(?:\w+\.)*(?:weight|partial_credit)\(\s*([\d.]+)\s*\)/);
      if (weight) pending.weight = Number(weight[1]);
      const number = trimmed.match(/^@(?:\w+\.)*number\(\s*["']([^"']+)["']\s*\)/);
      if (number) pending.number = number[1]!;
      const visibility = trimmed.match(/^@(?:\w+\.)*visibility\(\s*["'](\w+)["']\s*\)/);
      if (visibility && VISIBILITIES.includes(visibility[1] as TestVisibility)) {
        pending.visibility = visibility[1] as TestVisibility;
      }
      continue;
    }

    const def = trimmed.match(/^def\s+(test\w*)\s*\(\s*self\b/);
    if (def && currentClass) {
      const methodName = def[1]!;
      const doc = docstringAfter(lines, i);
      tests.push({
        id: `${file.path}::${currentClass}.${methodName}`,
        name: doc.summary ?? readableMethodName(methodName),
        number: pending.number,
        maxScore: pending.weight ?? 0,
        visibility: pending.visibility ?? "visible",
        description: doc.rest,
        file: file.path,
        className: currentClass,
        methodName,
      });
      pending = emptyDecorators();
      continue;
    }

    if (trimmed.startsWith("def ")) pending = emptyDecorators();
  }
  return tests;
}

/** The docstring right after a `def` line (which may wrap onto further lines before the colon). */
function docstringAfter(lines: string[], defIndex: number): { summary: string | null; rest: string | null } {
  let i = defIndex;
  while (i < lines.length && !/:\s*(#.*)?$/.test(lines[i]!.trim())) i++;
  i++;
  while (i < lines.length && !lines[i]!.trim()) i++;
  const first = lines[i]?.trim() ?? "";
  const quote = first.match(/^[rbuRBU]?("""|''')/)?.[1];
  if (!quote) return { summary: null, rest: null };

  const body: string[] = [];
  let text = first.replace(/^[rbuRBU]?("""|''')/, "");
  for (;;) {
    const end = text.indexOf(quote);
    if (end >= 0) {
      body.push(text.slice(0, end));
      break;
    }
    body.push(text);
    i++;
    if (i >= lines.length) break;
    text = lines[i]!.trim();
  }
  const cleaned = body.map((l) => l.trim());
  const summaryIndex = cleaned.findIndex(Boolean);
  if (summaryIndex < 0) return { summary: null, rest: null };
  const rest = cleaned.slice(summaryIndex + 1).join("\n").trim();
  return { summary: cleaned[summaryIndex]!, rest: rest || null };
}

function readableMethodName(method: string): string {
  const words = method.replace(/^test_?/, "").replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : method;
}

// -------------------------------------------------------------------- Java --

export function parseJavaTests(file: AutograderFile): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const className = file.content.match(/\bclass\s+(\w+)/)?.[1] ?? file.path.replace(/^.*\/|\.java$/g, "");
  const annotation = /@GradedTest\s*\(([^)]*)\)/g;
  for (const match of file.content.matchAll(annotation)) {
    const args = match[1]!;
    const after = file.content.slice((match.index ?? 0) + match[0].length);
    const methodName = after.match(/\bvoid\s+(\w+)\s*\(/)?.[1];
    if (!methodName) continue;
    const name = javaArg(args, "name");
    const visibility = javaArg(args, "visibility");
    tests.push({
      id: `${file.path}::${className}.${methodName}`,
      name: name ?? readableMethodName(methodName),
      number: javaArg(args, "number"),
      maxScore: Number(javaArg(args, "max_score") ?? 0) || 0,
      visibility: VISIBILITIES.includes(visibility as TestVisibility) ? (visibility as TestVisibility) : "visible",
      description: null,
      file: file.path,
      className,
      methodName,
    });
  }
  return tests;
}

function javaArg(args: string, key: string): string | null {
  const match = args.match(new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|([\\d.]+))`));
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
