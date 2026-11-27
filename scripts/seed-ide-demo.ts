import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_TASK_SLUGS, loadDemoTask } from "./ide-demo-tasks.ts";

// Creates (or rebuilds) the "IDE Tasks Demo" course from demo/ide-tasks/:
//   node --experimental-strip-types scripts/seed-ide-demo.ts
// Needs SUPABASE_SERVICE_ROLE_KEY in .env.local, and the
// add-code-task-block.sql migration applied. Rerunning replaces only this
// course's units and lessons; no other course is touched.

const COURSE_CODE = "IDE-DEMO";
const COURSE_TITLE = "IDE Tasks Demo";
const OWNER_EMAIL = "pcompeau@andrew.cmu.edu";
const EXTRA_STAFF_NAMES = ["Raymond Chen"];

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(import.meta.dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!env.NEXT_PUBLIC_SUPABASE_URL || !KEY) throw new Error("Missing Supabase URL or service role key in .env.local");

async function rest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, {
    method,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

// 1. Migration applied?
try {
  await rest("GET", "lesson_blocks?select=code_task&limit=1");
} catch (error) {
  if (String(error).includes("code_task")) {
    console.error("Run supabase/migrations/add-code-task-block.sql in the Supabase SQL editor first.");
    process.exit(1);
  }
  throw error;
}

// 2. Course + staff.
const instructors = await rest<{ id: string; name: string; email: string | null }[]>("GET", "instructors?select=id,name,email");
const owner = instructors.find((i) => i.email?.toLowerCase() === OWNER_EMAIL) ?? instructors[0];
if (!owner) throw new Error("No instructors in the database.");
const staff = [owner, ...instructors.filter((i) => EXTRA_STAFF_NAMES.includes(i.name) && i.id !== owner.id)];

let [course] = await rest<{ id: string }[]>("GET", `courses?select=id&code=eq.${COURSE_CODE}`);
if (course) {
  await rest("DELETE", `units?course_id=eq.${course.id}`);
  await rest("PATCH", `courses?id=eq.${course.id}`, { title: COURSE_TITLE, instructor_id: owner.id });
  console.log(`Rebuilding existing course ${COURSE_CODE}`);
} else {
  [course] = await rest<{ id: string }[]>("POST", "courses", {
    code: COURSE_CODE,
    title: COURSE_TITLE,
    department: "Computer Science",
    track: "Programming for Lovers",
    instructor_id: owner.id,
  });
  console.log(`Created course ${COURSE_CODE}`);
}
await rest(
  "POST",
  "course_instructors?on_conflict=course_id,instructor_id",
  staff.map((s) => ({ course_id: course!.id, instructor_id: s.id }))
).catch((error) => console.warn("Could not add course staff:", String(error)));

// 3. One unit: an intro page, then the three IDE tasks.
const [unit] = await rest<{ id: string }[]>("POST", "units", {
  course_id: course.id,
  code: "Unit 1",
  title: "Finding Hidden Messages in DNA",
  position: 1,
});

await rest("POST", "lessons", {
  unit_id: unit!.id,
  code: "1.1",
  title: "How IDE tasks work",
  type: "lesson",
  position: 1,
  content_source: "html",
  is_published: true,
  content_html: [
    "<p>Each lesson in this unit is a <strong>programming task</strong>: read the instructions, write your code in the editor, and press <strong>Run tests</strong> (or Ctrl/Cmd + Enter).</p>",
    "<p>The tests come straight from a <strong>Gradescope autograder</strong>, the same zip an instructor uploads to Gradescope. CS Learn reads the tests, their point values and their visibility out of the zip, then runs them right in your browser with Python compiled to WebAssembly.</p>",
    "<ul><li><strong>Visible tests</strong> show their names and, when they fail, what went wrong.</li><li><strong>Hidden tests</strong> only show how many passed, just like on Gradescope.</li></ul>",
    "<p>The problems come from the first chapter of <em>Bioinformatics Algorithms</em>: finding the replication origin of a bacterial genome.</p>",
  ].join("\n"),
});

for (const [index, slug] of DEMO_TASK_SLUGS.entries()) {
  const demo = await loadDemoTask(slug);
  const position = index + 2;
  const [lesson] = await rest<{ id: string }[]>("POST", "lessons", {
    unit_id: unit!.id,
    code: `1.${position}`,
    title: demo.title,
    type: "lesson",
    position,
    content_source: "blocks",
    is_published: true,
  });
  await rest("POST", "lesson_blocks", {
    lesson_id: lesson!.id,
    position: 1,
    kind: "code_task",
    title: demo.title,
    code_task: demo.task,
  });
  const ag = demo.task.autograder!;
  console.log(`  ${demo.title}: ${ag.tests.length} tests, ${ag.totalPoints} pts`);
}

console.log(`\nDone. Owner: ${owner.name}. Staff: ${staff.map((s) => s.name).join(", ")}.`);
console.log(`Student view:    /student/${COURSE_CODE}`);
console.log(`Instructor view: /instructor/${COURSE_CODE}/edit`);
