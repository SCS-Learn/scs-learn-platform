import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = fs.readFileSync(new URL("./.env.local", import.meta.url), "utf8");
const vars = Object.fromEntries(
  env
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

const courseCode = process.argv[2] ?? "02-180";

const { data: course, error: courseErr } = await supabase
  .from("courses")
  .select("id, code, title")
  .eq("code", courseCode)
  .single();
if (courseErr || !course) {
  console.error("course lookup failed:", courseErr);
  process.exit(1);
}

const { data: units, error: unitsErr } = await supabase
  .from("units")
  .select("id, code, title, position, created_at, lessons(id, title, position, is_published, created_at)")
  .eq("course_id", course.id)
  .order("position", { ascending: true });
if (unitsErr) {
  console.error("units lookup failed:", unitsErr);
  process.exit(1);
}

if (process.argv[3] === "--delete-from-position") {
  const cutoff = Number(process.argv[4]);
  const toDelete = units.filter((u) => u.position >= cutoff);
  console.log(`Deleting ${toDelete.length} unit(s) with position >= ${cutoff}:`);
  for (const u of toDelete) console.log(`  - [pos ${u.position}] "${u.title}" (${u.lessons.length} lessons)`);
  const { error: delErr } = await supabase
    .from("units")
    .delete()
    .in("id", toDelete.map((u) => u.id));
  if (delErr) {
    console.error("delete failed:", delErr);
    process.exit(1);
  }
  console.log("Done.");
  process.exit(0);
}

console.log(`Course: ${course.title} (${course.code})`);
console.log(`Total units: ${units.length}\n`);
for (const unit of units) {
  console.log(`[pos ${unit.position}] ${unit.code} — "${unit.title}" (${unit.lessons.length} lessons) — created ${unit.created_at}`);
  for (const lesson of [...unit.lessons].sort((a, b) => a.position - b.position)) {
    console.log(`    ${lesson.position}. ${lesson.title}${lesson.is_published ? "" : "  [draft]"}  — ${lesson.created_at}`);
  }
}
