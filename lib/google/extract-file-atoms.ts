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
      : "";

  // A 48000 max_tokens request is large enough that the SDK refuses it
  // outright without streaming ("Streaming is required for operations that
  // may take longer than 10 minutes") - stream() sidesteps that, and
  // finalMessage() still hands back the same accumulated Message shape
  // create() would have.
  const stream = client.messages.stream({
    model: "claude-sonnet-5",
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

For each atom report:
- "id": a short id unique within this file's atoms, e.g. "a1", "a2", in reading order.
- "title": a short (3-8 word) human-readable label for this specific atom, e.g. "Needleman-Wunsch recurrence definition" or "Figure: dot-plot of two similar sequences" - specific enough to identify this one atom at a glance, never a restatement of the file's overall topic.
- "modality": exactly one of "text" | "figure" | "equation" | "table" | "code" | "question" | "transcript" | "dataset" | "video" | "audio" - what kind of content this atom carries, not how it's styled.
- "role": the pedagogical job this atom does - e.g. "definition", "theorem", "explanation", "worked_example", "logistics", "decorative" - not a restatement of the modality.
- "content": the instructor's exact original wording when "verbatim" is true, kept to the single idea this atom covers (typically a sentence or a few); for a non-text atom (a figure's description, a video's keyframe scene, etc.) write brief original prose describing what it conveys instead. Do not paste in multiple paragraphs or an entire section here.
- "verbatim": true only when "content" is copied exactly from the source, false otherwise.${imageInstructions}
- "assetImageIndex": for a "figure" atom that corresponds to one of the attached Image N images, that image's number; null otherwise.
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
