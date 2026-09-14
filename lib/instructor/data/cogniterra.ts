"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchCogniterraLessons } from "@/lib/cogniterra/client";
import {
  matchAssignmentsToCogniterraLessons,
  placeCogniterraLessons,
  type DriveAssignmentForMatch,
  type CogniterraExistingUnit,
} from "@/lib/cogniterra/match-lessons";
import { addUnitFromImport, addLessonFromImport } from "@/lib/instructor/data/lessons";

const COGNITERRA_LAUNCH_URL =
  process.env.COGNITERRA_LAUNCH_URL ?? "https://cogniterra.org/lti/";

export type CogniterraCourseConfig = {
  cogniterraCourseId: string;
  consumerKey: string;
  hasSharedSecret: boolean;
};

export type CogniterraSetupInput = {
  cogniterraCourseId: string;
  consumerKey: string;
  sharedSecret: string;
};

async function getCourseId(courseCode: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id")
    .eq("code", courseCode)
    .single();
  if (error || !data) throw new Error("Unknown course code");
  return data.id;
}

export async function getCogniterraCourseConfig(
  courseCode: string
): Promise<CogniterraCourseConfig | null> {
  try {
    const supabase = await createClient();
    const courseId = await getCourseId(courseCode);
    const { data, error } = await supabase
      .from("cogniterra_course_config")
      .select("cogniterra_course_id, tool:lti_tools (consumer_key)")
      .eq("course_id", courseId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const tool = Array.isArray(data.tool) ? data.tool[0] : data.tool;
    return {
      cogniterraCourseId: data.cogniterra_course_id,
      consumerKey: (tool as { consumer_key: string } | null)?.consumer_key ?? "",
      hasSharedSecret: true,
    };
  } catch {
    return null;
  }
}

export async function saveCogniterraCourseConfig(
  courseCode: string,
  input: CogniterraSetupInput
): Promise<void> {
  const courseId = await getCourseId(courseCode);
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("cogniterra_course_config")
    .select("tool_id")
    .eq("course_id", courseId)
    .maybeSingle();

  let toolId = existing?.tool_id as string | undefined;

  if (toolId) {
    const toolUpdate: Record<string, string> = {
      consumer_key: input.consumerKey,
      launch_url: COGNITERRA_LAUNCH_URL,
    };
    if (input.sharedSecret) {
      toolUpdate.shared_secret = input.sharedSecret;
    }
    const { error } = await supabase.from("lti_tools").update(toolUpdate).eq("id", toolId);
    if (error) throw new Error(error.message);
  } else {
    // Reuse a tool with the same launch URL + consumer key (unique constraint).
    // Course delete cascades cogniterra_course_config but leaves lti_tools rows,
    // so recreate/import must not insert a duplicate.
    const { data: sharedTool, error: sharedLookupError } = await supabase
      .from("lti_tools")
      .select("id")
      .eq("launch_url", COGNITERRA_LAUNCH_URL)
      .eq("consumer_key", input.consumerKey)
      .maybeSingle();
    if (sharedLookupError) throw new Error(sharedLookupError.message);

    if (sharedTool) {
      toolId = sharedTool.id;
      if (input.sharedSecret) {
        const { error } = await supabase
          .from("lti_tools")
          .update({ shared_secret: input.sharedSecret })
          .eq("id", toolId);
        if (error) throw new Error(error.message);
      }
    } else {
      if (!input.sharedSecret) {
        throw new Error("LTI shared secret is required when connecting Cogniterra for the first time");
      }
      const { data: tool, error } = await supabase
        .from("lti_tools")
        .insert({
          name: "Cogniterra",
          vendor: "cogniterra",
          lti_version: "1.1",
          launch_url: COGNITERRA_LAUNCH_URL,
          consumer_key: input.consumerKey,
          shared_secret: input.sharedSecret,
        })
        .select("id")
        .single();
      if (error || !tool) throw new Error(error?.message ?? "Failed to register LTI tool");
      toolId = tool.id;
    }
  }

  const { error: configError } = await supabase.from("cogniterra_course_config").upsert(
    {
      course_id: courseId,
      cogniterra_course_id: input.cogniterraCourseId,
      tool_id: toolId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "course_id" }
  );
  if (configError) throw new Error(configError.message);

  revalidatePath(`/instructor/${courseCode}`);
}

export async function wireExternalLessonsToCogniterra(
  courseCode: string,
  assignments: DriveAssignmentForMatch[]
): Promise<{ wired: number; skipped: number }> {
  if (assignments.length === 0) {
    return { wired: 0, skipped: 0 };
  }

  const courseId = await getCourseId(courseCode);
  const supabase = createServiceClient();

  const { data: config, error: configError } = await supabase
    .from("cogniterra_course_config")
    .select("cogniterra_course_id, tool_id")
    .eq("course_id", courseId)
    .maybeSingle();
  if (configError) throw new Error(configError.message);
  if (!config) {
    return { wired: 0, skipped: assignments.length };
  }

  // Private Cogniterra courses often aren't enumerable via the public API.
  // When we can't list/match lessons, still embed the course via custom_course.
  const cogniterraLessons = await fetchCogniterraLessons(config.cogniterra_course_id).catch(
    (error) => {
      console.warn(
        `wireExternalLessonsToCogniterra: could not list Cogniterra lessons for course ${config.cogniterra_course_id}:`,
        error instanceof Error ? error.message : error
      );
      return [];
    }
  );
  const matches =
    cogniterraLessons.length > 0
      ? await matchAssignmentsToCogniterraLessons(assignments, cogniterraLessons)
      : [];

  if (cogniterraLessons.length === 0) {
    console.warn(
      `wireExternalLessonsToCogniterra: no public lessons for Cogniterra course ${config.cogniterra_course_id}; falling back to course-level LTI launches`
    );
  }

  let wired = 0;
  let skipped = 0;

  for (const assignment of assignments) {
    const match = matches.find((m) => m.lessonId === assignment.lessonId);
    // course is required even for a specific-lesson launch - verified against
    // the live server that custom_lesson alone fails with "Missing LTI Key"
    // on a private course (Cogniterra can't resolve which course's
    // credentials apply from the lesson id alone); course + lesson together
    // succeeds.
    const customParams = match
      ? { course: String(config.cogniterra_course_id), lesson: String(match.cogniterraLessonId) }
      : { course: String(config.cogniterra_course_id) };

    if (!match) {
      console.log(
        `wireExternalLessonsToCogniterra: no lesson match for "${assignment.title}" — linking Cogniterra course ${config.cogniterra_course_id}`
      );
    }

    const { data: lesson } = await supabase
      .from("lessons")
      .select("title")
      .eq("id", assignment.lessonId)
      .maybeSingle();

    const { error: linkError } = await supabase.from("lti_links").upsert(
      {
        lesson_id: assignment.lessonId,
        tool_id: config.tool_id,
        title: lesson?.title ?? assignment.title,
        custom_params: customParams,
        points_possible: 100,
      },
      { onConflict: "lesson_id" }
    );
    if (linkError) {
      console.warn(`wireExternalLessonsToCogniterra: failed for ${assignment.lessonId}:`, linkError.message);
      skipped += 1;
      continue;
    }

    await supabase.from("lessons").update({ type: "external" }).eq("id", assignment.lessonId);
    wired += 1;
  }

  revalidatePath(`/instructor/${courseCode}`);
  revalidatePath(`/student/${courseCode}`);
  return { wired, skipped };
}

/**
 * Gap-fills Cogniterra assignments that have no corresponding Drive file at
 * all — the counterpart to attachYoutubePlaylistVideos, but for graded
 * assignments instead of lecture videos. Reads the course's CURRENT persisted
 * units/lessons/lti_links straight from the database rather than anything
 * built up during a single Drive import run, so it can be re-run any time
 * (right after a fresh import, minutes later, after a code change to this
 * matcher, whatever) without deleting and recreating the course:
 * every already-wired Cogniterra lesson id is looked up fresh each call and
 * excluded, so re-running only ever fills in what's still missing.
 */
export async function syncCogniterraAssignments(
  courseCode: string
): Promise<{ placed: number; warning: string | null }> {
  const supabase = createServiceClient();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, title, department")
    .eq("code", courseCode)
    .single();
  if (courseError || !course) throw new Error("Unknown course code");

  const { data: config, error: configError } = await supabase
    .from("cogniterra_course_config")
    .select("cogniterra_course_id, tool_id")
    .eq("course_id", course.id)
    .maybeSingle();
  if (configError) throw new Error(configError.message);
  if (!config) return { placed: 0, warning: null };

  const cogniterraLessons = await fetchCogniterraLessons(config.cogniterra_course_id).catch((error) => {
    console.warn(
      `syncCogniterraAssignments: could not list Cogniterra lessons for course ${config.cogniterra_course_id}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  });
  if (!cogniterraLessons) {
    return { placed: 0, warning: "Couldn't reach Cogniterra to list that course's lessons — try again shortly." };
  }
  if (cogniterraLessons.length === 0) return { placed: 0, warning: null };

  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id, title, position")
    .eq("course_id", course.id)
    .order("position");
  if (unitsError) throw new Error(unitsError.message);
  const unitIds = (units ?? []).map((u) => u.id as string);

  const { data: lessons } = unitIds.length
    ? await supabase.from("lessons").select("id, unit_id, position").in("unit_id", unitIds)
    : { data: [] as { id: string; unit_id: string; position: number }[] };

  const lessonIds = (lessons ?? []).map((l) => l.id as string);
  const { data: links } = lessonIds.length
    ? await supabase.from("lti_links").select("lesson_id, custom_params").in("lesson_id", lessonIds)
    : { data: [] as { lesson_id: string; custom_params: unknown }[] };

  // Any Cogniterra lesson id already backing some lesson in this course —
  // whether wired just now by wireExternalLessonsToCogniterra above, or by a
  // previous run of this same function — must never be placed again.
  const alreadyWiredCogniterraIds = new Set<number>();
  for (const link of links ?? []) {
    const raw = (link.custom_params as { lesson?: string | number } | null)?.lesson;
    const n = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(n)) alreadyWiredCogniterraIds.add(n);
  }

  const candidates = cogniterraLessons.filter((l) => !alreadyWiredCogniterraIds.has(l.id));
  if (candidates.length === 0) return { placed: 0, warning: null };

  const existingUnitsForPlacement: CogniterraExistingUnit[] = (units ?? []).map((u) => ({
    id: u.id as string,
    title: u.title as string,
  }));

  let result;
  try {
    result = await placeCogniterraLessons(
      { title: course.title, department: course.department },
      candidates,
      existingUnitsForPlacement
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not place Cogniterra assignments into the course.";
    console.error("syncCogniterraAssignments: placement failed:", message);
    return { placed: 0, warning: message };
  }

  const usedNewUnitKeys = new Set(result.placements.map((p) => p.unitRef));
  const unitIdByRef = new Map<string, string>(existingUnitsForPlacement.map((u) => [u.id, u.id]));
  for (const nu of result.newUnits) {
    if (!usedNewUnitKeys.has(nu.key)) continue; // declared but never actually used
    const created = await addUnitFromImport(courseCode, nu.title, "");
    unitIdByRef.set(nu.key, created.id);
  }

  // New lessons always land at the end of their unit — same rule organize
  // import already uses for quizzes relative to topics.
  const nextPositionByUnit = new Map<string, number>();
  for (const lesson of lessons ?? []) {
    const unitId = lesson.unit_id as string;
    const current = nextPositionByUnit.get(unitId) ?? 0;
    nextPositionByUnit.set(unitId, Math.max(current, (lesson.position as number) ?? 0));
  }

  const lessonById = new Map(candidates.map((l) => [l.id, l]));
  let placed = 0;
  for (const placement of result.placements) {
    const unitId = unitIdByRef.get(placement.unitRef);
    const cogLesson = lessonById.get(placement.cogniterraLessonId);
    if (!unitId || !cogLesson) continue;

    const position = (nextPositionByUnit.get(unitId) ?? 0) + 1;
    nextPositionByUnit.set(unitId, position);

    const newLesson = await addLessonFromImport(unitId, {
      title: cogLesson.title,
      type: "external",
      position,
      sourceDriveFileId: null,
      contentSource: "blocks",
    });

    const { error: linkError } = await supabase.from("lti_links").upsert(
      {
        lesson_id: newLesson.id,
        tool_id: config.tool_id,
        title: cogLesson.title,
        // course is required alongside lesson - see the comment in
        // wireExternalLessonsToCogniterra above.
        custom_params: { course: String(config.cogniterra_course_id), lesson: String(cogLesson.id) },
        points_possible: 100,
      },
      { onConflict: "lesson_id" }
    );
    if (linkError) {
      console.warn(`syncCogniterraAssignments: failed to link lesson ${newLesson.id}:`, linkError.message);
      continue;
    }
    placed += 1;
  }

  if (placed > 0) {
    revalidatePath(`/instructor/${courseCode}`);
    revalidatePath(`/student/${courseCode}`);
  }
  return { placed, warning: null };
}

/** Returns env-based defaults for the import modal (demo / dev convenience). */
export async function getCogniterraEnvDefaults(): Promise<Partial<CogniterraSetupInput>> {
  return {
    cogniterraCourseId: process.env.COGNITERRA_COURSE_ID ?? "",
    consumerKey: process.env.COGNITERRA_CONSUMER_KEY ?? "",
    sharedSecret: process.env.COGNITERRA_SHARED_SECRET ?? "",
  };
}
