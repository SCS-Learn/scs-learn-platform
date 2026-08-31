export type LessonType = "lesson" | "quiz";

export type QuestionView = {
  id: string;
  promptText: string;
  choices: string[] | null;
  answerKey: string | null;
  questionType: string;
  needsReview: boolean;
};

/** A whole existing asset (a slide file, a video, or a question set) composing an organize-mode lesson - see lesson_blocks in supabase/schema.sql. */
export type LessonBlockView = {
  id: string;
  kind: "slide_file" | "video" | "question_group";
  title: string | null;
  renderMode: "pdf_embed" | "slide_card_images" | "slide_rendered_images" | null;
  bodyHtml: string | null;
  /** Ordered, durable per-slide PNG URLs - only set for renderMode "slide_rendered_images". */
  renderedImageUrls: string[] | null;
  pdfUrl: string | null;
  videoUrl: string | null;
  questions: QuestionView[] | null;
};

export type LessonContentSource = "html" | "blocks";

export type LessonItem = {
  id: string;
  code: string;
  title: string;
  type: LessonType;
  contentHtml: string;
  contentSource: LessonContentSource;
  blocks: LessonBlockView[];
  isPublished: boolean;
  updatedAt: string; // ISO timestamp
  attachments: Attachment[];
};

export type Unit = {
  id: string;
  code: string;
  title: string;
  lessons: LessonItem[];
};

export type InstructorCourse = {
  code: string;
  title: string;
  department: string;
  track: string;
  studentCount: number;
  units: Unit[];
};

export const lessonTypeOptions = ["Content", "Quiz"];

export type Attachment = {
  id: string;
  name: string;
  url: string;
};

export type Announcement = {
  id: string;
  authorName: string;
  authorInitials: string;
  courseCode: string;
  timestamp: string;
  message: string;
};

export type StudentStatus = "on-track" | "behind" | "at-risk";

export type StudentRecord = {
  id: string;
  name: string;
  initials: string;
  progressPercent: number;
  lessonsCompleted: number;
  totalLessons: number;
  avgQuizScore: number;
  lastActive: string;
  status: StudentStatus;
};

export type UnitCompletion = {
  unitCode: string;
  unitTitle: string;
  completionPercent: number | null;
};

export type QuizScoreBucket = {
  range: string;
  count: number;
};

export type CourseAnalytics = {
  courseCode: string;
  totalStudents: number;
  avgProgress: number;
  avgQuizScore: number;
  activeThisWeek: number;
  unitCompletion: UnitCompletion[];
  quizScoreDistribution: QuizScoreBucket[];
  students: StudentRecord[];
};

export const courseAnalytics: Record<string, CourseAnalytics> = {
  "02-251": {
    courseCode: "02-251",
    totalStudents: 187,
    avgProgress: 62,
    avgQuizScore: 78,
    activeThisWeek: 134,
    unitCompletion: [
      { unitCode: "Unit 1", unitTitle: "Biological sequences", completionPercent: 96 },
      { unitCode: "Unit 2", unitTitle: "Pairwise alignment", completionPercent: 84 },
      { unitCode: "Unit 3", unitTitle: "Sequence search", completionPercent: 67 },
      { unitCode: "Unit 4", unitTitle: "Multiple alignment and phylogeny", completionPercent: null },
      { unitCode: "Unit 6", unitTitle: "RNA-seq and expression", completionPercent: 31 },
    ],
    quizScoreDistribution: [
      { range: "Below 60", count: 12 },
      { range: "60-69", count: 24 },
      { range: "70-79", count: 48 },
      { range: "80-89", count: 61 },
      { range: "90-100", count: 42 },
    ],
    students: [
      { id: "stu-1", name: "Ava Thompson", initials: "AT", progressPercent: 100, lessonsCompleted: 9, totalLessons: 9, avgQuizScore: 96, lastActive: "2 hours ago", status: "on-track" },
      { id: "stu-2", name: "Liam Nguyen", initials: "LN", progressPercent: 100, lessonsCompleted: 9, totalLessons: 9, avgQuizScore: 91, lastActive: "5 hours ago", status: "on-track" },
      { id: "stu-3", name: "Sofia Ramirez", initials: "SR", progressPercent: 89, lessonsCompleted: 8, totalLessons: 9, avgQuizScore: 88, lastActive: "1 day ago", status: "on-track" },
      { id: "stu-4", name: "Marcus Chen", initials: "MC", progressPercent: 89, lessonsCompleted: 8, totalLessons: 9, avgQuizScore: 85, lastActive: "1 day ago", status: "on-track" },
      { id: "stu-5", name: "Priya Patel", initials: "PP", progressPercent: 78, lessonsCompleted: 7, totalLessons: 9, avgQuizScore: 82, lastActive: "3 days ago", status: "on-track" },
      { id: "stu-6", name: "Noah Williams", initials: "NW", progressPercent: 67, lessonsCompleted: 6, totalLessons: 9, avgQuizScore: 74, lastActive: "2 days ago", status: "behind" },
      { id: "stu-7", name: "Emma Johansson", initials: "EJ", progressPercent: 67, lessonsCompleted: 6, totalLessons: 9, avgQuizScore: 79, lastActive: "4 days ago", status: "behind" },
      { id: "stu-8", name: "Diego Fernandez", initials: "DF", progressPercent: 56, lessonsCompleted: 5, totalLessons: 9, avgQuizScore: 70, lastActive: "5 days ago", status: "behind" },
      { id: "stu-9", name: "Grace Kim", initials: "GK", progressPercent: 56, lessonsCompleted: 5, totalLessons: 9, avgQuizScore: 68, lastActive: "6 days ago", status: "behind" },
      { id: "stu-10", name: "Oliver Bennett", initials: "OB", progressPercent: 44, lessonsCompleted: 4, totalLessons: 9, avgQuizScore: 61, lastActive: "1 week ago", status: "behind" },
      { id: "stu-11", name: "Zainab Ahmed", initials: "ZA", progressPercent: 33, lessonsCompleted: 3, totalLessons: 9, avgQuizScore: 58, lastActive: "9 days ago", status: "at-risk" },
      { id: "stu-12", name: "Ethan Brooks", initials: "EB", progressPercent: 22, lessonsCompleted: 2, totalLessons: 9, avgQuizScore: 52, lastActive: "2 weeks ago", status: "at-risk" },
      { id: "stu-13", name: "Isabella Rossi", initials: "IR", progressPercent: 22, lessonsCompleted: 2, totalLessons: 9, avgQuizScore: 55, lastActive: "12 days ago", status: "at-risk" },
      { id: "stu-14", name: "Jamal Carter", initials: "JC", progressPercent: 11, lessonsCompleted: 1, totalLessons: 9, avgQuizScore: 40, lastActive: "3 weeks ago", status: "at-risk" },
      { id: "stu-15", name: "Hana Suzuki", initials: "HS", progressPercent: 0, lessonsCompleted: 0, totalLessons: 9, avgQuizScore: 0, lastActive: "Never", status: "at-risk" },
    ],
  },
  "02-450": {
    courseCode: "02-450",
    totalStudents: 0,
    avgProgress: 0,
    avgQuizScore: 0,
    activeThisWeek: 0,
    unitCompletion: [],
    quizScoreDistribution: [],
    students: [],
  },
};

export type CalendarEventType = "live-talk" | "office-hours" | "new-unit" | "cohort-launch";
export type CalendarEventScope = "global" | "course";

export type CalendarEvent = {
  id: string;
  date: string; // ISO "YYYY-MM-DD"
  title: string;
  type: CalendarEventType;
  time: string;
  description: string;
  scope: CalendarEventScope;
  courseCode?: string; // set iff scope === "course"
  hostName: string;
  hostInitials: string;
};
