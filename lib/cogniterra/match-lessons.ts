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

// --- Gap-fill placement (no Drive-derived assignment file involved) --------
//
// The matcher above only ever runs against lessons that already exist because
// a Drive file was present and classified as an ungradable assignment. A
// Cogniterra course's own lesson list is frequently richer than that (e.g. a
// Drive folder of pure lecture slides with no assignment files at all, or a
// Cogniterra course with lessons nobody bothered to mirror in Drive) — this
// half places EVERY Cogniterra lesson that isn't already wired to something
// directly into the course's existing unit structure by topic, the same way
// placeYoutubeVideos places playlist videos with no per-video Drive mapping.

export type CogniterraExistingUnit = { id: string; title: string };
export type CogniterraNewUnit = { key: string; title: string };
export type CogniterraLessonPlacement = {
  cogniterraLessonId: number;
  /** An existing unit's id, or one of the declared newUnits[].key values. */
  unitRef: string;
};
export type CogniterraPlacementResult = {
  newUnits: CogniterraNewUnit[];
  placements: CogniterraLessonPlacement[];
};

/** Cogniterra lessons per Opus call — mirrors GROUP_SIZE in place-youtube-videos.ts. */
const PLACEMENT_GROUP_SIZE = 25;

const PLACEMENT_SCHEMA = {
  type: "object",
  properties: {
    newUnits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
        },
        required: ["key", "title"],
        additionalProperties: false,
      },
    },
    placements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cogniterraLessonId: { type: "integer" },
          unitRef: { type: "string" },
        },
        required: ["cogniterraLessonId", "unitRef"],
        additionalProperties: false,
      },
    },
  },
  required: ["newUnits", "placements"],
  additionalProperties: false,
} as const;

function placementPrompt(): string {
  return `You are placing a coding-platform's graded assignments into a course's existing structure of units, by topic. Each assignment already lives on an external platform (Cogniterra) — you are only deciding which unit of THIS course it reinforces, not creating any content for it.

The existing units below each have a stable "id". Reference an existing unit ONLY by copying its id verbatim — never by retyping its title. If no existing unit fits, declare a new one in "newUnits" — but treat that as a last resort: assignments almost always reinforce material the course already covers, so a new unit should be rare, only for an assignment on a topic truly absent from the existing units.

Step 1 — declare new units, only for units that don't already exist among the given ids. For each one, add ONE entry to "newUnits": key (a short id you invent, e.g. "n1", unique among your own newUnits), title. If two or more assignments belong in the same new unit, declare it ONCE and reuse that key.

Step 2 — for each Cogniterra lesson that is clearly a graded assignment belonging in this course, add ONE entry to "placements": cogniterraLessonId (copied verbatim), unitRef (an existing unit id copied verbatim, or one of your own newUnits keys).

Rules:
- Judge fit by actual subject matter, not literal wording — an assignment's title rarely matches a unit title verbatim, so infer the underlying topic from numbering, keyword overlap, and general subject-matter closeness.
- Use the given lesson order as a mild pedagogical hint (earlier assignments tend to fit earlier units) when the title alone is ambiguous.
- Skip a lesson entirely rather than forcing a bad fit, and skip anything that reads as a syllabus/intro/administrative page rather than a real assignment.
- Each cogniterraLessonId is placed at most once.
- Empty "placements" (and "newUnits") is correct if nothing here belongs in this course.`;
}

async function placeCogniterraLessonGroup(
  course: { title: string; department: string },
  groupLessons: CogniterraLesson[],
  existingUnits: CogniterraExistingUnit[]
): Promise<CogniterraPlacementResult> {
  const client = new Anthropic();

  const response = await client.messages.create(
    {
      model: "claude-opus-5",
      max_tokens: 8000,
      output_config: { format: { type: "json_schema", schema: PLACEMENT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `${placementPrompt()}\n\nCourse: "${course.title}" (${course.department})\n\nExisting units (JSON):\n${JSON.stringify(existingUnits, null, 2)}\n\nCogniterra lessons to place (JSON):\n${JSON.stringify(groupLessons, null, 2)}`,
        },
      ],
    },
    { timeout: 3 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `Cogniterra lesson placement returned no text content (stop_reason: ${response.stop_reason ?? "unknown"})`
    );
  }

  const raw = JSON.parse(textBlock.text) as {
    newUnits?: { key: string; title: string }[];
    placements?: { cogniterraLessonId: number; unitRef: string }[];
  };

  const existingUnitIds = new Set(existingUnits.map((u) => u.id));
  const newUnits: CogniterraNewUnit[] = [];
  const seenNewUnitKeys = new Set<string>();
  for (const nu of raw.newUnits ?? []) {
    if (!nu || typeof nu.key !== "string" || !nu.key || typeof nu.title !== "string" || !nu.title.trim()) continue;
    if (existingUnitIds.has(nu.key) || seenNewUnitKeys.has(nu.key)) continue;
    seenNewUnitKeys.add(nu.key);
    newUnits.push({ key: nu.key, title: nu.title.trim() });
  }
  const validUnitRefs = new Set([...existingUnitIds, ...newUnits.map((u) => u.key)]);

  const validLessonIds = new Set(groupLessons.map((l) => l.id));
  const usedLessonIds = new Set<number>();
  const placements: CogniterraLessonPlacement[] = [];
  for (const p of raw.placements ?? []) {
    if (!p || typeof p.cogniterraLessonId !== "number" || typeof p.unitRef !== "string") continue;
    if (!validLessonIds.has(p.cogniterraLessonId) || usedLessonIds.has(p.cogniterraLessonId)) continue;
    if (!validUnitRefs.has(p.unitRef)) continue;
    usedLessonIds.add(p.cogniterraLessonId);
    placements.push({ cogniterraLessonId: p.cogniterraLessonId, unitRef: p.unitRef });
  }

  return { newUnits, placements };
}

/**
 * Places every not-yet-wired Cogniterra lesson into the course's existing
 * unit structure by topic (creating new units only when nothing fits),
 * without requiring any corresponding Drive file. Processes lessons in small
 * groups sequentially, feeding each group's confirmed new units forward as
 * "existing" context for the next — same rationale as placeYoutubeVideos.
 */
export async function placeCogniterraLessons(
  course: { title: string; department: string },
  cogniterraLessons: CogniterraLesson[],
  existingUnits: CogniterraExistingUnit[]
): Promise<CogniterraPlacementResult> {
  if (cogniterraLessons.length === 0) return { newUnits: [], placements: [] };

  const sorted = [...cogniterraLessons].sort((a, b) => a.position - b.position);
  const working: CogniterraExistingUnit[] = existingUnits.map((u) => ({ ...u }));

  const newUnits: CogniterraNewUnit[] = [];
  const placements: CogniterraLessonPlacement[] = [];
  let newUnitCounter = 0;

  for (let i = 0; i < sorted.length; i += PLACEMENT_GROUP_SIZE) {
    const group = sorted.slice(i, i + PLACEMENT_GROUP_SIZE);

    let groupResult: CogniterraPlacementResult;
    try {
      groupResult = await placeCogniterraLessonGroup(course, group, working);
    } catch (error) {
      console.error(
        `placeCogniterraLessons: group starting at lesson ${group[0]?.id} failed, skipping it:`,
        error instanceof Error ? error.message : error
      );
      continue;
    }

    const keyRemap = new Map<string, string>();
    for (const nu of groupResult.newUnits) {
      const stableKey = `cn${newUnitCounter++}`;
      keyRemap.set(nu.key, stableKey);
      newUnits.push({ key: stableKey, title: nu.title });
      working.push({ id: stableKey, title: nu.title });
    }

    for (const p of groupResult.placements) {
      placements.push({ cogniterraLessonId: p.cogniterraLessonId, unitRef: keyRemap.get(p.unitRef) ?? p.unitRef });
    }
  }

  return { newUnits, placements };
}
