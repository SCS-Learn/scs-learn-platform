import Anthropic from "@anthropic-ai/sdk";

export type DriveFileAnalysis = {
  title: string;
  type: "lesson" | "quiz";
  topicSummary: string;
  contentHtml: string;
};

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    type: { type: "string", enum: ["lesson", "quiz"] },
    topicSummary: { type: "string" },
    contentHtml: { type: "string" },
  },
  required: ["title", "type", "topicSummary", "contentHtml"],
  additionalProperties: false,
};

/**
 * Reads an actual PDF (native or Drive-exported) and reports what it really
 * is - title and lesson/quiz type derived from content, not the filename,
 * plus a topic summary used downstream to group files into units by what
 * they're actually about. Sonnet, not Haiku: this is reading and
 * synthesizing, not just sorting.
 */
export async function analyzeDriveFileContent(
  course: { title: string; department: string },
  pdfBase64: string
): Promise<DriveFileAnalysis | null> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    output_config: { format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          {
            type: "text",
            text: `This PDF is one file from the Drive folder for the course "${course.title}" (${course.department}). Read it and report on what it actually is:

- "title": a short, specific, descriptive title for this as a course lesson or quiz - based on what it actually covers, not the filename.
- "type": "quiz" if it's a quiz/test/assessment (questions the student answers), otherwise "lesson" (lecture/reading/slides/reference material).
- "topicSummary": one concrete sentence naming the specific topic(s) it covers - this gets used afterward to group it with other files on the same topic, so be specific (e.g. "Needleman-Wunsch global alignment and traceback", not "alignment basics").
- "contentHtml": clean, well-formatted HTML transcribing and organizing the substance of what's on the pages - the key concepts, definitions, examples, formulas, or code shown. Use semantic HTML matching a rich-text editor's output: <h3> for subheadings, <p> for prose, <ul>/<ol>/<li> for lists, <pre><code> for code or formulas, <strong>/<em> for emphasis. No <html>/<head>/<body> tags - just the inner fragment. If it's a quiz, summarize what it covers and the question format instead of restating every question verbatim.`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  return JSON.parse(textBlock.text) as DriveFileAnalysis;
}
