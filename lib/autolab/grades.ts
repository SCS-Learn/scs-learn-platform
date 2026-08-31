import { autolabGet } from "@/lib/autolab/client";
import { createServiceClient } from "@/lib/supabase/service";

// Pulls Autolab scores into Supabase. This is the Autolab equivalent of the
// LTI outcomes endpoint, except it is a pull on a schedule or on demand rather
// than a push, because Autolab has no grade services to push with.

export type AutolabLink = {
  id: string;
  lessonId: string;
  courseName: string;
  assessmentName: string;
  title: string;
  pointsPossible: number;
  embedInIframe: boolean;
};

export async function getAutolabLinkForLesson(lessonId: string): Promise<AutolabLink | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("autolab_links")
    .select("id, lesson_id, course_name, assessment_name, title, points_possible, embed_in_iframe")
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    lessonId: data.lesson_id,
    courseName: data.course_name,
    assessmentName: data.assessment_name,
    title: data.title,
    pointsPossible: Number(data.points_possible),
    embedInIframe: data.embed_in_iframe,
  };
}

// Autolab's scores payload is a map of problem name to points, not a total, so
// the total is ours to compute. A null value means the problem exists but has
// not been graded, which is different from a zero.
type AutolabScorePayload = Record<string, number | null>;

function totalScore(payload: AutolabScorePayload): number | null {
  const values = Object.values(payload).filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

export type SyncOutcome =
  | { status: "synced"; score: number | null }
  | { status: "no_submission" }
  | { status: "error"; message: string };

export async function syncLearnerScore(args: {
  link: AutolabLink;
  platformUserId: string;
  autolabEmail: string;
}): Promise<SyncOutcome> {
  const { link, platformUserId, autolabEmail } = args;

  const path = `courses/${encodeURIComponent(link.courseName)}/assessments/${encodeURIComponent(
    link.assessmentName
  )}/scores/${encodeURIComponent(autolabEmail)}`;

  const response = await autolabGet<AutolabScorePayload>(path);

  if (!response.ok) {
    // 404 here means Autolab knows the assessment but has nothing for this
    // learner, which is the normal state before a first submission. Recording
    // it as such keeps it out of the error path and out of alerting.
    if (response.status === 404) {
      await writeScoreRow({
        link,
        platformUserId,
        autolabEmail,
        score: null,
        raw: null,
        noSubmission: true,
      });
      return { status: "no_submission" };
    }
    return { status: "error", message: `Autolab ${response.status}: ${response.error}` };
  }

  const score = totalScore(response.data);
  await writeScoreRow({
    link,
    platformUserId,
    autolabEmail,
    score,
    raw: response.data,
    noSubmission: false,
  });
  return { status: "synced", score };
}

async function writeScoreRow(args: {
  link: AutolabLink;
  platformUserId: string;
  autolabEmail: string;
  score: number | null;
  raw: AutolabScorePayload | null;
  noSubmission: boolean;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("autolab_scores").upsert(
    {
      link_id: args.link.id,
      platform_user_id: args.platformUserId,
      autolab_email: args.autolabEmail,
      score: args.score,
      points_possible: args.link.pointsPossible,
      raw: args.raw,
      no_submission: args.noSubmission,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "link_id,platform_user_id" }
  );
  if (error) throw new Error(error.message);
}
