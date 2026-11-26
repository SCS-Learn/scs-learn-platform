import { pathToFileURL } from "node:url";
import { report, reportError } from "./cli.mjs";
import { fail, pin, sha256 } from "./content.mjs";
import { createBundle, writeBundle } from "./files.mjs";

export const fixturePin = "BUNDLE_SMOKE@v1";
// Each fixture generation is its own course. A generation that has learner
// attempts is kept as history; the next one is BUNDLE_SMOKE_2, _3 and so on.
const FIXTURE_COURSE = /^BUNDLE_SMOKE(?:_([2-9]|[1-9][0-9]+))?$/;

export function syntheticBundle(identifier = fixturePin) {
  const { course, version } = pin(identifier);
  const generation = course.match(FIXTURE_COURSE);
  if (!generation) fail("Synthetic fixtures use BUNDLE_SMOKE or BUNDLE_SMOKE_<generation>");
  const title = generation[1] ? `Synthetic Bundle Smoke ${generation[1]}` : "Synthetic Bundle Smoke";
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAIAAADBrGu+AAAAVUlEQVR42u3XoQ0AIAwEQMZgM7ZiUDwaFiiqBsIlL1/01KdlzBWmth7mtn4BAAAAAEgBXjn01AcAAAAAyAEsMQAAAIB/wBIDAAAA+AcsMQAAAMCXgA2JSUgeOQzeqwAAAABJRU5ErkJggg==",
    "base64",
  );
  const url = `bundle-media:${sha256(image)}`;
  const lesson = {
    unit_id: "u1", is_published: true, category: null,
    show_reference_answers: false, quiz_completion_threshold: 80,
  };
  const graph = {
    course: { code: course, title, department: "SCS", track: "Test" },
    units: [{ id: "u1", code: "TEST", title: "Fixture Unit", position: 1 }],
    lessons: [
      { ...lesson, id: "l1", code: "TOPIC", title: "Synthetic Topic", type: "lesson", position: 1, content_source: "html",
        content_html: `<p>Read the synthetic lesson.</p><img src="${url}" alt="Synthetic checkerboard" />` },
      { ...lesson, id: "l2", code: "ASSESSMENT", title: "Synthetic Assessment", type: "quiz", position: 2, content_source: "blocks", content_html: "" },
    ],
    question_groups: [{ id: "g1", lesson_id: "l2", title: "Fixture Quiz", position: 1 }],
    lesson_blocks: [{
      id: "b1", lesson_id: "l2", kind: "question_group", position: 1, title: "Fixture Quiz",
      render_mode: null, body_html: null, rendered_image_urls: null, video_url: null, question_group_id: "g1",
    }],
    attachments: [{
      id: "a1", lesson_id: "l1", lesson_block_id: null, name: "checkerboard.png", url,
      content_type: "image/png", size_bytes: image.length, position: 1,
    }],
    questions: [{
      id: "q1", question_group_id: "g1", position: 1, prompt_text: "What is 2 + 2?",
      prompt_source: "verbatim_extracted", choices: ["3", "4", "5"], answer_key: "4",
      question_type: "multiple_choice", points: 1, source_slide_or_page_index: null, needs_review: false, variants: [],
    }],
  };
  return createBundle(`${course}@${version}`, graph, [{ bytes: image, type: "image/png" }], []);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  async function main() {
    const [out, identifier = fixturePin, ...extra] = process.argv.slice(2);
    if (!out || extra.length) throw new Error("Provide one absolute output directory and an optional BUNDLE_SMOKE[_<n>]@version");
    const bundle = syntheticBundle(identifier);
    await writeBundle(out, bundle);
    report({ ...bundle.manifest, sha256: bundle.digest });
  }
  main().catch(reportError);
}
