import Anthropic from "@anthropic-ai/sdk";
import { buildSourceContentBlock, type FileContentSource } from "@/lib/google/file-content-source";

export type DriveFileCategory =
  | "lecture"
  | "slides"
  | "homework"
  | "practice_problems"
  | "reading"
  | "reference"
  | "administrative"
  | "other";

/** category -> type is a fixed mapping, not a model judgment call - "type" only exists downstream to tell the atomizer path's lesson/quiz labeling apart, category is the real signal now. */
const CATEGORY_TO_TYPE: Record<DriveFileCategory, "lesson" | "quiz"> = {
  lecture: "lesson",
  slides: "lesson",
  homework: "quiz",
  practice_problems: "quiz",
  reading: "lesson",
  reference: "lesson",
  administrative: "lesson",
  other: "lesson",
};

export type DriveFileAnalysis = {
  title: string;
  /** Computed from "category" via CATEGORY_TO_TYPE, never asked of the model directly - kept only so the atomizer path's existing lesson/quiz labeling keeps working unchanged. */
  type: "lesson" | "quiz";
  category: DriveFileCategory;
  topicSummary: string;
  /** False when this file isn't genuine course content at all (garbled/corrupted export, random or placeholder data, an unrelated administrative document) - the organize pipeline uses this to keep junk from ever becoming a lesson. Additive: the atomizer path ignores it entirely. */
  isCourseContent: boolean;
  /** Empty when isCourseContent is true; otherwise a concrete, specific reason. */
  notCourseContentReason: string;
};

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    category: {
      type: "string",
      enum: ["lecture", "slides", "homework", "practice_problems", "reading", "reference", "administrative", "other"],
    },
    topicSummary: { type: "string" },
    isCourseContent: { type: "boolean" },
    notCourseContentReason: { type: "string" },
  },
  required: ["title", "category", "topicSummary", "isCourseContent", "notCourseContentReason"],
  additionalProperties: false,
};

/**
 * Reads an actual PDF (native or Drive-exported) and reports what it really
 * is - title and category (lecture/slides/homework/practice_problems/etc.)
 * derived from content, not the filename, plus a topic summary used
 * downstream to group files into units by what they're actually about. This
 * is metadata only, never transcription: the organize path embeds the whole
 * original file as-is, and the atomizer path's own fine-grained atoms come
 * from extractFileAtoms instead.
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
- "category": categorize what this file actually IS, by reading its real content - not the filename. Pick exactly one: "lecture" (a lecture's own slide deck or narrated content), "slides" (a slide deck that supplements a lecture rather than being the lecture itself), "homework" (a graded assignment/problem set), "practice_problems" (ungraded practice questions/exercises), "reading" (a reading/text document), "reference" (reference material - cheat sheets, primers, background notes), "administrative" (syllabus, schedule, roster, grading policy - not instructional content), or "other" (anything else).
- "topicSummary": one concrete sentence naming the specific topic(s) it covers - this gets used afterward to group it with other files on the same topic, so be specific (e.g. "Needleman-Wunsch global alignment and traceback", not "alignment basics").
- "isCourseContent": critically judge whether this is genuine instructional or assessment content for this course - a real lecture, reading, slide deck, quiz, or practice-problem set. Set this to false (and explain why in "notCourseContentReason") for anything that isn't: a garbled or corrupted export that reads as gibberish, a file that's mostly random/placeholder/lorem-ipsum-style data rather than real subject matter, an administrative document unrelated to course material (e.g. a syllabus, a grading rubric, a roster), or anything else you would not want a student to be shown as if it were real lesson content. Default to true when the file is genuinely real content, even if it's rough, incomplete, or oddly formatted - only mark it false when you're confident it isn't real course material at all.
- "notCourseContentReason": a short, concrete reason when "isCourseContent" is false (e.g. "This file is a blank grading rubric template, not lecture or assessment content"). Empty string when "isCourseContent" is true.`,
          },
        ],
      },
    ],
  }, { timeout: 3 * 60 * 1000 }); // shouldn't legitimately take longer than this - if it does, fall back to a filename-only lesson rather than block the whole import

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  const parsed = JSON.parse(textBlock.text) as Omit<DriveFileAnalysis, "type">;
  return { ...parsed, type: CATEGORY_TO_TYPE[parsed.category] };
}
