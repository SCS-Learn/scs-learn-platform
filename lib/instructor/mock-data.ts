export type LessonType = "lesson" | "quiz";

export type LessonItem = {
  id: string;
  code: string;
  title: string;
  type: LessonType;
  contentHtml: string;
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

export const lessonTypeOptions = ["Video lesson", "Reading", "Quiz", "Assignment"];

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
