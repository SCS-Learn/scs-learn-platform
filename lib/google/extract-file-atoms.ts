import Anthropic from "@anthropic-ai/sdk";
import type { DriveImage } from "@/lib/google/extract-drive-images";
import { buildSourceContentBlock, type FileContentSource } from "@/lib/google/file-content-source";

export type AtomModality =
  | "text"
  | "figure"
  | "equation"
  | "table"
  | "code"
  | "question"
  | "transcript"
  | "dataset"
  | "video"
  | "audio";

/** One atomic unit of pedagogical content - a single concept, definition, example, or asset, not a whole file or section. */
export type Atom = {
  id: string;
  title: string;
  section: string;
  modality: AtomModality;
  role: string;
  content: string;
  verbatim: boolean;
  assetImageIndex: number | null;
  altText: string | null;
  latex: string | null;
  concepts: string[];
  prerequisites: string[];
  dependsOn: string[];
  question: string | null;
  confidence: number;
  flags: string[];
  notes: string | null;
};

const ATOM_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    section: { type: "string" },
    modality: {
      type: "string",
      enum: ["text", "figure", "equation", "table", "code", "question", "transcript", "dataset", "video", "audio"],
    },
    role: { type: "string" },
    content: { type: "string" },
    verbatim: { type: "boolean" },
    assetImageIndex: { type: ["integer", "null"] },
    altText: { type: ["string", "null"] },
    latex: { type: ["string", "null"] },
    concepts: { type: "array", items: { type: "string" } },
    prerequisites: { type: "array", items: { type: "string" } },
    dependsOn: { type: "array", items: { type: "string" } },
    question: { type: ["string", "null"] },
    confidence: { type: "number" },
    flags: { type: "array", items: { type: "string" } },
    notes: { type: ["string", "null"] },
  },
  required: [
    "id",
    "title",
    "section",
    "modality",
    "role",
    "content",
    "verbatim",
    "assetImageIndex",
    "altText",
    "latex",
    "concepts",
    "prerequisites",
    "dependsOn",
    "question",
    "confidence",
    "flags",
    "notes",
  ],
  additionalProperties: false,
};

const ATOMS_SCHEMA = {
  type: "object",
  properties: {
    atoms: { type: "array", items: ATOM_SCHEMA },
  },
  required: ["atoms"],
  additionalProperties: false,
};

const MAX_IMAGES = 12;

/**
 * Reads a file and decomposes it into atoms - one per concept, definition,
 * theorem, worked example, figure, equation, question, etc. This is a
 * dedicated call (separate from analyzeDriveFileContent's whole-file
 * title/contentHtml summary) so the model's only job here is fine-grained
 * decomposition; asking for both in one call biases it toward a handful of
 * large section-sized chunks instead of many small concept-sized ones.
 */
export async function extractFileAtoms(
  course: { title: string; department: string },
  source: FileContentSource,
  images: DriveImage[] = []
): Promise<Atom[]> {
  const client = new Anthropic();

  const cappedImages = images.slice(0, MAX_IMAGES);
  const imageBlocks = cappedImages.flatMap((image, index) => [
    { type: "text" as const, text: `Image ${index}:` },
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: image.contentType as "image/png" | "image/jpeg" | "image/gif",
        data: image.data.toString("base64"),
      },
    },
  ]);

  const imageInstructions =
    cappedImages.length > 0
      ? ` This file also has ${cappedImages.length} embedded image(s) attached below, labeled "Image 0", "Image 1", etc. Give a genuinely meaningful one (a chart, diagram, plot, screenshot, or illustrative photo) its own "figure" atom with "assetImageIndex" set to that image's number; skip images that are just logos, decorative icons, slide backgrounds, or bullet graphics.`
      : ` No images were extracted for this file (or this batch of it) - even if the text describes, references, or clearly implies a chart/diagram/photo, you have nothing to actually show, so do NOT create a "figure" atom or set "assetImageIndex" for it. Instead fold what the text says about it into a "text" atom describing what it depicts, in prose.`;

  // A 48000 max_tokens request is large enough that the SDK refuses it
  // outright without streaming ("Streaming is required for operations that
  // may take longer than 10 minutes") - stream() sidesteps that, and
  // finalMessage() still hands back the same accumulated Message shape
  // create() would have.
  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 48000,
    output_config: { format: { type: "json_schema", schema: ATOMS_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          buildSourceContentBlock(source),
          ...imageBlocks,
          {
            type: "text",
            text: `This is one file from the Drive folder for the course "${course.title}" (${course.department}). Decompose its actual substance into atoms.

An atom is ONE idea: a single definition, a single theorem or claim, a single explanation of one mechanism, a single worked example, a single figure, a single equation, a single table, a single code snippet, a single question (including rhetorical ones). Never bundle multiple distinct ideas, multiple examples, or multiple definitions into one atom - if you notice "content" covering more than one idea, split it into separate atoms instead. A substantive lecture file should decompose into many atoms (easily dozens for a full lecture) - a handful of large atoms means you decomposed too coarsely. Skip pure boilerplate (page numbers, running headers, slide-deck chrome, title-slide decoration).

If this file is unusually large or dense, you have a limited output budget - when you have to choose, protect coverage of every genuinely meaningful "figure" / "equation" / "table" / "code" / "video" / "audio" atom first (these make the course visually rich and engaging, and are otherwise lost entirely), and let plain "text" atoms be coarser (combine closely related sentences into one explanation atom) rather than dropping non-text atoms to fit more prose. Never skip a real figure/diagram/chart to make room for finer-grained text.

You see the whole file at once, so use that: write each section as a small, deliberate arc, not a bag of disconnected facts. Before you emit a section's atoms, work out what that section is actually FOR - what question it answers or problem it solves - and let that shape the atoms: open with a "motivation" atom (why this matters / what problem it addresses / what came before that makes it necessary) when the source material implies one even if it doesn't say so explicitly, develop the idea through definition/theorem/explanation/worked_example atoms that explicitly reference each other in prose ("building on the recurrence above...", "this is exactly why the greedy approach above fails..."), and close with a brief "synthesis" atom when the section reaches a real conclusion or trade-off worth naming. A page where every atom could be read in isolation with no sense of what came before or why it's there has failed - a reader moving through a section's atoms in order should feel a throughline, the way a good lecturer builds an argument, not a slide-by-slide trivia dump.

For each atom report:
- "id": a short id unique within this file's atoms, e.g. "a1", "a2", in reading order.
- "title": a short (3-8 word) human-readable label for this specific atom, e.g. "Needleman-Wunsch recurrence definition" or "Figure: dot-plot of two similar sequences" - specific enough to identify this one atom at a glance, never a restatement of the file's overall topic.
- "section": the title of the slide, or the subsection heading, this atom visually belongs to in the source material (e.g. an actual slide's title, or a document's subsection heading) - use the EXACT SAME string, verbatim, for every atom that comes from that same slide/subsection, so they can be grouped back onto one page together. Give every distinct slide/subsection its own specific title (not "Slide 1", "Slide 2" - the real heading or, if a slide has no heading, a short descriptive title for what's on it). A single slide/subsection should rarely span more than a handful of atoms - if you find yourself reusing the same "section" across dozens of atoms, you're grouping too coarsely; split it into the sub-topics actually on the page instead.
- "modality": exactly one of "text" | "figure" | "equation" | "table" | "code" | "question" | "transcript" | "dataset" | "video" | "audio" - what kind of content this atom carries, not how it's styled.
- "role": the pedagogical job this atom does - e.g. "motivation", "definition", "theorem", "explanation", "worked_example", "synthesis", "logistics", "decorative" - not a restatement of the modality. Use "motivation" and "synthesis" deliberately (see above) to give a section real shape instead of a flat list of same-weight facts.
- "content": a full, clear explanation of this single idea, written the way a good instructor would actually teach it - expand abbreviations and shorthand, spell out what a formula or diagram means, add the "why" or "how" when the source implies but doesn't state it, and connect it to the surrounding context. Explicitly reference the atom(s) it builds on by name/idea when there's a real connection ("because X above only works when...", "extending the definition above to..."), rather than restating it as a standalone fact. For a "definition" / "theorem" / "explanation" / "worked_example" atom, several sentences (a real paragraph) is expected and encouraged - a terse one-liner under-serves the student even if the source itself was terse. Stay strictly word-for-word only when "verbatim" is true (an exact quiz question, a precise formal definition that must not be paraphrased); otherwise this is your own elaborated explanation, not a copy. Still cover exactly ONE idea - elaborate in depth and in connection to its neighbors, don't widen scope by folding in a second concept.
- "verbatim": true only when "content" must be reproduced exactly as written (a direct quote, a literal question, a precise definition that would be wrong if paraphrased) - false for the normal case of an elaborated explanation in your own words.${imageInstructions}
- "assetImageIndex": for a "figure" atom that corresponds to one of the attached Image N images, that image's number; null for every other atom, including when no images were attached at all (see above).
- "altText": short alt text when this atom is a figure/table/equation that needs one; null otherwise.
- "latex": LaTeX source when this atom is or contains an equation; null otherwise.
- "concepts": short, specific local labels for the concept(s) this atom is about (e.g. ["Needleman-Wunsch recurrence"], not ["alignment"]) - exact wording doesn't matter, it gets normalized later.
- "prerequisites": local labels for concepts a student needs before this atom makes sense; empty array if none.
- "dependsOn": ids of other atoms in this same file that this one directly builds on (e.g. a worked_example depending on the definition atom above it); empty array if standalone.
- "question": the literal question text when "modality" is "question"; null for every other modality.
- "confidence": your confidence in [0, 1] that this atom's content/role/modality are correctly extracted.
- "flags": short machine-readable flags worth a human's attention, e.g. "ocr_uncertain", "ambiguous_role", "possible_duplicate"; empty array if none.
- "notes": a short free-text note for a human reviewer when this atom needs context; null otherwise.`,
          },
        ],
      },
    ],
  }, { timeout: 5 * 60 * 1000 }); // one file's worth of atoms shouldn't legitimately take longer than this - if it does, skip it rather than block the whole import
  const response = await stream.finalMessage();

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Atom extraction returned no text content (stop_reason: ${response.stop_reason})`);
  }
  let parsed: { atoms: Atom[] };
  try {
    parsed = JSON.parse(textBlock.text) as { atoms: Atom[] };
  } catch (error) {
    // A stop_reason of "max_tokens" here means the JSON got cut off mid-array -
    // the fix is a bigger max_tokens above, not a bug in this file's content.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Atom extraction JSON parse failed (stop_reason: ${response.stop_reason}, ${textBlock.text.length} chars): ${message}`);
  }
  return parsed.atoms ?? [];
}
