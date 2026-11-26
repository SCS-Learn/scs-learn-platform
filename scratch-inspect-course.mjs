import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadDevProfile, parseProfileArgs } from "./scripts/dev-profile.mjs";

function readCommand(argv) {
  const { envFile, args } = parseProfileArgs(argv);
  const usage = "Usage: node scratch-inspect-course.mjs [--env-file .env.dev.personal] [course-code] [--delete-from-position n]";
  let options;
  try {
    options = parseArgs({ args, allowPositionals: true, options: {
      "delete-from-position": { type: "string", multiple: true },
    } });
  } catch {
    throw new Error(usage);
  }

  const [courseCode = "02-180", ...extra] = options.positionals;
  const cutoffs = options.values["delete-from-position"] ?? [];
  if (extra.length || !courseCode.trim() || cutoffs.length > 1) throw new Error(usage);
  const [cutoff] = cutoffs;
  if (cutoff !== undefined && (!/^\d+$/.test(cutoff) || !Number.isSafeInteger(Number(cutoff)))) {
    throw new Error("--delete-from-position requires a nonnegative integer.");
  }

  const { values } = loadDevProfile({ envFile, requiredKeys: ["SUPABASE_SERVICE_ROLE_KEY"] });
  return { values, courseCode, cutoff: cutoff === undefined ? undefined : Number(cutoff) };
}

async function inspectCourse({ values, courseCode, cutoff }) {
  const supabase = createClient(values.NEXT_PUBLIC_SUPABASE_URL, values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error" }) },
  });

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, code, title")
    .eq("code", courseCode)
    .single();
  if (courseErr || !course) return "Course lookup failed.";

  const { data: units, error: unitsErr } = await supabase
    .from("units")
    .select("id, code, title, position, created_at, lessons(id, title, position, is_published, created_at)")
    .eq("course_id", course.id)
    .order("position", { ascending: true });
  if (unitsErr) return "Units lookup failed.";

  if (cutoff !== undefined) {
    const toDelete = units.filter((unit) => unit.position >= cutoff);
    console.log(`Deleting ${toDelete.length} unit(s) with position >= ${cutoff}:`);
    for (const unit of toDelete) console.log(`  - [pos ${unit.position}] "${unit.title}" (${unit.lessons.length} lessons)`);
    if (toDelete.length) {
      const { error } = await supabase.from("units").delete().in("id", toDelete.map((unit) => unit.id));
      if (error) return "Delete failed.";
    }
    console.log("Done.");
    return;
  }

  console.log(`Course: ${course.title} (${course.code})`);
  console.log(`Total units: ${units.length}\n`);
  for (const unit of units) {
    console.log(`[pos ${unit.position}] ${unit.code} — "${unit.title}" (${unit.lessons.length} lessons) — created ${unit.created_at}`);
    for (const lesson of [...unit.lessons].sort((a, b) => a.position - b.position)) {
      console.log(`    ${lesson.position}. ${lesson.title}${lesson.is_published ? "" : "  [draft]"}  — ${lesson.created_at}`);
    }
  }
}

let command;
try {
  command = readCommand(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (command) {
  const error = await inspectCourse(command).catch(() => "Course inspection failed.");
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
