import Anthropic from "@anthropic-ai/sdk";
import type { CogniterraLesson } from "@/lib/cogniterra/client";

export type DriveAssignmentForMatch = {
  lessonId: string;
  title: string;
  topicSummary: string;
};

export type CogniterraLessonMatch = {
  lessonId: string;
  cogniterraLessonId: number;
  confidence: "high" | "medium" | "low";
};

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          lessonId: { type: "string" },
          cogniterraLessonId: { type: "integer" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["lessonId", "cogniterraLessonId", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["matches"],
  additionalProperties: false,
};

/**
 * Maps imported Drive assignment lessons to Cogniterra lesson IDs by topic and title.
 * Each Cogniterra lesson may match at most one Drive lesson.
 */
export async function matchAssignmentsToCogniterraLessons(
  assignments: DriveAssignmentForMatch[],
  cogniterraLessons: CogniterraLesson[]
): Promise<CogniterraLessonMatch[]> {
  if (assignments.length === 0 || cogniterraLessons.length === 0) {
    return [];
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    output_config: { format: { type: "json_schema", schema: MATCH_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Match each imported course assignment to the Cogniterra lesson it corresponds to.

Rules:
- Use title and topicSummary together — "HW3 on recursion" matches a Cogniterra lesson about recursion.
- Respect pedagogical order when titles are vague: earlier assignments tend to match earlier Cogniterra lessons.
- Each cogniterraLessonId may appear at most once.
- Skip assignments with no reasonable match rather than forcing a bad one.
- confidence "high" when title/topic clearly align; "medium" when plausible; "low" when uncertain.

Drive assignments (JSON):
${JSON.stringify(assignments, null, 2)}

Cogniterra lessons (JSON):
${JSON.stringify(cogniterraLessons, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return [];
  }

  const parsed = JSON.parse(textBlock.text) as { matches: CogniterraLessonMatch[] };
  const usedCogniterraIds = new Set<number>();
  const validLessonIds = new Set(assignments.map((a) => a.lessonId));
  const validCogniterraIds = new Set(cogniterraLessons.map((l) => l.id));

  return (parsed.matches ?? []).filter((match) => {
    if (!validLessonIds.has(match.lessonId)) return false;
    if (!validCogniterraIds.has(match.cogniterraLessonId)) return false;
    if (usedCogniterraIds.has(match.cogniterraLessonId)) return false;
    usedCogniterraIds.add(match.cogniterraLessonId);
    return true;
  });
}
