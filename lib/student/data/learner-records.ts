import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_QUIZ_COMPLETION_THRESHOLD } from "@/lib/quiz/types";
import { parseVariants } from "@/lib/quiz/variants";
import type { QuestionChoices } from "@/lib/quiz/types";
import type { QuizSubmissionStatus, StudentQuestion } from "@/lib/student/types";

/**
 * Server-side data access for learner records. Deliberately not a
 * "use server" module: nothing here is callable from the browser.
 *
 * - Reads of the learner's own rows use the cookie client, so RLS limits them
 *   to the signed-in user (or course staff).
 * - Quiz questions are read with the service role, because they carry answer
 *   keys and learners have no SELECT on public.questions. Callers check that
 *   the lesson is published first, and strip the keys (lib/quiz/learner-view.ts)
 *   before anything reaches the browser.
 * - Learner writes (quiz_submissions, quiz_responses, lesson_completions) go
 *   through the service role after the server has graded the attempt or
 *   checked the completion threshold. Learners can't write these tables
 *   directly (supabase/migrations/server-side-learner-writes.sql).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server action arguments are attacker-controlled: reject anything that isn't a uuid string. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function assertUuid(value: unknown, what: string): asserts value is string {
  if (!isUuid(value)) throw new Error(`Invalid ${what}`);
}

/** Service-role client for learner writes; only call it after the checks above. */
export function learnerWriteClient() {
  return createServiceClient();
}

export type PublishedLesson = {
  id: string;
  quizCompletionThreshold: number;
  showReferenceAnswers: boolean;
};

/** The lesson, if the signed-in user can read it and it is published; throws otherwise. */
export async function getPublishedLesson(lessonId: unknown): Promise<PublishedLesson> {
  assertUuid(lessonId, "lesson");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("id, is_published, quiz_completion_threshold, show_reference_answers")
    .eq("id", lessonId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.is_published) throw new Error("Lesson not found");
  return {
    id: data.id as string,
    quizCompletionThreshold:
      (data.quiz_completion_threshold as number | null) ?? DEFAULT_QUIZ_COMPLETION_THRESHOLD,
    showReferenceAnswers: (data.show_reference_answers as boolean | null) ?? false,
  };
}

type QuestionRow = {
  id: string;
  prompt_text: string;
  choices: QuestionChoices;
  answer_key: string | null;
  question_type: string;
  points: number;
  variants?: unknown;
};

function toQuestion(row: QuestionRow): StudentQuestion {
  const variants = parseVariants(row.variants);
  return {
    id: row.id,
    promptText: row.prompt_text,
    choices: row.choices,
    answerKey: row.answer_key,
    questionType: row.question_type as StudentQuestion["questionType"],
    points: row.points,
    ...(variants.length > 0 ? { variants } : {}),
  };
}

/** A lesson's question-group block: the lesson id and the block's question_group_id. */
export type QuestionBlockRef = { lessonId: string; groupId: string };

export function questionBlockKey({ lessonId, groupId }: QuestionBlockRef): string {
  return `${lessonId}/${groupId}`;
}

/**
 * Questions for question-group blocks, WITH answer keys, in position order,
 * keyed by questionBlockKey(). A block only gets its group's questions when
 * the group belongs to the block's own lesson, so a block pointing at another
 * lesson's quiz yields nothing. Service role: only pass blocks of lessons the
 * caller has already confirmed are published.
 */
export async function loadQuestionsForBlocks(blocks: QuestionBlockRef[]): Promise<Map<string, StudentQuestion[]>> {
  const byBlock = new Map<string, StudentQuestion[]>();
  if (blocks.length === 0) return byBlock;
  const service = createServiceClient();

  const groupIds = [...new Set(blocks.map((b) => b.groupId))];
  const { data, error } = await service
    .from("question_groups")
    .select("id, lesson_id, lessons!inner(id), questions(id, prompt_text, choices, answer_key, question_type, points, variants)")
    .in("id", groupIds)
    .in("lesson_id", [...new Set(blocks.map((block) => block.lessonId))])
    .eq("lessons.is_published", true)
    .order("position", { referencedTable: "questions" });
  if (error) throw new Error(error.message);

  const groups = new Map((data ?? []).map((group) => [group.id as string, group]));
  for (const block of blocks) {
    const group = groups.get(block.groupId);
    if (group?.lesson_id === block.lessonId) {
      byBlock.set(questionBlockKey(block), (group.questions as QuestionRow[]).map(toQuestion));
    }
  }
  return byBlock;
}

/**
 * Every question in a lesson's question-group blocks, WITH answer keys, in the
 * order the learner sees them (block position, then question position).
 * Service role: only call after getPublishedLesson().
 */
export async function loadLessonQuestions(lessonId: string): Promise<StudentQuestion[]> {
  const { data, error } = await createServiceClient()
    .from("lesson_blocks")
    .select("question_group_id")
    .eq("lesson_id", lessonId)
    .not("question_group_id", "is", null)
    .order("position");
  if (error) throw new Error(error.message);

  const blocks = (data ?? []).map((row) => ({ lessonId, groupId: row.question_group_id as string }));
  const byBlock = await loadQuestionsForBlocks(blocks);
  return blocks.flatMap((block) => byBlock.get(questionBlockKey(block)) ?? []);
}

export async function fetchQuizSubmissionsForLessons(
  lessonIds: string[],
  platformUserId: string
): Promise<Map<string, QuizSubmissionStatus>> {
  if (lessonIds.length === 0) return new Map();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("quiz_submissions")
      .select(
        "id, lesson_id, correct_count, gradable_count, score_percent, submitted_at, variant_index, quiz_responses(question_id, response_text, score_fraction, feedback, grading_feedback_rating)"
      )
      .eq("platform_user_id", platformUserId)
      .in("lesson_id", lessonIds);
    if (error) throw new Error(error.message);

    return new Map(
      (data ?? []).map((row) => {
        const responses: Record<string, string> = {};
        const scores: QuizSubmissionStatus["scores"] = {};
        for (const response of (row.quiz_responses ?? []) as {
          question_id: string;
          response_text: string;
          score_fraction: number | null;
          feedback: string | null;
          grading_feedback_rating: "up" | "down" | null;
        }[]) {
          responses[response.question_id] = response.response_text;
          if (response.score_fraction !== null) {
            scores[response.question_id] = {
              fraction: Number(response.score_fraction),
              feedback: response.feedback,
              feedbackRating: response.grading_feedback_rating,
            };
          }
        }
        return [
          row.lesson_id as string,
          {
            submittedAt: row.submitted_at as string,
            correctCount: Number(row.correct_count),
            gradableCount: row.gradable_count as number,
            scorePercent: row.score_percent as number,
            responses,
            variantIndex: (row.variant_index as number | null | undefined) ?? 0,
            scores,
          },
        ] as const;
      })
    );
  } catch (error) {
    console.warn(
      "Skipping quiz progress:",
      error
    );
    return new Map();
  }
}

/** The fields needed to reconcile displayed grades, without feedback or grading details. */
export async function fetchQuizResponsesForOutline(lessonIds: string[], learnerId: string) {
  const attempts = new Map<string, { variantIndex: number; responses: Record<string, string> }>();
  if (lessonIds.length === 0) return attempts;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_submissions")
    .select("lesson_id, variant_index, quiz_responses(question_id, response_text)")
    .eq("platform_user_id", learnerId)
    .in("lesson_id", lessonIds);
  if (error) {
    console.warn("Skipping quiz scores for the course outline:", error.message);
    return attempts;
  }
  for (const attempt of data ?? []) {
    attempts.set(attempt.lesson_id as string, {
      variantIndex: (attempt.variant_index as number | null) ?? 0,
      responses: Object.fromEntries(attempt.quiz_responses.map((row) => [row.question_id, row.response_text])),
    });
  }
  return attempts;
}

export async function fetchLessonCompletionsForLessons(
  lessonIds: string[],
  platformUserId: string
): Promise<Map<string, string>> {
  if (lessonIds.length === 0) return new Map();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lesson_completions")
      .select("lesson_id, completed_at")
      .eq("platform_user_id", platformUserId)
      .in("lesson_id", lessonIds);
    if (error) throw new Error(error.message);

    return new Map(
      (data ?? []).map((row) => [row.lesson_id as string, row.completed_at as string] as const)
    );
  } catch (error) {
    console.warn(
      "Skipping lesson completions:",
      error
    );
    return new Map();
  }
}
