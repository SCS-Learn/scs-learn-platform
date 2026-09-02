export type LessonType = "lesson" | "quiz";

export type StudentQuestion = {
  id: string;
  promptText: string;
  choices: string[] | null;
  /** Included so the demo/practice quiz can self-check instantly — see QuizBlock. Never shown until the learner submits. */
  answerKey: string | null;
  questionType: "multiple_choice" | "short_answer" | "free_response" | "unknown";
};

export type StudentLessonBlock = {
  id: string;
  kind: "slide_file" | "video" | "question_group";
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

export type StudentLesson = {
  id: string;
  code: string;
  title: string;
  type: LessonType;
  contentHtml: string;
  contentSource: "html" | "blocks";
  blocks: StudentLessonBlock[];
  autolab: AutolabStatus | null;
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
};
