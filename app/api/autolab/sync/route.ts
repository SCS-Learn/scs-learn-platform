import { NextResponse } from "next/server";
import { AutolabAuthError, AutolabNotConfiguredError } from "@/lib/autolab/client";
import { getAutolabLinkForLesson, syncLearnerScore } from "@/lib/autolab/grades";
import { getLaunchingUser } from "@/lib/lti/config";

export const dynamic = "force-dynamic";

// Pulls the current learner's score for one Autolab-backed lesson.
//
// Called when a learner returns to the lesson, and safe to call from a cron job
// over a roster later. It is a pull rather than a push because Autolab has no
// grade services to push with (see docs/lti.md).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const lessonId = body?.lessonId;
  if (typeof lessonId !== "string") {
    return NextResponse.json({ error: "lessonId is required" }, { status: 400 });
  }

  const link = await getAutolabLinkForLesson(lessonId);
  if (!link) {
    return NextResponse.json({ error: "No Autolab assessment on this lesson" }, { status: 404 });
  }

  const user = await getLaunchingUser();

  try {
    const outcome = await syncLearnerScore({
      link,
      platformUserId: user.id,
      // Autolab addresses scores by email and has no notion of our user ids, so
      // the two accounts are joined on email. With real auth this should be the
      // learner's CMU address rather than whatever they signed up with.
      autolabEmail: user.email,
    });

    if (outcome.status === "error") {
      return NextResponse.json({ error: outcome.message }, { status: 502 });
    }
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof AutolabNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof AutolabAuthError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
