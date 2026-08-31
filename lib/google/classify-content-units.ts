import Anthropic from "@anthropic-ai/sdk";

export type ContentUnitRole = "content" | "prompt" | "choices" | "answer_key" | "instructions";

/**
 * Routing only - which page/slide plays which role in a quiz/assignment file,
 * and which pages/slides belong to the same question (groupId). Deliberately
 * carries no text of its own: the actual prompt_text/choices/answer_key
 * persisted to the DB are sliced by application code out of the
 * deterministically-extracted source text this call is given, keyed by
 * these indices/labels - never retyped or paraphrased by the model. This is
 * the same "classify, don't author" boundary analyzeDriveFileContent and
 * classifyDriveImport already use, just at page/slide granularity instead of
 * whole-file.
 */
export type PageUnit = { pageIndex: number; role: ContentUnitRole; groupId: string | null };

const UNITS_SCHEMA = {
  type: "object",
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pageIndex: { type: "integer" },
          role: { type: "string", enum: ["content", "prompt", "choices", "answer_key", "instructions"] },
          groupId: { type: ["string", "null"] },
        },
        required: ["pageIndex", "role", "groupId"],
        additionalProperties: false,
      },
    },
  },
  required: ["units"],
  additionalProperties: false,
};

/**
 * Classifies each page/slide of an already quiz-typed file (analyzeDriveFileContent
 * said type: "quiz") by what role it plays, and which question it belongs to.
 * pageTexts must already be the deterministically-extracted verbatim text for
 * each page/slide (extractSlideTextFromZip or extractPdfPageText) - this call
 * only ever sees that text to route it, it does not get asked to write or
 * rephrase anything.
 */
export async function classifyFileContentUnits(
  course: { title: string; department: string },
  pageTexts: { index: number; texts: string[] }[]
): Promise<PageUnit[]> {
  if (pageTexts.length === 0) return [];

  const client = new Anthropic();

  const body = pageTexts
    .map((page) => `Page ${page.index}:\n${page.texts.length > 0 ? page.texts.join("\n") : "(no extractable text)"}`)
    .join("\n\n");

  const response = await client.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: UNITS_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `This is a quiz/assignment file from the course "${course.title}" (${course.department}). For EVERY page/slide listed below, report which role it plays - do not summarize, transcribe, or rephrase the text itself, only classify it:

- "prompt": the question's own wording/instructions for one specific question.
- "choices": multiple-choice options for one specific question (may be the same page as its prompt, or a separate page).
- "answer_key": the correct answer / solution / rubric for one specific question, when present.
- "instructions": general instructions/logistics for the whole assignment, not tied to one question (e.g. a cover page).
- "content": anything else (a reference passage, a diagram caption) that doesn't fit the above.

"groupId": a short id you invent (e.g. "q1", "q2") shared by every page/role that belongs to the SAME question - e.g. a question's prompt, its choices, and its answer key should all carry the same groupId even if they're on different pages. Use null only for "instructions" or "content" pages that aren't tied to any specific question.

Report exactly one entry per page index, covering every page listed.

Pages (verbatim source text, for routing only):
${body}`,
        },
      ],
    },
    { timeout: 2 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Content-unit classification returned no text content");
  }
  const parsed = JSON.parse(textBlock.text) as { units: PageUnit[] };
  return parsed.units ?? [];
}
