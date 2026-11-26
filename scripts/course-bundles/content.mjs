import { createHash } from "node:crypto";
import { isIP } from "node:net";
import sanitizeHtml from "sanitize-html";

// Bundle format requirement recorded in every manifest.
export const MIGRATION = "20261126010000";
// Destinations also need the replacement guards before any publication.
export const DESTINATION_MIGRATION = "20261126020000";
export const BUCKET = "lesson-media";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
export const DIGEST = /^[a-f0-9]{64}$/;
export const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const COURSE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const VERSION = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const MEDIA_URI = /^bundle-media:([a-f0-9]{64})$/;
const TYPES = new Map(Object.entries({
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "application/pdf": "pdf", "video/mp4": "mp4", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/wav": "wav", "text/plain": "txt",
}));

export function fail(message) { throw new Error(message); }
export function pin(value) {
  const [course, version, ...extra] = value?.split("@") ?? [];
  if (!COURSE.test(course ?? "") || !VERSION.test(version ?? "") || extra.length) {
    fail("Use an exact course@version identifier");
  }
  return { course, version };
}

export function mediaFilename(digest, type) {
  if (!DIGEST.test(digest) || !TYPES.has(type)) fail("Unsupported media checksum or MIME type");
  return `${digest}.${TYPES.get(type)}`;
}

export function mediaPath(manifest, file) {
  return `course-bundles/${manifest.course}/${manifest.version}/${file}`;
}

export const publicUrl = (origin, path) =>
  `${origin}/storage/v1/object/public/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;

const questionTypes = new Set(("multiple_choice true_false multiple_select inline_dropdown matching categorization " +
  "ordering hottext choice_grid short_answer multi_blank cloze keyword_scored numeric_tolerance matrix_whole " +
  "matrix_per_cell vector integer significant_figures number_with_units slider symbolic_expression equation_input " +
  "form_constrained_algebra antiderivative interval_set_list free_response unknown").split(" "));
const string = (value) => typeof value === "string" && !value.includes("\0");
const integer = (value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const optional = (check) => (value) => value === null || check(value);
const oneOf = (...values) => (value) => values.includes(value);
const boolean = (value) => typeof value === "boolean";
const ref = (value) => string(value) && /^[a-z][1-9][0-9]*$/.test(value);
const choices = optional((value) => object(value) || (Array.isArray(value) && value.every(string)));

export function fields(value, schema, context) {
  if (!object(value) || Object.keys(value).length !== Object.keys(schema).length) fail(`Invalid ${context} fields`);
  for (const [key, check] of Object.entries(schema)) {
    if (!Object.hasOwn(value, key) || !check(value[key])) fail(`Invalid ${context}.${key}`);
  }
}

const schemas = {
  units: { id: ref, code: string, title: string, position: integer },
  lessons: {
    id: ref, unit_id: ref, code: string, title: string, type: oneOf("lesson", "quiz"),
    position: integer, content_html: string, is_published: boolean,
    content_source: oneOf("html", "blocks"), category: oneOf(null, "assignment", "homework"),
    show_reference_answers: boolean,
    quiz_completion_threshold: (value) => integer(value) && value >= 0 && value <= 100,
  },
  question_groups: { id: ref, lesson_id: ref, title: string, position: integer },
  lesson_blocks: {
    id: ref, lesson_id: ref, position: integer, kind: oneOf("slide_file", "video", "question_group", "course_notes"),
    title: optional(string), render_mode: oneOf(null, "pdf_embed", "slide_card_images", "slide_rendered_images"),
    body_html: optional(string), rendered_image_urls: optional((value) => Array.isArray(value) && value.every(string)),
    video_url: optional(string), question_group_id: optional(ref),
  },
  attachments: {
    id: ref, lesson_id: ref, lesson_block_id: optional(ref), name: string,
    url: optional(string), content_type: optional(string),
    size_bytes: optional((value) => Number.isSafeInteger(value) && value >= 0), position: optional(integer),
  },
  questions: {
    id: ref, question_group_id: ref, position: integer, prompt_text: string,
    prompt_source: oneOf("verbatim_extracted", "llm_transcribed"), choices, answer_key: optional(string),
    question_type: (value) => questionTypes.has(value), points: (value) => integer(value) && value >= 0,
    source_slide_or_page_index: optional(integer), needs_review: boolean,
    variants: (value) => {
      if (!Array.isArray(value)) return false;
      for (const variant of value) {
        fields(variant, { prompt_text: string, choices, answer_key: optional(string) }, "variant");
      }
      return true;
    },
  },
};

const collectionPrefixes = {
  units: "u", lessons: "l", question_groups: "g", lesson_blocks: "b", attachments: "a", questions: "q",
};

export function validateGraph(graph, course) {
  fields(graph, { course: object, ...Object.fromEntries(Object.keys(schemas).map((name) => [name, Array.isArray])) }, "graph");
  fields(graph.course, { code: (code) => code === course && COURSE.test(code), title: string, department: string, track: string }, "course");

  const rows = new Map();
  for (const [name, schema] of Object.entries(schemas)) {
    const index = new Map();
    for (const row of graph[name]) {
      fields(row, schema, name);
      if (!row.id.startsWith(collectionPrefixes[name]) || index.has(row.id)) fail(`Invalid or duplicate ${name} ID`);
      index.set(row.id, row);
    }
    rows.set(name, index);
  }
  function requireRef(name, id) {
    const row = rows.get(name).get(id);
    if (!row) fail(`Missing ${name} reference ${id}`);
    return row;
  }
  for (const lesson of graph.lessons) requireRef("units", lesson.unit_id);
  for (const group of graph.question_groups) requireRef("lessons", group.lesson_id);
  for (const question of graph.questions) requireRef("question_groups", question.question_group_id);
  for (const block of graph.lesson_blocks) {
    requireRef("lessons", block.lesson_id);
    const { kind, render_mode: renderMode, video_url: video, question_group_id: group, body_html: html } = block;
    if (!(
      (kind === "slide_file" && renderMode && !video && !group) ||
      (kind === "video" && video && !renderMode && !group) ||
      (kind === "question_group" && group && !renderMode && !video) ||
      (kind === "course_notes" && html !== null && !renderMode && !video && !group)
    )) fail(`Invalid payload for block ${block.id}`);
    if (group && requireRef("question_groups", group).lesson_id !== block.lesson_id) fail("Block references another lesson's question group");
  }
  for (const attachment of graph.attachments) {
    requireRef("lessons", attachment.lesson_id);
    if (attachment.lesson_block_id && requireRef("lesson_blocks", attachment.lesson_block_id).lesson_id !== attachment.lesson_id) {
      fail("Attachment references another lesson's block");
    }
  }
}

export function portableGraph(source) {
  const ids = new Map();
  for (const name of Object.keys(schemas)) {
    if (!Array.isArray(source[name])) fail(`Missing export collection ${name}`);
    source[name].forEach((row, index) => {
      if (!UUID.test(row.id) || ids.has(row.id)) fail("Invalid or duplicate source content ID");
      ids.set(row.id, collectionPrefixes[name] + (index + 1));
    });
  }
  const graph = { course: source.course };
  for (const [name, schema] of Object.entries(schemas)) {
    graph[name] = source[name].map((row) => Object.fromEntries(
      Object.keys(schema).map((key) => [key, key === "id" || key.endsWith("_id") ? ids.get(row[key]) ?? row[key] : row[key]]),
    ));
  }
  for (const question of graph.questions) {
    if (!Array.isArray(question.variants)) fail("Invalid source question variants");
    question.variants = question.variants.map((variant) => ({
      prompt_text: variant.prompt_text ?? variant.promptText,
      choices: variant.choices ?? null,
      answer_key: variant.answer_key ?? variant.answerKey ?? null,
    }));
  }
  // Retain existing positions where they distinguish siblings. Give ties and
  // legacy unpositioned attachments the order returned by the source query.
  for (const [name, parentKey] of Object.entries({
    units: null, lessons: "unit_id", question_groups: "lesson_id",
    lesson_blocks: "lesson_id", attachments: "lesson_id", questions: "question_group_id",
  })) {
    const siblings = Map.groupBy(graph[name], (row) => row[parentKey]);
    for (const rows of siblings.values()) {
      const positions = new Set(rows.map((row) => row.position));
      if (positions.has(null) || positions.size !== rows.length) rows.forEach((row, index) => { row.position = index + 1; });
    }
  }
  return graph;
}

// Inspect HTML attributes and plain text separately, including media inside
// structured question choices and variants. Reject reference formats that
// cannot be transported and reviewed unambiguously.
export function rewriteContent(graph, replace, rewriteAttachment) {
  function text(value) {
    if (/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|sb_(?:secret|publishable)_[\w-]+|eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(value)) {
      fail("Potential identity or credential in course content");
    }
    if (/(?:data:(?:image|audio|video|application)\/|blob:(?:https?:|null\/))/i.test(value)) {
      fail("Inline media must be moved to approved Storage before export");
    }
    if (/\/(?:storage\/v1\/|rest\/v1\/)/i.test(value.replace(/(?:https?:)?\/\/[^\s<>"']+/gi, ""))) {
      fail("Relative Supabase URLs need a portable replacement");
    }
    return value.replace(/(?:https?:\/\/|(?<!:)\/\/|bundle-media:)[^\s<>"'()`\[\]]+/gi, (match) => {
      const suffix = match.match(/[.,;!?]+$/)?.[0] ?? "";
      return replace(suffix ? match.slice(0, -suffix.length) : match) + suffix;
    });
  }
  function html(value) {
    return sanitizeHtml(value, {
      allowedTags: false,
      allowedAttributes: false,
      allowVulnerableTags: true,
      textFilter: text,
      transformTags: {
        "*": (tagName, attributes) => {
          if (/^(?:script|style|base|meta|link|object|embed|svg|math|form|template)$/i.test(tagName)) {
            fail("Unsupported active markup in course content");
          }
          for (const [name, value] of Object.entries(attributes)) {
            if (/^(?:on|srcdoc|action|formaction|ping|xlink:)/i.test(name) ||
                (name === "style" && /[\\@]|(?:url|expression|image-set)\s*\(|\/\*/i.test(value))) {
              fail("Unsupported active attribute in course content");
            }
            if (name === "srcset") {
              attributes[name] = value.split(",").map((entry) => {
                const [url, descriptor, ...extra] = entry.trim().split(/\s+/);
                if (!url || extra.length || (descriptor && !/^(?:\d+w|\d+(?:\.\d+)?x)$/.test(descriptor))) {
                  fail("Unsupported srcset entry");
                }
                return [replace(url), descriptor].filter(Boolean).join(" ");
              }).join(", ");
            } else if (/^(src|href|poster|data|background|cite|longdesc|data-video-src)$/.test(name)) {
              attributes[name] = name === "href" && /^#[a-z0-9_.:-]*$/i.test(value) ? value : replace(value);
            } else {
              attributes[name] = text(value);
            }
          }
          return { tagName, attribs: attributes };
        },
      },
      allowedSchemes: ["http", "https", "bundle-media"],
    });
  }
  function visit(value, key) {
    if (Array.isArray(value)) {
      return key === "rendered_image_urls" ? value.map(replace) : value.map((item) => visit(item));
    }
    if (object(value)) {
      return Object.fromEntries(Object.entries(value).map(([name, item]) => {
        if (/^(?:email|access_token|refresh_token|platform_user_id|auth_user_id|password|secret|credentials)$/i.test(name)) {
          fail("Potential identity or credential field in course content");
        }
        return [text(name), visit(item, name)];
      }));
    }
    if (!string(value)) return value;
    if (key === "content_html" || key === "body_html") return html(value);
    if (key === "video_url" || key === "url") return replace(value);
    return text(value);
  }
  const result = visit(graph);
  result.attachments = result.attachments.map(rewriteAttachment);
  return result;
}

export function externalUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { fail("Unsupported relative, inline, or malformed media/link URL"); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") ||
      isIP(url.hostname) || /\.(?:local|localhost|internal|test|invalid)\.?$/i.test(url.hostname) ||
      /\/storage\/v1\/|\.supabase\.(?:co|in)(?:$|\/)|\/rest\/v1\//i.test(url.href) ||
      [...url.searchParams.keys()].some((key) => !/^(?:v|t|start|end|rel|autoplay|list|index|hl|lang)$/i.test(key)) ||
      /(?:private|token|password|secret|credential|session|signature)[=_-]/i.test(url.href) ||
      /@|%40/i.test(url.href)) {
    fail("External link needs an approved public HTTPS URL without private identifiers or credentials");
  }
  return url.href;
}

export function verifyContent(manifest, graph) {
  validateGraph(graph, manifest.course);
  const media = new Map(manifest.media.map((item) => [item.sha256, item]));
  const required = new Set();
  const external = new Set();
  rewriteContent(graph, (value) => {
    const match = value.match(MEDIA_URI);
    if (!match) {
      external.add(externalUrl(value));
      return value;
    }
    if (!media.has(match[1])) fail("Bundle references missing media");
    required.add(match[1]);
    return value;
  }, (attachment) => {
    const digest = attachment.url?.match(MEDIA_URI)?.[1];
    if (digest) {
      const item = media.get(digest);
      if (attachment.size_bytes !== item.size || attachment.content_type !== item.type) {
        fail("Attachment metadata differs from its media entry");
      }
    }
    return attachment;
  });
  if (required.size !== media.size) fail("Bundle carries unreferenced media");
  if (JSON.stringify([...external].sort()) !== JSON.stringify(manifest.externalUrls)) {
    fail("External URLs differ from the review inventory");
  }
}

export function preparePublication(bundle, origin) {
  const { manifest, graph } = bundle;
  const media = new Map(manifest.media.map((item) => [item.sha256, mediaPath(manifest, item.file)]));
  const paths = new Map([...media.values()].map((path) => [publicUrl(origin, path), path]));
  const content = rewriteContent(graph, (value) => {
    const match = value.match(MEDIA_URI);
    return match ? publicUrl(origin, media.get(match[1])) : value;
  }, (attachment) => ({ ...attachment, storage_path: paths.get(attachment.url) ?? null }));
  const ids = new Map(Object.keys(schemas).flatMap((name) => content[name].map(({ id }) => {
    const hex = sha256(JSON.stringify([manifest.course, manifest.version, id])).slice(0, 32);
    return [id, `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`];
  })));
  for (const name of Object.keys(schemas)) {
    content[name] = content[name].map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, key === "id" || key.endsWith("_id") ? ids.get(value) ?? null : value]),
    ));
  }
  return { content, paths: [...media.values()] };
}
