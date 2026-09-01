import { signLaunch, type OAuthParams } from "@/lib/lti/oauth1";
import {
  TOOL_CONSUMER_INSTANCE_GUID,
  TOOL_CONSUMER_INSTANCE_NAME,
  TOOL_CONSUMER_PRODUCT_FAMILY,
  TOOL_CONSUMER_VERSION,
  type LaunchingUser,
} from "@/lib/lti/config";
import type { LtiLink } from "@/lib/lti/tools";

const LEARNER_ROLE = "urn:lti:role:ims/lis/Learner";
const INSTRUCTOR_ROLE = "urn:lti:role:ims/lis/Instructor";

export type LaunchContext = {
  courseCode: string;
  courseTitle: string;
};

export function buildLaunchParams(args: {
  link: LtiLink;
  user: LaunchingUser;
  sourcedid: string;
  context: LaunchContext;
  platformBaseUrl: string;
}): OAuthParams {
  const { link, user, sourcedid, context, platformBaseUrl } = args;

  const params: OAuthParams = {
    lti_message_type: "basic-lti-launch-request",
    lti_version: "LTI-1p0",

    // Stable per link. The tool treats this as "which activity is this",
    // so it must not change when the lesson is renamed or the learner relaunches.
    resource_link_id: link.id,
    resource_link_title: link.title,

    user_id: user.id,
    roles: user.role === "Instructor" ? INSTRUCTOR_ROLE : LEARNER_ROLE,

    context_id: context.courseCode,
    context_label: context.courseCode,
    context_title: context.courseTitle,
    context_type: "CourseSection",

    tool_consumer_instance_guid: TOOL_CONSUMER_INSTANCE_GUID,
    tool_consumer_instance_name: TOOL_CONSUMER_INSTANCE_NAME,
    tool_consumer_info_product_family_code: TOOL_CONSUMER_PRODUCT_FAMILY,
    tool_consumer_info_version: TOOL_CONSUMER_VERSION,

    // The learner never leaves SCS Learn: the tool renders inside our iframe.
    launch_presentation_document_target: "iframe",
    launch_presentation_locale: "en-US",
    launch_presentation_return_url: `${platformBaseUrl}/api/lti/return`,

    // Grade passback. Omitting either of these silently turns off grading:
    // the tool has nowhere to report to and simply does not try.
    lis_result_sourcedid: sourcedid,
    lis_outcome_service_url: `${platformBaseUrl}/api/lti/outcomes`,
  };

  if (link.tool.sendLearnerIdentity) {
    params.lis_person_name_full = user.name;
    params.lis_person_contact_email_primary = user.email;
  }

  // Custom parameters arrive at the tool prefixed with custom_. Cogniterra
  // reads custom_course or custom_lesson to decide what to show.
  for (const [key, value] of Object.entries(link.customParams)) {
    params[`custom_${key}`] = String(value);
  }

  return signLaunch(link.tool.launchUrl, params, link.tool.consumerKey, link.tool.sharedSecret);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// An LTI 1.1 launch is a signed form POST, which a browser can only produce by
// submitting a form. So the iframe loads this document and it posts itself to
// the tool. The form is not rendered: on a fast connection the learner sees
// nothing, and the noscript block is the fallback for the rest.
export function renderAutoSubmitForm(launchUrl: string, params: OAuthParams): string {
  const inputs = Object.entries(params)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlAttribute(value)}">`
    )
    .join("\n    ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Opening activity</title>
  <style>
    body { margin: 0; font: 14px system-ui, sans-serif; color: #57534e;
           display: flex; align-items: center; justify-content: center; height: 100vh; }
  </style>
</head>
<body>
  <p id="status">Opening activity...</p>
  <form id="lti-launch" method="POST" action="${escapeHtmlAttribute(launchUrl)}" enctype="application/x-www-form-urlencoded">
    ${inputs}
    <noscript><button type="submit">Continue to the activity</button></noscript>
  </form>
  <script>document.getElementById("lti-launch").submit();</script>
</body>
</html>`;
}
