import { createServiceClient } from "@/lib/supabase/service";

// Reads and writes for the LTI tables. Everything here uses the service-role
// client because lti_tools has no RLS policy: the anon key cannot see shared
// secrets, by design.

export type LtiVendor = "cogniterra" | "autolab" | "generic";

export type LtiTool = {
  id: string;
  name: string;
  vendor: LtiVendor;
  ltiVersion: "1.1" | "1.3";
  launchUrl: string;
  consumerKey: string;
  sharedSecret: string;
  sendLearnerIdentity: boolean;
};

export type LtiLink = {
  id: string;
  lessonId: string;
  title: string;
  customParams: Record<string, string>;
  pointsPossible: number;
  tool: LtiTool;
};

export type LtiResult = {
  id: string;
  sourcedid: string;
  score: number | null;
  scoreRaw: number | null;
  reportedAt: string | null;
};

const TOOL_COLUMNS =
  "id, name, vendor, lti_version, launch_url, consumer_key, shared_secret, send_learner_identity";

type ToolRow = {
  id: string;
  name: string;
  vendor: LtiVendor;
  lti_version: "1.1" | "1.3";
  launch_url: string;
  consumer_key: string;
  shared_secret: string;
  send_learner_identity: boolean;
};

function toTool(row: ToolRow): LtiTool {
  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    ltiVersion: row.lti_version,
    launchUrl: row.launch_url,
    consumerKey: row.consumer_key,
    sharedSecret: row.shared_secret,
    sendLearnerIdentity: row.send_learner_identity,
  };
}

export async function getLink(linkId: string): Promise<LtiLink | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("lti_links")
    .select(`id, lesson_id, title, custom_params, points_possible, tool:lti_tools (${TOOL_COLUMNS})`)
    .eq("id", linkId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  // The embedded select returns an object for a to-one relation, but the
  // generated types cannot know that, so it is typed as a row array.
  const toolRow = (Array.isArray(data.tool) ? data.tool[0] : data.tool) as ToolRow | null;
  if (!toolRow) return null;

  return {
    id: data.id,
    lessonId: data.lesson_id,
    title: data.title,
    customParams: (data.custom_params ?? {}) as Record<string, string>,
    pointsPossible: Number(data.points_possible),
    tool: toTool(toolRow),
  };
}

export async function getLinkForLesson(lessonId: string): Promise<LtiLink | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("lti_links")
    .select("id")
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return getLink(data.id);
}

// Called on every launch. Creates the result row on first launch so the tool
// has a sourcedid to grade against, and returns the existing row after that so
// the sourcedid stays stable across relaunches. An unstable sourcedid means the
// tool reports a grade against a row nobody reads.
export async function upsertResultForLaunch(
  linkId: string,
  platformUserId: string
): Promise<LtiResult> {
  const supabase = createServiceClient();

  const { data: existing, error: readError } = await supabase
    .from("lti_results")
    .select("id, sourcedid, score, score_raw, reported_at, launch_count")
    .eq("link_id", linkId)
    .eq("platform_user_id", platformUserId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  if (existing) {
    const { error: touchError } = await supabase
      .from("lti_results")
      .update({
        last_launched_at: new Date().toISOString(),
        launch_count: existing.launch_count + 1,
      })
      .eq("id", existing.id);
    if (touchError) throw new Error(touchError.message);

    return {
      id: existing.id,
      sourcedid: existing.sourcedid,
      score: existing.score === null ? null : Number(existing.score),
      scoreRaw: existing.score_raw === null ? null : Number(existing.score_raw),
      reportedAt: existing.reported_at,
    };
  }

  const { data: created, error: insertError } = await supabase
    .from("lti_results")
    .insert({ link_id: linkId, platform_user_id: platformUserId, launch_count: 1 })
    .select("id, sourcedid, score, score_raw, reported_at")
    .single();
  if (insertError || !created) {
    throw new Error(insertError?.message ?? "Failed to create LTI result row");
  }

  return {
    id: created.id,
    sourcedid: created.sourcedid,
    score: null,
    scoreRaw: null,
    reportedAt: created.reported_at,
  };
}

export type ResultTarget = {
  resultId: string;
  linkId: string;
  pointsPossible: number;
  tool: LtiTool;
};

// Resolves an inbound sourcedid to the row it may write, and to the credentials
// its signature must verify against.
export async function getResultBySourcedid(sourcedid: string): Promise<ResultTarget | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("lti_results")
    .select(
      `id, link_id, link:lti_links (points_possible, tool:lti_tools (${TOOL_COLUMNS}))`
    )
    .eq("sourcedid", sourcedid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const link = (Array.isArray(data.link) ? data.link[0] : data.link) as
    | { points_possible: number; tool: ToolRow | ToolRow[] }
    | null;
  if (!link) return null;
  const toolRow = (Array.isArray(link.tool) ? link.tool[0] : link.tool) as ToolRow | null;
  if (!toolRow) return null;

  return {
    resultId: data.id,
    linkId: data.link_id,
    pointsPossible: Number(link.points_possible),
    tool: toTool(toolRow),
  };
}

export async function writeResultScore(
  resultId: string,
  scoreRaw: number,
  pointsPossible: number
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("lti_results")
    .update({
      score_raw: scoreRaw,
      score: scoreRaw * pointsPossible,
      reported_at: new Date().toISOString(),
    })
    .eq("id", resultId);
  if (error) throw new Error(error.message);
}

export async function clearResultScore(resultId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("lti_results")
    .update({ score_raw: null, score: null, reported_at: null })
    .eq("id", resultId);
  if (error) throw new Error(error.message);
}

export async function readResultScore(
  resultId: string
): Promise<{ scoreRaw: number | null }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("lti_results")
    .select("score_raw")
    .eq("id", resultId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Result not found");
  return { scoreRaw: data.score_raw === null ? null : Number(data.score_raw) };
}

// Replay protection. Returns false if this tool has used this nonce before.
export async function claimNonce(toolId: string, nonce: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("lti_nonces").insert({ tool_id: toolId, nonce });
  if (!error) return true;
  // 23505 is unique_violation, which here means "seen this nonce already".
  if (error.code === "23505") return false;
  throw new Error(error.message);
}
