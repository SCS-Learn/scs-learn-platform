import Anthropic from "@anthropic-ai/sdk";

export type FreeResponseGradingItem = {
  questionId: string;
  promptText: string;
  referenceAnswer: string;
  response: string;
};

export type FreeResponseGradingResult = {
  scoreFraction: number;
  feedback: string;
};

const RESULTS_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionId: { type: "string" },
          scorePercent: { type: "integer" },
          feedback: { type: "string" },
        },
        required: ["questionId", "scorePercent", "feedback"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

const GRADING_PROMPT = `You are grading student answers to open-ended quiz questions against a reference answer written by the instructor.

For each item, compare the student's response to the reference answer for its specific content and reasoning — not exact wording. Return, for every item:
- questionId: copied verbatim from the item.
- scorePercent: 0-100, how much of the reference answer's required content the response correctly captures. 100 = fully correct and complete. 0 = blank, off-topic, or entirely wrong. Use intermediate values for partially correct or incomplete answers.
- feedback: ONE short sentence (under ~20 words) addressed directly to the student, naming only the single most important thing that was wrong or missing — or, if fully correct, a brief confirmation. Never restate the question or the full reference answer, never hedge with multiple caveats, and never pad with pleasantries ("Great job!", "Good effort") beyond a terse acknowledgment.

Grade generously for phrasing, formatting, and ordering differences; grade strictly for missing or incorrect substance.`;

/** Grades a batch of free-response answers in a single call — cheaper and gives the model cross-item context. */
export async function gradeFreeResponseBatch(
  items: FreeResponseGradingItem[]
): Promise<Map<string, FreeResponseGradingResult>> {
  const results = new Map<string, FreeResponseGradingResult>();
  if (items.length === 0) return results;

  const client = new Anthropic();

  const payload = items.map((item) => ({
    questionId: item.questionId,
    question: item.promptText,
    referenceAnswer: item.referenceAnswer,
    studentResponse: item.response,
  }));

  const response = await client.messages.create(
    {
      model: "claude-opus-5",
      max_tokens: 8000,
      output_config: { format: { type: "json_schema", schema: RESULTS_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `${GRADING_PROMPT}\n\nItems to grade (JSON array):\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    },
    { timeout: 2 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `Free-response grading returned no text content (stop_reason: ${response.stop_reason ?? "unknown"})`
    );
  }

  const parsed = JSON.parse(textBlock.text) as {
    results: { questionId: string; scorePercent: number; feedback: string }[];
  };

  for (const result of parsed.results ?? []) {
    const clampedPercent = Math.max(0, Math.min(100, Math.round(result.scorePercent)));
    results.set(result.questionId, {
      scoreFraction: clampedPercent / 100,
      feedback: result.feedback?.trim() || "",
    });
  }

  return results;
}
