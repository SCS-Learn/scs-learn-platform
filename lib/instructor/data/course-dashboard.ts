import "server-only";

import { createClient } from "@/lib/supabase/server";

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
  learnerCount: number;
  learnerPage: number;
  learnerPageCount: number;
  /** lesson id -> number of learners who marked it complete. */
  completionsByLessonId: Record<string, number>;
  /** quiz lesson id -> mean score_percent over submissions. */
  averageScoreByQuizId: Record<string, number>;
  /** Mean over every learner's percentComplete; null with no learners. */
  averagePercentComplete: number | null;
  /** Mean over every quiz submission in the course; null with none. */
  averageQuizScore: number | null;
};

export async function getCourseActivity(courseId: string, page: number): Promise<CourseActivity> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("course_activity_summary", {
    p_course_id: courseId,
    p_page: page,
  });
  if (error) throw new Error(error.message);
  return data as CourseActivity;
}
