import { NextResponse } from "next/server";
import { getLaunchingUser, platformBaseUrl } from "@/lib/lti/config";
import { buildLaunchParams, renderAutoSubmitForm } from "@/lib/lti/launch";
import { getLink, upsertResultForLaunch } from "@/lib/lti/tools";
import { createServiceClient } from "@/lib/supabase/service";

// Every launch is freshly signed: the OAuth timestamp and nonce make a cached
// response useless within minutes and replayable outside that window.
export const dynamic = "force-dynamic";

async function getLessonContext(lessonId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("title, unit:units (course:courses (code, title))")
    .eq("id", lessonId)
    .maybeSingle();
  if (error || !data) {
    return { courseCode: "unknown", courseTitle: "SCS Learn" };
  }

  const unit = Array.isArray(data.unit) ? data.unit[0] : data.unit;
  const course = unit && (Array.isArray(unit.course) ? unit.course[0] : unit.course);
  if (!course) {
    return { courseCode: "unknown", courseTitle: "SCS Learn" };
  }
  return { courseCode: course.code as string, courseTitle: course.title as string };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const { linkId } = await params;

  const link = await getLink(linkId);
  if (!link) {
    return NextResponse.json({ error: "Unknown LTI link" }, { status: 404 });
  }
  if (link.tool.ltiVersion !== "1.1") {
    // A 1.3 tool needs the OIDC handshake, not a signed form POST. Autolab is
    // the only 1.3 tool in play and it has no learner launch worth wiring, so
    // this is a clear error rather than a silent wrong-protocol attempt.
    return NextResponse.json(
      { error: `Tool ${link.tool.name} is LTI ${link.tool.ltiVersion}; only 1.1 launches are implemented` },
      { status: 501 }
    );
  }

  const user = await getLaunchingUser();
  const result = await upsertResultForLaunch(link.id, user.id);
  const context = await getLessonContext(link.lessonId);
  const baseUrl = await platformBaseUrl();

  const launchParams = buildLaunchParams({
    link,
    user,
    sourcedid: result.sourcedid,
    context,
    platformBaseUrl: baseUrl,
  });

  return new NextResponse(renderAutoSubmitForm(link.tool.launchUrl, launchParams), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      // This document exists to be framed by our own lesson page.
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
