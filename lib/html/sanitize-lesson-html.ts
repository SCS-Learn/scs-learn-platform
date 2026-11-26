import sanitizeHtml from "sanitize-html";

/**
 * Lesson HTML (lessons.content_html, lesson_blocks.body_html) comes from the
 * tiptap editor, the Drive import and the AI organizer, and is rendered with
 * dangerouslySetInnerHTML. Run it through here on the server before it
 * reaches any client component, so stored markup can't run script in a
 * viewer's browser, whoever wrote it.
 *
 * The allowlist covers what the editor (components/tiptap-templates/simple)
 * and the importers (lib/google/render-*.ts) emit: formatting, lists, task
 * lists, tables, images, links, code, math and video placeholders (data-*
 * attributes), and inline styles for alignment and highlight colors. Script,
 * event handlers, javascript: URLs, forms, embeds and <style> are removed.
 */

// Inline style values: no url(), expressions or anything that could close the
// declaration.
const STYLE_VALUE = [/^(?!.*(?:url|expression|image-set)\s*\()[^;{}<>\\]*$/i];

const ALLOWED_STYLE_PROPERTIES = [
  "color",
  "background-color",
  "text-align",
  "text-decoration",
  "font-weight",
  "font-style",
  "vertical-align",
  "float",
  "display",
  "width",
  "min-width",
  "max-width",
  "height",
  "max-height",
  "margin",
  "margin-left",
  "margin-right",
  "margin-top",
  "margin-bottom",
  "padding",
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
  "border",
  "border-collapse",
  "list-style-type",
  "white-space",
];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "del",
    "ins",
    "details",
    "summary",
    "label",
    "input",
    "video",
    "source",
    "iframe",
  ],
  allowedAttributes: {
    "*": ["class", "style", "title", "dir", "lang", "data-*", "aria-*"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "srcset", "alt", "width", "height", "loading"],
    ol: ["start", "type", "reversed"],
    td: ["colspan", "rowspan", "colwidth", "scope"],
    th: ["colspan", "rowspan", "colwidth", "scope"],
    col: ["span", "width"],
    input: ["type", "checked", "disabled"],
    video: ["src", "controls", "poster", "width", "height"],
    source: ["src", "type"],
    iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder"],
  },
  allowedStyles: {
    "*": Object.fromEntries(ALLOWED_STYLE_PROPERTIES.map((property) => [property, STYLE_VALUE])),
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  // Only video players; anything else framed inside a lesson is dropped.
  allowedIframeHostnames: [
    "www.youtube.com",
    "www.youtube-nocookie.com",
    "player.vimeo.com",
    "drive.google.com",
    "docs.google.com",
  ],
  transformTags: {
    // Task-list checkboxes are the only inputs lesson content needs.
    input: (tagName, attribs) =>
      attribs.type === "checkbox"
        ? {
            tagName,
            attribs: {
              type: "checkbox",
              disabled: "",
              ...("checked" in attribs ? { checked: "" } : {}),
            },
          }
        : { tagName: "span", attribs: {} },
    a: (tagName, attribs) =>
      attribs.target === "_blank"
        ? { tagName, attribs: { ...attribs, rel: "noopener noreferrer" } }
        : { tagName, attribs },
    // Video players get a fixed set of permissions (no camera, microphone or
    // clipboard), whatever the stored markup asks for.
    iframe: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, allow: "fullscreen; picture-in-picture; encrypted-media" },
    }),
  },
};

export function sanitizeLessonHtml(html: string): string;
export function sanitizeLessonHtml(html: string | null): string | null;
export function sanitizeLessonHtml(html: string | null): string | null {
  if (!html) return html;
  return sanitizeHtml(html, OPTIONS);
}
