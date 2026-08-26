import Anthropic from "@anthropic-ai/sdk";
import { buildSourceContentBlock, type FileContentSource } from "@/lib/google/file-content-source";

export type DriveFileAnalysis = {
  title: string;
  type: "lesson" | "quiz";
  topicSummary: string;
};

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    type: { type: "string", enum: ["lesson", "quiz"] },
    topicSummary: { type: "string" },
  },
  required: ["title", "type", "topicSummary"],
  additionalProperties: false,
};

/**
 * Reads an actual PDF (native or Drive-exported) and reports what it really
 * is - title and lesson/quiz type derived from content, not the filename,
 * plus a topic summary used downstream to group files into units by what
 * they're actually about. This is metadata only: the file's actual rendered
 * content comes from extractFileAtoms's fine-grained atoms instead, so this
 * call doesn't transcribe or embed anything itself.
 */
export async function analyzeDriveFileContent(
  course: { title: string; department: string },
  source: FileContentSource
): Promise<DriveFileAnalysis | null> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          buildSourceContentBlock(source),
          {
            type: "text",
            text: `This is one file from the Drive folder for the course "${course.title}" (${course.department}). Read it and report on what it actually is:

- "title": a short, specific, descriptive title for this as a course lesson or quiz - based on what it actually covers, not the filename.
- "type": "quiz" if it's a quiz/test/assessment (questions the student answers), otherwise "lesson" (lecture/reading/slides/reference material).
- "topicSummary": one concrete sentence naming the specific topic(s) it covers - this gets used afterward to group it with other files on the same topic, so be specific (e.g. "Needleman-Wunsch global alignment and traceback", not "alignment basics").`,
          },
        ],
      },
    ],
  }, { timeout: 3 * 60 * 1000 }); // shouldn't legitimately take longer than this - if it does, fall back to a filename-only lesson rather than block the whole import

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  return JSON.parse(textBlock.text) as DriveFileAnalysis;
}
