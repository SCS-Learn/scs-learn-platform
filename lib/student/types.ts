export type LessonType = "lesson" | "quiz";

import type { QuestionChoices, QuestionType } from "@/lib/quiz/types";

export type StudentQuestion = {
  id: string;
  promptText: string;
  choices: QuestionChoices;
  /** Used client-side for instant grading — never shown until the learner submits. */
  answerKey: string | null;
  questionType: QuestionType;
};

export type StudentLessonBlock = {
  id: string;
  kind: "slide_file" | "video" | "question_group" | "course_notes";
  title: string | null;
  renderMode: "pdf_embed" | "slide_card_images" | "slide_rendered_images" | null;
  bodyHtml: string | null;
  renderedImageUrls: string[] | null;
  pdfUrl: string | null;
  videoUrl: string | null;
  questions: StudentQuestion[] | null;
};

/** A pulled Autolab score for the current stub learner, joined onto its lesson — see lib/autolab/grades.ts for the sync side. */
export type AutolabStatus = {
  title: string;
  pointsPossible: number;
  courseName: string;
  assessmentName: string;
  embedInIframe: boolean;
  score: number | null;
  noSubmission: boolean;
  syncedAt: string | null;
};

/** Saved in-app quiz attempt for the current learner. */
export type QuizSubmissionStatus = {
  submittedAt: string;
  correctCount: number;
  gradableCount: number;
  scorePercent: number;
  responses: Record<string, string>;
};

export type StudentLesson = {
  id: string;
  code: string;
  title: string;
  type: LessonType;
  contentHtml: string;
  contentSource: "html" | "blocks";
  blocks: StudentLessonBlock[];
  autolab: AutolabStatus | null;
  quizSubmission: QuizSubmissionStatus | null;
  /** Minimum score (%) required to mark this quiz complete; only applies to quizzes. */
  quizCompletionThreshold: number;
  /** ISO timestamp when the learner marked this lesson complete; null if not complete. */
  completedAt: string | null;
};

export type StudentUnit = {
  id: string;
  code: string;
  title: string;
  lessons: StudentLesson[];
};

export type StudentCourse = {
  code: string;
  title: string;
  department: string;
  track: string;
  units: StudentUnit[];
};

export type StudentCourseSummary = {
  code: string;
  title: string;
  department: string;
  track: string;
  unitCount: number;
  contentLessonCount: number;
  quizLessonCount: number;
  completedLessonCount: number;
  totalLessonCount: number;
  percentComplete: number;
  /** First incomplete published lesson in course order; null if none. */
  resumeLessonId: string | null;
  resumeLessonCode: string | null;
  resumeLessonTitle: string | null;
};

