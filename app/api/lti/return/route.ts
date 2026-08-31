import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// launch_presentation_return_url. A tool sends the learner here when it decides
// the activity is over, sometimes with a message to display. Since the tool is
// framed inside a lesson page, the useful behavior is to tell the parent frame
// to refresh the score rather than to navigate anywhere.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const message = url.searchParams.get("lti_msg") ?? url.searchParams.get("lti_errormsg");

  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Activity complete</title></head>
<body style="font: 14px system-ui, sans-serif; color: #57534e; padding: 24px;">
  <p>${message ? String(message).replace(/[<>&"]/g, "") : "Activity complete."}</p>
  <script>
    if (window.parent !== window) {
      window.parent.postMessage({ type: "scs-learn:lti-return" }, window.location.origin);
    }
  </script>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}
