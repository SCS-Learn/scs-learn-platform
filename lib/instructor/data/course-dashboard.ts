import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InstructorCourse } from "@/lib/instructor/mock-data";

export type CourseLearnerRow = {
  id: string;
  name: string;
  email: string | null;
  lessonsCompleted: number;
  /** Of the course's published lessons. */
  percentComplete: number;
  /** Mean score across this learner's submitted in-app quizzes; null if none. */
  averageQuizScore: number | null;
  lastActiveAt: string | null;
};

export type CourseActivity = {
  learners: CourseLearnerRow[];
  /** lesson id -> number of learners who marked it complete. */
  completionsByLessonId: Record<string, number>;
  /** quiz lesson id -> mean score_percent over submissions. */
  averageScoreByQuizId: Record<string, number>;
  /** Mean over every learner's percentComplete; null with no learners. */
  averagePercentComplete: number | null;
  /** Mean over every quiz submission in the course; null with none. */
  averageQuizScore: number | null;
};

type LearnerIdentity = { name: string; email: string | null };

/**
 * Learner ids are Supabase Auth user ids (see getCurrentLearner), which only
 * the service-role client can resolve to a name. Falls back to a short id
 * when that client isn't configured or the user is gone, and labels the
 * pre-login stub id so old demo rows don't read as a real person.
 */
async function resolveLearnerIdentities(ids: string[]): Promise<Map<string, LearnerIdentity>> {
  const identities = new Map<string, LearnerIdentity>();
  const admin = createAdminClient();
  await Promise.all(
    ids.map(async (id) => {
      if (id.startsWith("stub-learner")) {
        identities.set(id, { name: "Test learner (pre-login)", email: null });
        return;
      }
      const { data } = admin ? await admin.auth.admin.getUserById(id) : { data: null };
      const user = data?.user;
      const fullName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
      identities.set(id, {
        name: fullName || user?.email?.split("@")[0] || `Learner ${id.slice(0, 8)}`,
        email: user?.email ?? null,
      });
    })
  );
  return identities;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Real per-learner activity for the instructor's course dashboard. There is
 * no enrollment roster, so "learners" means anyone with any recorded
 * activity in this course: a completed lesson, a quiz submission, or a
 * Cogniterra/LTI launch.
 */
export async function getCourseActivity(course: InstructorCourse): Promise<CourseActivity> {
  const lessons = course.units.flatMap((u) => u.lessons);
  const lessonIds = lessons.map((l) => l.id);
  const publishedCount = lessons.filter((l) => l.isPublished).length;
  const empty: CourseActivity = {
    learners: [],
    completionsByLessonId: {},
    averageScoreByQuizId: {},
    averagePercentComplete: null,
    averageQuizScore: null,
  };
  if (lessonIds.length === 0) return empty;

  const supabase = await createClient();
  const [completions, quizzes, launches] = await Promise.all([
    supabase.from("lesson_completions").select("lesson_id, platform_user_id, completed_at").in("lesson_id", lessonIds),
    supabase
      .from("quiz_submissions")
      .select("lesson_id, platform_user_id, score_percent, submitted_at")
      .in("lesson_id", lessonIds),
    supabase
      .from("lti_results")
      .select("platform_user_id, last_launched_at, lti_links!inner(lesson_id)")
      .in("lti_links.lesson_id", lessonIds),
  ]);
  for (const result of [completions, quizzes, launches]) {
    if (result.error) throw new Error(result.error.message);
  }

  const completionRows = (completions.data ?? []) as { lesson_id: string; platform_user_id: string; completed_at: string }[];
  const quizRows = (quizzes.data ?? []) as {
    lesson_id: string;
    platform_user_id: string;
    score_percent: number;
    submitted_at: string;
  }[];
  const launchRows = (launches.data ?? []) as unknown as { platform_user_id: string; last_launched_at: string }[];

  const lastActive = new Map<string, string>();
  const touch = (id: string, at: string | null | undefined) => {
    if (!at) return;
    const prev = lastActive.get(id);
    if (!prev || at > prev) lastActive.set(id, at);
  };
  completionRows.forEach((r) => touch(r.platform_user_id, r.completed_at));
  quizRows.forEach((r) => touch(r.platform_user_id, r.submitted_at));
  launchRows.forEach((r) => touch(r.platform_user_id, r.last_launched_at));

  const learnerIds = [...lastActive.keys()];
  if (learnerIds.length === 0) return empty;
  const identities = await resolveLearnerIdentities(learnerIds);

  const completionsByLessonId: Record<string, number> = {};
  for (const r of completionRows) completionsByLessonId[r.lesson_id] = (completionsByLessonId[r.lesson_id] ?? 0) + 1;

  const scoresByQuiz = new Map<string, number[]>();
  for (const r of quizRows) scoresByQuiz.set(r.lesson_id, [...(scoresByQuiz.get(r.lesson_id) ?? []), r.score_percent]);
  const averageScoreByQuizId = Object.fromEntries(
    [...scoresByQuiz].map(([id, scores]) => [id, Math.round(mean(scores) ?? 0)])
  );

  const learners: CourseLearnerRow[] = learnerIds
    .map((id) => {
      const lessonsCompleted = completionRows.filter((r) => r.platform_user_id === id).length;
      const quizAverage = mean(quizRows.filter((r) => r.platform_user_id === id).map((r) => r.score_percent));
      return {
        id,
        name: identities.get(id)?.name ?? id,
        email: identities.get(id)?.email ?? null,
        lessonsCompleted,
        percentComplete: publishedCount === 0 ? 0 : Math.min(100, Math.round((lessonsCompleted / publishedCount) * 100)),
        averageQuizScore: quizAverage === null ? null : Math.round(quizAverage),
        lastActiveAt: lastActive.get(id) ?? null,
      };
    })
    .sort((a, b) => (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? ""));

  const averagePercentComplete = mean(learners.map((l) => l.percentComplete));
  const averageQuizScore = mean(quizRows.map((r) => r.score_percent));
  return {
    learners,
    completionsByLessonId,
    averageScoreByQuizId,
    averagePercentComplete: averagePercentComplete === null ? null : Math.round(averagePercentComplete),
    averageQuizScore: averageQuizScore === null ? null : Math.round(averageQuizScore),
  };
}
