import Anthropic from "@anthropic-ai/sdk";
import type { DriveImage } from "@/lib/google/extract-drive-images";

export type DriveFileAnalysis = {
  title: string;
  type: "lesson" | "quiz";
  topicSummary: string;
  contentHtml: string;
  figures: { imageIndex: number; caption: string }[];
};

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    type: { type: "string", enum: ["lesson", "quiz"] },
    topicSummary: { type: "string" },
    contentHtml: { type: "string" },
    figures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          imageIndex: { type: "integer" },
          caption: { type: "string" },
        },
        required: ["imageIndex", "caption"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "type", "topicSummary", "contentHtml", "figures"],
  additionalProperties: false,
};

const MAX_IMAGES = 12;

/**
 * Reads an actual PDF (native or Drive-exported) and reports what it really
 * is - title and lesson/quiz type derived from content, not the filename,
 * plus a topic summary used downstream to group files into units by what
 * they're actually about. Sonnet, not Haiku: this is reading and
 * synthesizing, not just sorting.
 *
 * Also hands it the file's embedded images (extracted separately from the
 * OOXML export, since the PDF export flattens them) so it can pick out real
 * figures - charts, diagrams, screenshots - worth showing the student, embed
 * them inline, and skip decorative ones (logos, bullet icons, backgrounds).
 */
export async function analyzeDriveFileContent(
  course: { title: string; department: string },
  pdfBase64: string,
  images: DriveImage[] = []
): Promise<DriveFileAnalysis | null> {
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

  const figureInstructions =
    cappedImages.length > 0
      ? ` This file also has ${cappedImages.length} embedded image(s) attached below, labeled "Image 0", "Image 1", etc. Where one of them is genuinely a meaningful figure worth showing the student - a chart, diagram, plot, screenshot, or illustrative photo - embed it inline at the right point in "contentHtml" with a bare <img data-figure-index="N"> tag (N = that image's number, no src yet - that gets filled in afterward). Skip images that are just logos, decorative icons, slide backgrounds, or bullet graphics; don't force one in if none of them add anything a reader needs.`
      : "";

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    output_config: { format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          ...imageBlocks,
          {
            type: "text",
            text: `This PDF is one file from the Drive folder for the course "${course.title}" (${course.department}). Read it and report on what it actually is:

- "title": a short, specific, descriptive title for this as a course lesson or quiz - based on what it actually covers, not the filename.
- "type": "quiz" if it's a quiz/test/assessment (questions the student answers), otherwise "lesson" (lecture/reading/slides/reference material).
- "topicSummary": one concrete sentence naming the specific topic(s) it covers - this gets used afterward to group it with other files on the same topic, so be specific (e.g. "Needleman-Wunsch global alignment and traceback", not "alignment basics").
- "contentHtml": clean, well-formatted HTML transcribing and organizing the substance of what's on the pages - the key concepts, definitions, examples, formulas, or code shown. Use semantic HTML matching a rich-text editor's output: <h3> for subheadings, <p> for prose, <ul>/<ol>/<li> for lists, <pre><code> for code or formulas, <strong>/<em> for emphasis. No <html>/<head>/<body> tags - just the inner fragment. If it's a quiz, summarize what it covers and the question format instead of restating every question verbatim.${figureInstructions}
- "figures": one entry per <img data-figure-index="N"> you actually embedded in "contentHtml", each with that same "imageIndex" and a short "caption" describing what it shows. Empty array if there were no images or none were worth embedding.`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  const parsed = JSON.parse(textBlock.text) as DriveFileAnalysis;
  return { ...parsed, figures: parsed.figures ?? [] };
}
