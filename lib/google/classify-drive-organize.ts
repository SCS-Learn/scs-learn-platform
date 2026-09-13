import Anthropic from "@anthropic-ai/sdk";
import type { DriveEntry, DriveImportTree } from "@/lib/google/drive-traversal";
import type { DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import type { DriveDuplicate } from "@/lib/google/classify-drive-content";
import type { QuizLessonRef, TopicGroup } from "@/lib/google/classify-drive-topics";
import { mapWithConcurrencyLimit } from "@/lib/google/with-concurrency-limit";

export type OrganizeLessonPlan = {
  title: string;
  order: number;
  type: "lesson" | "quiz";
  /** Lesson Content tab — lecture recording / video link. */
  videoFileIds: string[];
  /** Lesson Content — notes/readings rendered as course_notes HTML. */
  contentFileIds: string[];
  /** Lesson Files tab — slide decks, lecture PDFs, supporting materials. */
  fileTabFileIds: string[];
  /** Quiz/homework source file(s); first is primary for question extraction. */
  quizFileIds: string[];
};

export type OrganizeUnitPlan = {
  title: string;
  order: number;
  lessons: OrganizeLessonPlan[];
};

export type OrganizeClassification = {
  units: OrganizeUnitPlan[];
  unclassified: { driveFileId: string; name: string; reason: string }[];
  duplicates: DriveDuplicate[];
};

export type OrganizeUnitForPersist = {
  title: string;
  order: number;
  sourceDriveFolderId: string;
  topics: TopicGroup[];
  quizzes: QuizLessonRef[];
};

type FileForModel = {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  folderPathHint: string | null;
  title: string;
  category: string;
  type: string;
  topicSummary: string | null;
};

function buildFilesForModel(
  importTree: DriveImportTree,
  analysisByFileId: Map<string, DriveFileAnalysis>
): FileForModel[] {
  return importTree.units.flatMap((unit) =>
    unit.files.map((f) => {
      const analysis = analysisByFileId.get(f.id);
      return {
        driveFileId: f.id,
        fileName: f.name,
        mimeType: f.mimeType,
        folderPathHint: f.folderPath.join("/") || null,
        title: analysis?.title ?? f.name,
        category: analysis?.category ?? "other",
        type: analysis?.type ?? "lesson",
        topicSummary: analysis?.topicSummary || null,
      };
    })
  );
}

type OrganizeGroupingPlan = {
  units: { title: string; order: number; fileIds: string[] }[];
  unclassified: { driveFileId: string; name: string; reason: string }[];
};

const GROUPING_SCHEMA = {
  type: "object",
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          order: { type: "integer" },
          fileIds: { type: "array", items: { type: "string" } },
        },
        required: ["title", "order", "fileIds"],
        additionalProperties: false,
      },
    },
    unclassified: {
      type: "array",
      items: {
        type: "object",
        properties: {
          driveFileId: { type: "string" },
          name: { type: "string" },
          reason: { type: "string" },
        },
        required: ["driveFileId", "name", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["units", "unclassified"],
  additionalProperties: false,
};

/**
 * Manager pass: sees every file's lightweight metadata at once and decides
 * only grouping + unit order, not lesson-level bundling. The output is just
 * fileId arrays, so even a multi-thousand-file course produces a small, fast
 * response instead of the full nested lesson schema - whole-course
 * visibility is what lets it still group files across original Drive
 * folders (e.g. pairing a numbered recitation with its lecture's week).
 */
async function classifyOrganizeGrouping(
  client: Anthropic,
  course: { title: string; department: string },
  files: FileForModel[]
): Promise<OrganizeGroupingPlan> {
  const response = await client.messages.create(
    {
      model: "claude-opus-5",
      max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: GROUPING_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `You are grouping a flat list of Google Drive files into course units for "${course.title}" (${course.department}). Folder layout is NOT authoritative — instructors dump materials in arbitrary folders. Use each file's content-derived title, category, and topicSummary to decide grouping. "folderPathHint" is only a weak cohesion signal when topics are otherwise ambiguous.

Build **units** — coherent topics for the semester (typically ~8–20, not one unit per file). Cross-folder files on the same topic belong in the same unit. Do not decide lesson-level structure within a unit yet — just which files belong together.

Rules:
- Every driveFileId you place must appear in the input list. Never invent IDs.
- Each file ID appears in exactly one unit's fileIds (or in "unclassified").
- Unclassified: administrative junk, unrelated files, or anything that shouldn't become student-facing content — with a short reason. Do NOT leave practice-problem or homework files unclassified merely because they're assessments — group them into the unit their topic belongs to.
- Unit titles should be specific and descriptive (not "Unit 1" unless that is genuinely all that is known).
- Ordering is a hard constraint, not a rough guess: assign "order" 1-based strictly by pedagogical prerequisite sequence - a unit must never precede another unit whose content it actually depends on. Use every file's topicSummary to work out which topics are foundational (assumed as background elsewhere) and which build on top of another topic - order foundational topics first. If unit A's files build on, extend, or apply a concept that unit B's files introduce from scratch, unit B must be ordered before unit A, even if unit A's files otherwise look earlier alphabetically, chronologically, or by folder. Do not fall back to input-list order or folder order except as a last resort when two topics are genuinely independent - in that case list order is fine as a tiebreaker.
- Recitations, discussion sections, reviews, and other companion content explicitly numbered against a lecture/week (fileName or title containing e.g. "Recitation 4", "Week 3", "Lecture 12") reinforce that same numbered week's material - they belong in the SAME unit as the lecture content they accompany. Treat that embedded number as a strong signal of where the file actually falls in the course timeline, and do not let prerequisite-style reasoning from topicSummary alone scatter it into a much later or earlier unit - a recitation merely touching on, applying, or reviewing a concept is not grounds to relocate it away from its numbered week. Only override the numbering when the file's actual content contradicts it outright (e.g. mislabeled, or a template reused verbatim from a different week). When several files carry explicit sequence numbers, preserve their relative numeric order unless there is unambiguous evidence the numbering itself is wrong.
- A cumulative/final course review, final-exam review, or end-of-semester wrap-up unit (one that revisits material across the whole course rather than introducing or applying one specific topic) is a special case: it does NOT get ordered by which topic it happens to touch on first, or by prerequisite reasoning at all. It belongs LAST, after every other unit, because pedagogically a course-wide review always comes at the end regardless of which topics it reviews. Give it the single highest "order" value of all units.
- Two units covering the same or substantially overlapping topic is always a mistake, never a valid outcome - merge them into ONE unit instead. This is the single most common way this task goes wrong: a lecture's files and a separately-titled recitation/practice-problem/extra-materials file on that exact same topic getting split into two similarly-titled units (e.g. "Evolutionary Trees..." and, separately, "Evolutionary Trees... (Continued)" or any other near-duplicate title) instead of one. Before assigning a file to a new unit, check whether an existing unit already covers that same topic and put it there instead of creating a near-duplicate.
- Before finalizing, re-check your own proposed unit list for exactly these failure modes: (1) any two units whose titles or file topics substantially overlap - merge them; (2) any unit ordered after another that is actually a prerequisite it depends on - fix the ordering; (3) any numbered recitation/lecture/week file detached from its own numbered week's unit - move it back; (4) any cumulative/final review unit that doesn't have the highest order of all units - fix it. Fix every instance you find before returning your answer.

Files (JSON):
${JSON.stringify(files, null, 2)}`,
        },
      ],
    },
    { timeout: 5 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `Organize grouping response contained no text content (stop_reason: ${response.stop_reason ?? "unknown"}, ${files.length} file(s) submitted).`
    );
  }

  const parsed = JSON.parse(textBlock.text) as OrganizeGroupingPlan;
  return { units: parsed.units ?? [], unclassified: parsed.unclassified ?? [] };
}

type OrganizeUnitLessonsPlan = {
  lessons: OrganizeLessonPlan[];
  unclassified: { driveFileId: string; name: string; reason: string }[];
  duplicates: DriveDuplicate[];
};

const UNIT_LESSONS_SCHEMA = {
  type: "object",
  properties: {
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          order: { type: "integer" },
          type: { type: "string", enum: ["lesson", "quiz"] },
          videoFileIds: { type: "array", items: { type: "string" } },
          contentFileIds: { type: "array", items: { type: "string" } },
          fileTabFileIds: { type: "array", items: { type: "string" } },
          quizFileIds: { type: "array", items: { type: "string" } },
        },
        required: [
          "title",
          "order",
          "type",
          "videoFileIds",
          "contentFileIds",
          "fileTabFileIds",
          "quizFileIds",
        ],
        additionalProperties: false,
      },
    },
    unclassified: {
      type: "array",
      items: {
        type: "object",
        properties: {
          driveFileId: { type: "string" },
          name: { type: "string" },
          reason: { type: "string" },
        },
        required: ["driveFileId", "name", "reason"],
        additionalProperties: false,
      },
    },
    duplicates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          driveFileId: { type: "string" },
          duplicateOfDriveFileId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["driveFileId", "duplicateOfDriveFileId", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["lessons", "unclassified", "duplicates"],
  additionalProperties: false,
};

/**
 * Worker pass: builds lesson-level structure within a single already-decided
 * unit. Scoped to just that unit's files, so the call stays small and fast
 * regardless of how large the overall course is - many of these run in
 * parallel across units.
 */
async function classifyOrganizeUnitLessons(
  client: Anthropic,
  course: { title: string; department: string },
  unitTitle: string,
  files: FileForModel[]
): Promise<OrganizeUnitLessonsPlan> {
  const response = await client.messages.create(
    {
      model: "claude-opus-5",
      max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: UNIT_LESSONS_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `You are building lesson-level structure for one unit, "${unitTitle}", of "${course.title}" (${course.department}). These files were already grouped into this unit; your job is only to decide the lessons within it.

Build:
1. **Content lessons** (type "lesson") — one lesson per teaching topic inside this unit. Bundle related materials into ONE lesson:
   - videoFileIds: lecture recordings / docs whose purpose is a video link (Lesson Content tab).
   - contentFileIds: notes, readings, handouts, transcripts to show as lesson content (HTML notes under Lesson Content).
   - fileTabFileIds: slide decks, lecture PDFs, supplemental files for the Lesson Files tab.
   Prefer one rich lesson over many tiny single-file lessons when materials cover the same topic.
2. **Quiz lessons** (type "quiz") — homework, exams, practice problem sets. Put assessment files in quizFileIds. Prefer a PDF (or other fully readable format) as the first quizFileId when the same set exists in multiple formats; list other formats of that same set under "duplicates" pointing at that survivor. If a separate file is the answer key / solutions / rubric for that same problem set (e.g. "HW3_solutions.pdf" alongside "HW3.pdf"), put it in quizFileIds too, AFTER the problem file — it is a different document, not a format duplicate, so it does NOT go in "duplicates". Leave video/content/fileTab arrays empty for quizzes. Leave quizFileIds empty for content lessons.

Rules:
- Every driveFileId you place must appear in the input list. Never invent IDs.
- Each file ID appears in at most one lesson role array (or in duplicates / unclassified).
- Duplicates: same lecture/assignment saved as both .pptx and .pdf (etc.) — keep ONE survivor in a lesson array; put the rest in "duplicates" with duplicateOfDriveFileId pointing at the survivor. Prefer PDF when choosing among equivalent formats. A solutions/answer-key file is never a duplicate of its problem file — group it in quizFileIds instead (see above).
- Unclassified: administrative junk, unrelated files, or anything that shouldn't become student-facing lesson content — with a short reason. Do NOT leave practice-problem or homework files unclassified when they clearly belong with a quiz lesson — put them in quizFileIds (or duplicates of that quiz).
- Lesson titles should be specific and descriptive (not "Lesson 1" unless that is genuinely all that is known).
- Assign "order" 1-based by pedagogical sequence within this unit only, using each file's topicSummary; fall back to input-list order only when two lessons are genuinely independent.
- Recitations, discussion sections, and reviews numbered against a specific lecture/week stay ordered immediately alongside that lecture's lesson.

Files (JSON):
${JSON.stringify(files, null, 2)}`,
        },
      ],
    },
    { timeout: 3 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `Organize unit-lessons response contained no text content for unit "${unitTitle}" (stop_reason: ${response.stop_reason ?? "unknown"}, ${files.length} file(s) submitted).`
    );
  }

  const parsed = JSON.parse(textBlock.text) as OrganizeUnitLessonsPlan;
  return {
    lessons: parsed.lessons ?? [],
    unclassified: parsed.unclassified ?? [],
    duplicates: parsed.duplicates ?? [],
  };
}

const UNIT_WORKER_CONCURRENCY = 4;

/**
 * AI course structuring for the organize import path: a manager call groups
 * every file (by lightweight metadata) into units and decides unit order,
 * ignoring Drive folders as hard boundaries; a worker call per unit then
 * builds that unit's multi-file content/quiz lessons, in parallel. Splitting
 * the manager (whole course, small output) from the workers (one unit,
 * small input+output) keeps every individual call fast even for a
 * multi-thousand-file course, without giving up cross-folder grouping.
 */
export async function classifyOrganizeImport(
  course: { title: string; department: string },
  importTree: DriveImportTree,
  analysisByFileId: Map<string, DriveFileAnalysis>
): Promise<OrganizeClassification> {
  const client = new Anthropic();
  const files = buildFilesForModel(importTree, analysisByFileId);
  const filesById = new Map(files.map((f) => [f.driveFileId, f]));

  const grouping = await classifyOrganizeGrouping(client, course, files);

  for (const item of grouping.unclassified) {
    console.log(
      `classifyOrganizeImport: unclassified "${item.name}" (${item.driveFileId}): ${item.reason}`
    );
  }

  // The grouping prompt asks for each file id to appear in exactly one unit,
  // but that's only ever an instruction the model can violate - enforce it in
  // code too. Without this, a file assigned to two units gets independently
  // handed to two separate unit-lessons calls, each producing its own
  // (differently-worded) lesson for the same source file - two near-duplicate
  // units for the same content, e.g. two similarly-titled "Evolutionary
  // Trees..." units both containing a lesson built from the same Drive file.
  const claimedFileIds = new Set<string>();
  for (const unit of grouping.units) {
    unit.fileIds = unit.fileIds.filter((id) => {
      if (claimedFileIds.has(id)) return false;
      claimedFileIds.add(id);
      return true;
    });
  }

  const workerResults = await mapWithConcurrencyLimit(
    grouping.units,
    UNIT_WORKER_CONCURRENCY,
    async (unit) => {
      const unitFiles = unit.fileIds
        .map((id) => filesById.get(id))
        .filter((f): f is FileForModel => f !== undefined);
      if (unitFiles.length === 0) {
        const empty: OrganizeUnitLessonsPlan = { lessons: [], unclassified: [], duplicates: [] };
        return { unit, plan: empty };
      }
      const plan = await classifyOrganizeUnitLessons(client, course, unit.title, unitFiles).catch(
        (error) => {
          // A refused/failed call for one unit (e.g. the model's safety
          // classifier flagging otherwise-legitimate coursework, a transient
          // API error, etc.) must not take down the whole course import -
          // every other unit's classification work already succeeded and
          // would otherwise be discarded along with it. Drop just this
          // unit's files to unclassified instead, so the rest of the import
          // still proceeds and the instructor can retry/handle these by hand.
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            `classifyOrganizeImport: unit "${unit.title}" failed to classify, dropping its ${unitFiles.length} file(s) to unclassified:`,
            message
          );
          const fallback: OrganizeUnitLessonsPlan = {
            lessons: [],
            unclassified: unitFiles.map((f) => ({
              driveFileId: f.driveFileId,
              name: f.fileName,
              reason: `Unit-level classification failed: ${message}`,
            })),
            duplicates: [],
          };
          return fallback;
        }
      );
      return { unit, plan };
    }
  );

  const units: OrganizeUnitPlan[] = [];
  const unclassified: OrganizeClassification["unclassified"] = [...grouping.unclassified];
  const duplicates: DriveDuplicate[] = [];

  for (const { unit, plan } of workerResults) {
    units.push({ title: unit.title, order: unit.order, lessons: plan.lessons });
    unclassified.push(...plan.unclassified);
    duplicates.push(...plan.duplicates);
  }

  return { units, unclassified, duplicates };
}

function resolveEntries(ids: string[], driveFilesById: Map<string, DriveEntry>, used: Set<string>): DriveEntry[] {
  const out: DriveEntry[] = [];
  for (const id of ids) {
    if (used.has(id)) continue;
    const file = driveFilesById.get(id);
    if (!file) continue;
    used.add(id);
    out.push(file);
  }
  return out;
}

/**
 * Converts the model plan into the TopicGroup / QuizLessonRef shapes the
 * organize persistence layer already knows how to populate. Extra files on a
 * multi-file quiz lesson are returned as duplicates of the primary so they
 * still attach as Drive links without becoming separate lessons.
 */
export function organizeClassificationToPersistable(
  classification: OrganizeClassification,
  driveFilesById: Map<string, DriveEntry>,
  rootFolderId: string
): { units: OrganizeUnitForPersist[]; extraDuplicates: DriveDuplicate[] } {
  const duplicateFileIds = new Set(classification.duplicates.map((d) => d.driveFileId));
  const used = new Set<string>(duplicateFileIds);
  const extraDuplicates: DriveDuplicate[] = [];

  const units: OrganizeUnitForPersist[] = [];

  for (const unit of [...classification.units].sort((a, b) => a.order - b.order)) {
    const topics: TopicGroup[] = [];
    const quizzes: QuizLessonRef[] = [];
    let topicOrder = 0;
    let quizOrder = 0;

    for (const lesson of [...unit.lessons].sort((a, b) => a.order - b.order)) {
      if (lesson.type === "quiz") {
        const quizFiles = resolveEntries(lesson.quizFileIds, driveFilesById, used);
        if (quizFiles.length === 0) continue;
        const primary = quizFiles[0]!;
        const extraFiles = quizFiles.slice(1);
        quizOrder += 1;
        quizzes.push({
          title: lesson.title || cleanTitle(primary.name),
          order: quizOrder,
          file: primary,
          extraFiles,
        });
        for (const extra of extraFiles) {
          // Also attached as a Drive-link duplicate so it still surfaces in
          // the lesson sidebar — its content is separately fed to question
          // extraction (see extraFiles above), it may not be a true format
          // duplicate (e.g. a solutions file).
          extraDuplicates.push({
            driveFileId: extra.id,
            duplicateOfDriveFileId: primary.id,
            reason: `Additional file for quiz lesson "${lesson.title}".`,
          });
        }
        continue;
      }

      const videoFiles = resolveEntries(lesson.videoFileIds, driveFilesById, used);
      const notesFiles = resolveEntries(lesson.contentFileIds, driveFilesById, used);
      const slideFiles = resolveEntries(lesson.fileTabFileIds, driveFilesById, used);

      // Mis-tagged quiz files on a content lesson still become a quiz lesson.
      const strayQuiz = resolveEntries(lesson.quizFileIds, driveFilesById, used);
      for (const file of strayQuiz) {
        quizOrder += 1;
        quizzes.push({
          title: cleanTitle(file.name),
          order: quizOrder,
          file,
          extraFiles: [],
        });
      }

      if (videoFiles.length + notesFiles.length + slideFiles.length === 0) continue;

      topicOrder += 1;
      const fallbackName =
        videoFiles[0]?.name ?? slideFiles[0]?.name ?? notesFiles[0]?.name ?? "Untitled lesson";
      topics.push({
        title: lesson.title || cleanTitle(fallbackName),
        order: topicOrder,
        videoFiles,
        slideFiles,
        notesFiles,
      });
    }

    if (topics.length === 0 && quizzes.length === 0) continue;

    units.push({
      title: unit.title,
      order: unit.order,
      sourceDriveFolderId: rootFolderId,
      topics,
      quizzes,
    });
  }

  return { units, extraDuplicates };
}

function cleanTitle(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[_-]+/g, " ").trim();
}
