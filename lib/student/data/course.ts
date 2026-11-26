import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getLaunchingUser } from "@/lib/lti/config";
import { cogniterraLessonUrl } from "@/lib/cogniterra/client";
import {
  fetchLessonCompletionsForLessons,
  fetchQuizResponsesForOutline,
  fetchQuizSubmissionsForLessons,
  isUuid,
  loadQuestionsForBlocks,
  questionBlockKey,
} from "@/lib/student/data/learner-records";
import { sanitizeLessonHtml } from "@/lib/html/sanitize-lesson-html";
import { reconcileQuizSubmission, scoreQuiz } from "@/lib/quiz/grading";
import { revealedAnswers, withoutAnswerKey } from "@/lib/quiz/learner-view";
import { DEFAULT_QUIZ_COMPLETION_THRESHOLD } from "@/lib/quiz/types";
import { applyQuestionVariants } from "@/lib/quiz/variants";
import type {
  StudentCourse,
  StudentCourseSummary,
  StudentUnit,
  StudentLesson,
  StudentLessonSummary,
  StudentLessonBlock,
  StudentQuestion,
  AutolabStatus,
  LtiStatus,
  QuizSubmissionStatus,
  LessonType,
} from "@/lib/student/types";

type AutolabScoreRow = {
  platform_user_id: string;
  score: number | null;
  points_possible: number | null;
  no_submission: boolean;
  synced_at: string;
};

type AutolabLinkRow = {
  lesson_id: string;
  course_name: string;
  assessment_name: string;
  title: string;
  points_possible: number;
  embed_in_iframe: boolean;
  autolab_scores: AutolabScoreRow[] | null;
};

type LessonBlockRow = {
  id: string;
  kind: "slide_file" | "video" | "question_group" | "course_notes";
  position: number;
  title: string | null;
  render_mode: "pdf_embed" | "slide_card_images" | "slide_rendered_images" | null;
  body_html: string | null;
  rendered_image_urls: string[] | null;
  video_url: string | null;
  question_group_id: string | null;
};

type AttachmentRow = {
  url: string | null;
  name: string;
  lesson_block_id: string | null;
  storage_path: string | null;
};

type LessonOutlineRow = {
  id: string;
  code: string;
  title: string;
  type: string;
  lesson_blocks: { position: number; question_group_id: string | null }[];
};

type LessonRow = LessonOutlineRow & {
  content_html: string;
  content_source: string;
  quiz_completion_threshold: number;
  show_reference_answers: boolean;
  attachments: AttachmentRow[];
  lesson_blocks: LessonBlockRow[];
};

type UnitRow = {
  id: string;
  code: string;
  title: string;
  lessons: LessonOutlineRow[];
};

type CourseRow = {
  code: string;
  title: string;
  department: string;
  track: string;
  units: UnitRow[];
};

// Deliberately no autolab_links here: that table only exists once
// supabase/autolab.sql has been run, and embedding an optional table directly
// in this query means a missing table fails the *entire* course fetch with a
// PostgREST "no relationship in schema cache" error. Fetched separately below
// instead, where its absence can degrade to "no autolab data" instead of
// breaking every course's page.
const LESSON_CONTENT_SELECT =
  "id, code, title, type, content_html, content_source, quiz_completion_threshold, show_reference_answers, attachments(url, name, storage_path, lesson_block_id), lesson_blocks(id, kind, position, title, render_mode, body_html, rendered_image_urls, video_url, question_group_id)";

type LtiScoreRow = {
  platform_user_id: string;
  score: number | null;
  reported_at: string | null;
};

type LtiLinkRow = {
  id: string;
  lesson_id: string;
  title: string;
  points_possible: number;
  custom_params: { lesson?: string } | null;
  lti_results: LtiScoreRow[] | null;
};

function toLtiStatus(link: LtiLinkRow, learnerId: string): LtiStatus {
  const scoreRow = link.lti_results?.find((s) => s.platform_user_id === learnerId) ?? null;
  return {
    linkId: link.id,
    title: link.title,
    pointsPossible: Number(link.points_possible),
    score: scoreRow?.score ?? null,
    reportedAt: scoreRow?.reported_at ?? null,
    // Fallback link alongside the LTI iframe - see cogniterraLessonUrl.
    directUrl: link.custom_params?.lesson ? cogniterraLessonUrl(link.custom_params.lesson) : null,
  };
}

async function fetchLtiStatusByLessonId(
  lessonIds: string[],
  learnerId: string
): Promise<Map<string, LtiStatus>> {
  if (lessonIds.length === 0) return new Map();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lti_links")
      .select(
        "id, lesson_id, title, points_possible, custom_params, lti_results(platform_user_id, score, reported_at)"
      )
      .in("lesson_id", lessonIds)
      .eq("lti_results.platform_user_id", learnerId);
    if (error) throw new Error(error.message);

    return new Map(
      (data ?? []).map((row) => [row.lesson_id, toLtiStatus(row as unknown as LtiLinkRow, learnerId)])
    );
  } catch (error) {
    console.warn("Skipping LTI status (lti tables likely not run yet):", error);
    return new Map();
  }
}

function toAutolabStatus(link: AutolabLinkRow, learnerId: string): AutolabStatus {
  const scoreRow = link.autolab_scores?.find((s) => s.platform_user_id === learnerId) ?? null;
  return {
    title: link.title,
    pointsPossible: Number(link.points_possible),
    courseName: link.course_name,
    assessmentName: link.assessment_name,
    embedInIframe: link.embed_in_iframe,
    score: scoreRow?.score ?? null,
    noSubmission: scoreRow?.no_submission ?? false,
    syncedAt: scoreRow?.synced_at ?? null,
  };
}

// Best-effort: autolab_links/autolab_scores only exist once supabase/autolab.sql
// has been run. Any failure here (most commonly that table not existing yet)
// degrades to "no autolab data" rather than failing the whole course page.
async function fetchAutolabStatusByLessonId(
  lessonIds: string[],
  learnerId: string
): Promise<Map<string, AutolabStatus>> {
  if (lessonIds.length === 0) return new Map();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("autolab_links")
      .select(
        "lesson_id, course_name, assessment_name, title, points_possible, embed_in_iframe, autolab_scores(platform_user_id, score, points_possible, no_submission, synced_at)"
      )
      .in("lesson_id", lessonIds)
      .eq("autolab_scores.platform_user_id", learnerId);
    if (error) throw new Error(error.message);

    return new Map(
      (data ?? []).map((row) => [row.lesson_id, toAutolabStatus(row as unknown as AutolabLinkRow, learnerId)])
    );
  } catch (error) {
    console.warn("Skipping Autolab status (supabase/autolab.sql likely not run yet):", error);
    return new Map();
  }
}

function isHostedPdfAttachment(attachment: AttachmentRow): boolean {
  if (!attachment.url || !attachment.storage_path) return false;
  if (attachment.url.includes("drive.google.com") || attachment.url.includes("docs.google.com")) {
    return false;
  }
  return attachment.name.toLowerCase().endsWith(".pdf");
}

function pdfUrlForBlock(block: LessonBlockRow, attachments: AttachmentRow[]): string | null {
  const linked = attachments.find((a) => a.lesson_block_id === block.id && isHostedPdfAttachment(a));
  if (linked?.url) return linked.url;

  if (block.render_mode !== "pdf_embed") return null;

  const lessonPdf = attachments.find((a) => !a.lesson_block_id && isHostedPdfAttachment(a));
  return lessonPdf?.url ?? null;
}

type LearnerContext = {
  autolabByLessonId: Map<string, AutolabStatus>;
  ltiByLessonId: Map<string, LtiStatus>;
  quizByLessonId: Map<string, QuizSubmissionStatus>;
  completedByLessonId: Map<string, string>;
  /** Questions WITH answer keys by questionBlockKey(), for grading here on the server; stripped before they leave toLesson. */
  questionsByBlock: Map<string, StudentQuestion[]>;
};

function toLesson(row: LessonRow, ctx: LearnerContext): StudentLesson {
  const blocks: StudentLessonBlock[] = [...row.lesson_blocks]
    .sort((a, b) => a.position - b.position)
    .map((block) => ({
      id: block.id,
      kind: block.kind,
      title: block.title,
      renderMode: block.render_mode,
      bodyHtml: sanitizeLessonHtml(block.body_html),
      renderedImageUrls: block.rendered_image_urls,
      pdfUrl: pdfUrlForBlock(block, row.attachments),
      videoUrl: block.video_url,
      questions: block.question_group_id
        ? (ctx.questionsByBlock.get(questionBlockKey({ lessonId: row.id, groupId: block.question_group_id })) ?? [])
        : null,
    }));

  const quizSubmission = ctx.quizByLessonId.get(row.id) ?? null;
  const showReferenceAnswers = row.show_reference_answers ?? false;
  const questions = blocks.flatMap((block) => block.questions ?? []);
  const variantIndex = quizSubmission?.variantIndex ?? 0;
  const scoredQuestions = applyQuestionVariants(questions, variantIndex);
  const reconciled = reconcileQuizSubmission(scoredQuestions, quizSubmission);

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type: row.type as LessonType,
    contentHtml: sanitizeLessonHtml(row.content_html),
    contentSource: row.content_source as StudentLesson["contentSource"],
    // Answer keys stay on the server; see lib/quiz/learner-view.ts.
    blocks: blocks.map((block) => ({ ...block, questions: block.questions?.map(withoutAnswerKey) ?? null })),
    autolab: ctx.autolabByLessonId.get(row.id) ?? null,
    lti: ctx.ltiByLessonId.get(row.id) ?? null,
    quizSubmission: reconciled && {
      ...reconciled,
      correctAnswers: revealedAnswers(scoredQuestions, reconciled.scores, showReferenceAnswers),
    },
    quizCompletionThreshold: row.quiz_completion_threshold ?? DEFAULT_QUIZ_COMPLETION_THRESHOLD,
    showReferenceAnswers,
    completedAt: ctx.completedByLessonId.get(row.id) ?? null,
  };
}

function questionBlocks(lesson: LessonOutlineRow) {
  return [...lesson.lesson_blocks]
    .sort((a, b) => a.position - b.position)
    .flatMap(({ question_group_id }) => question_group_id ? [{ lessonId: lesson.id, groupId: question_group_id }] : []);
}

export async function listStudentCourses(): Promise<StudentCourseSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_course_summaries").order("code");
  if (error) throw new Error(error.message);
  return data as StudentCourseSummary[];
}

async function readCourseOutline(courseCode: string): Promise<CourseRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("code, title, department, track, units(id, code, title, lessons(id, code, title, type, lesson_blocks(position, question_group_id)))")
    .eq("code", courseCode)
    .eq("units.lessons.is_published", true)
    .not("units.lessons.lesson_blocks.question_group_id", "is", null)
    .order("position", { referencedTable: "units" })
    .order("position", { referencedTable: "units.lessons" })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as CourseRow | null;
}

async function loadOutlineProgress(course: CourseRow, learnerId: string): Promise<StudentCourse> {
  const lessons = course.units.flatMap((unit) => unit.lessons);
  const lessonIds = lessons.map((lesson) => lesson.id);
  const quizLessons = lessons.filter((lesson) => lesson.type === "quiz" || lesson.lesson_blocks.length > 0);
  const [autolab, lti, completions, attempts] = await Promise.all([
    fetchAutolabStatusByLessonId(lessonIds, learnerId),
    fetchLtiStatusByLessonId(lessonIds, learnerId),
    fetchLessonCompletionsForLessons(lessonIds, learnerId),
    fetchQuizResponsesForOutline(quizLessons.map((lesson) => lesson.id), learnerId),
  ]);

  // Only submitted quizzes need answer keys to display a score against the live questions.
  const submittedQuizBlocks = quizLessons
    .filter(({ id }) => attempts.has(id) && !lti.has(id) && !autolab.has(id))
    .flatMap(questionBlocks);
  const questions = await loadQuestionsForBlocks(submittedQuizBlocks);
  const quizScores = new Map<string, number>();
  for (const lesson of quizLessons) {
    const attempt = attempts.get(lesson.id);
    if (!attempt || lti.has(lesson.id) || autolab.has(lesson.id)) continue;
    const quizQuestions = questionBlocks(lesson).flatMap((block) => questions.get(questionBlockKey(block)) ?? []);
    if (lesson.type === "quiz" || quizQuestions.length > 0) {
      const scoredQuestions = applyQuestionVariants(quizQuestions, attempt.variantIndex);
      quizScores.set(lesson.id, scoreQuiz(scoredQuestions, attempt.responses).scorePercent);
    }
  }
  const units: StudentUnit[] = course.units
    .filter((unit) => unit.lessons.length > 0)
    .map((unit) => ({
      id: unit.id,
      code: unit.code,
      title: unit.title,
      lessons: unit.lessons.map((lesson): StudentLessonSummary => {
        const { id, code, title, type } = lesson;
        const ltiStatus = lti.get(id);
        const autolabStatus = autolab.get(id);
        return {
          id, code, title, type: type as LessonType,
          quizScore: quizScores.get(id) ?? null,
          completedAt: completions.get(id) ?? null,
          autolab: autolabStatus ? { score: autolabStatus.score, pointsPossible: autolabStatus.pointsPossible } : null,
          lti: ltiStatus ? { score: ltiStatus.score, pointsPossible: ltiStatus.pointsPossible } : null,
        };
      }),
    }));
  return { code: course.code, title: course.title, department: course.department, track: course.track, units };
}

export async function getStudentCourseOutline(courseCode: string): Promise<StudentCourse | null> {
  const [course, learner] = await Promise.all([readCourseOutline(courseCode), getLaunchingUser()]);
  return course ? loadOutlineProgress(course, learner.id) : null;
}

export async function getStudentCourseForLearning(courseCode: string, requestedLessonId?: string) {
  const [course, learner] = await Promise.all([readCourseOutline(courseCode), getLaunchingUser()]);
  if (!course) return null;

  const lessons = course.units.flatMap((unit) => unit.lessons);
  const selected = lessons.find((lesson) => lesson.id === requestedLessonId?.toLowerCase()) ?? lessons[0];
  const [outline, lesson] = await Promise.all([
    loadOutlineProgress(course, learner.id),
    selected ? getStudentLesson(courseCode, selected.id, learner.id) : null,
  ]);
  return { course: outline, lesson };
}

export async function getStudentLesson(courseCode: string, lessonId: string, learnerId: string): Promise<StudentLesson | null> {
  if (!isUuid(lessonId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(`${LESSON_CONTENT_SELECT}, units!inner(courses!inner(code))`)
    .eq("id", lessonId)
    .eq("is_published", true)
    .eq("units.courses.code", courseCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const lesson = data as unknown as LessonRow;
  const lessonIds = [lesson.id];
  const quizBlocks = questionBlocks(lesson);
  const hasQuiz = lesson.type === "quiz" || quizBlocks.length > 0;
  const [autolabByLessonId, ltiByLessonId, quizByLessonId, completedByLessonId, questionsByBlock] =
    await Promise.all([
      fetchAutolabStatusByLessonId(lessonIds, learnerId),
      fetchLtiStatusByLessonId(lessonIds, learnerId),
      fetchQuizSubmissionsForLessons(hasQuiz ? lessonIds : [], learnerId),
      fetchLessonCompletionsForLessons(lessonIds, learnerId),
      loadQuestionsForBlocks(quizBlocks),
    ]);

  return toLesson(lesson, {
    autolabByLessonId,
    ltiByLessonId,
    quizByLessonId,
    completedByLessonId,
    questionsByBlock,
  });
}
