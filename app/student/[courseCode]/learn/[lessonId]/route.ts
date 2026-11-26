import { getCurrentLearner } from "@/lib/lti/config";
import { getStudentLesson } from "@/lib/student/data/course";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: RouteContext<"/student/[courseCode]/learn/[lessonId]">) {
  const learner = await getCurrentLearner();
  if (!learner) return Response.json({ error: "Sign in required" }, { status: 401, headers });

  const { courseCode, lessonId } = await params;
  const lesson = await getStudentLesson(courseCode, lessonId, learner.id);
  if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404, headers });
  return Response.json(lesson, { headers });
}
