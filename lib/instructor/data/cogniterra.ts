"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchCogniterraLessons } from "@/lib/cogniterra/client";
import {
  matchAssignmentsToCogniterraLessons,
  type DriveAssignmentForMatch,
} from "@/lib/cogniterra/match-lessons";

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
    const customParams = match
      ? { lesson: String(match.cogniterraLessonId) }
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

/** Returns env-based defaults for the import modal (demo / dev convenience). */
export async function getCogniterraEnvDefaults(): Promise<Partial<CogniterraSetupInput>> {
  return {
    cogniterraCourseId: process.env.COGNITERRA_COURSE_ID ?? "",
    consumerKey: process.env.COGNITERRA_CONSUMER_KEY ?? "",
    sharedSecret: process.env.COGNITERRA_SHARED_SECRET ?? "",
  };
}
