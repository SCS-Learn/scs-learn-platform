import { createClient } from "@/lib/supabase/server";
import { getLaunchingUser } from "@/lib/lti/config";
import { cogniterraLessonUrl } from "@/lib/cogniterra/client";
import {
  fetchLessonCompletionsForLessons,
  fetchQuizSubmissionsForLessons,
  loadQuestionsForBlocks,
  questionBlockKey,
} from "@/lib/student/data/learner-records";
import { sanitizeLessonHtml } from "@/lib/html/sanitize-lesson-html";
import { reconcileQuizSubmission } from "@/lib/quiz/grading";
import { revealedAnswers, withoutAnswerKey } from "@/lib/quiz/learner-view";
import { DEFAULT_QUIZ_COMPLETION_THRESHOLD } from "@/lib/quiz/types";
import { applyQuestionVariants } from "@/lib/quiz/variants";
import type {
  StudentCourse,
  StudentCourseSummary,
  StudentUnit,
  StudentLesson,
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

type LessonRow = {
  id: string;
  code: string;
  title: string;
  type: string;
  position: number;
  content_html: string;
  content_source: string;
  is_published: boolean;
  quiz_completion_threshold: number;
  show_reference_answers: boolean;
  attachments: AttachmentRow[];
  lesson_blocks: LessonBlockRow[];
};

type UnitRow = {
  id: string;
  code: string;
  title: string;
  position: number;
  lessons: LessonRow[];
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
const COURSE_WITH_CONTENT_SELECT =
  "code, title, department, track, units(id, code, title, position, lessons(id, code, title, type, position, content_html, content_source, is_published, quiz_completion_threshold, show_reference_answers, attachments(url, name, storage_path, lesson_block_id), lesson_blocks(id, kind, position, title, render_mode, body_html, rendered_image_urls, video_url, question_group_id)))";

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
      .in("lesson_id", lessonIds);
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
      .in("lesson_id", lessonIds);
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

function toUnit(row: UnitRow, ctx: LearnerContext): StudentUnit | null {
  const publishedLessons = [...row.lessons]
    .filter((l) => l.is_published)
    .sort((a, b) => a.position - b.position)
    .map((l) => toLesson(l, ctx));
  if (publishedLessons.length === 0) return null;
  return { id: row.id, code: row.code, title: row.title, lessons: publishedLessons };
}

function toCourse(row: CourseRow, ctx: LearnerContext): StudentCourse {
  const units = [...row.units]
    .sort((a, b) => a.position - b.position)
    .map((u) => toUnit(u, ctx))
    .filter((u): u is StudentUnit => u !== null);
  return { code: row.code, title: row.title, department: row.department, track: row.track, units };
}

export async function listStudentCourses(): Promise<StudentCourseSummary[]> {
  const supabase = await createClient();
  const [{ data, error }, learner] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "code, title, department, track, units(id, position, lessons(id, code, title, type, position, is_published))"
      )
      .order("code"),
    getLaunchingUser(),
  ]);
  if (error) throw new Error(error.message);

  type SummaryLessonRow = {
    id: string;
    code: string;
    title: string;
    type: string;
    position: number;
    is_published: boolean;
  };
  type SummaryUnitRow = {
    id: string;
    position: number;
    lessons: SummaryLessonRow[];
  };
  type SummaryCourseRow = {
    code: string;
    title: string;
    department: string;
    track: string;
    units: SummaryUnitRow[];
  };

  const courses = (data ?? []) as unknown as SummaryCourseRow[];
  const allLessonIds = courses.flatMap((course) =>
    course.units.flatMap((unit) =>
      unit.lessons.filter((lesson) => lesson.is_published).map((lesson) => lesson.id)
    )
  );
  const completedByLessonId = await fetchLessonCompletionsForLessons(allLessonIds, learner.id);

  return courses.map((course) => {
    const unitsWithPublished = [...course.units]
      .sort((a, b) => a.position - b.position)
      .map((unit) => ({
        ...unit,
        lessons: [...unit.lessons]
          .filter((lesson) => lesson.is_published)
          .sort((a, b) => a.position - b.position),
      }))
      .filter((unit) => unit.lessons.length > 0);

    const lessons = unitsWithPublished.flatMap((unit) => unit.lessons);
    const contentLessonCount = lessons.filter((lesson) => lesson.type !== "quiz").length;
    const quizLessonCount = lessons.filter((lesson) => lesson.type === "quiz").length;
    const completedLessonCount = lessons.filter((lesson) => completedByLessonId.has(lesson.id)).length;
    const totalLessonCount = lessons.length;
    const percentComplete =
      totalLessonCount === 0 ? 0 : Math.round((completedLessonCount / totalLessonCount) * 100);

    const resumeLesson =
      lessons.find((lesson) => !completedByLessonId.has(lesson.id)) ?? lessons[0] ?? null;

    return {
      code: course.code,
      title: course.title,
      department: course.department,
      track: course.track,
      unitCount: unitsWithPublished.length,
      contentLessonCount,
      quizLessonCount,
      completedLessonCount,
      totalLessonCount,
      percentComplete,
      resumeLessonId: resumeLesson?.id ?? null,
      resumeLessonCode: resumeLesson?.code ?? null,
      resumeLessonTitle: resumeLesson?.title ?? null,
    };
  });
}

export async function getStudentCourse(courseCode: string): Promise<StudentCourse | null> {
  const supabase = await createClient();
  const [{ data, error }, learner] = await Promise.all([
    supabase.from("courses").select(COURSE_WITH_CONTENT_SELECT).eq("code", courseCode).maybeSingle(),
    getLaunchingUser(),
  ]);
  if (error) throw new Error(error.message);
  if (!data) return null;

  const course = data as unknown as CourseRow;
  const lessonIds = course.units.flatMap((u) => u.lessons.map((l) => l.id));
  // Questions are read with the service role (they carry answer keys), so
  // only for lessons this page will actually show: published ones.
  const publishedQuestionBlocks = course.units.flatMap((u) =>
    u.lessons
      .filter((l) => l.is_published)
      .flatMap((l) =>
        l.lesson_blocks.flatMap((b) => (b.question_group_id ? [{ lessonId: l.id, groupId: b.question_group_id }] : []))
      )
  );
  const [autolabByLessonId, ltiByLessonId, quizByLessonId, completedByLessonId, questionsByBlock] =
    await Promise.all([
      fetchAutolabStatusByLessonId(lessonIds, learner.id),
      fetchLtiStatusByLessonId(lessonIds, learner.id),
      fetchQuizSubmissionsForLessons(lessonIds, learner.id),
      fetchLessonCompletionsForLessons(lessonIds, learner.id),
      loadQuestionsForBlocks(publishedQuestionBlocks),
    ]);

  return toCourse(course, {
    autolabByLessonId,
    ltiByLessonId,
    quizByLessonId,
    completedByLessonId,
    questionsByBlock,
  });
}
