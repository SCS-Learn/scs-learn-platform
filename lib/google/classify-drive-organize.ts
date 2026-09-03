import Anthropic from "@anthropic-ai/sdk";
import type { DriveEntry, DriveImportTree } from "@/lib/google/drive-traversal";
import type { DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import type { DriveDuplicate } from "@/lib/google/classify-drive-content";
import type { QuizLessonRef, TopicGroup } from "@/lib/google/classify-drive-topics";

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

const ORGANIZE_SCHEMA = {
  type: "object",
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          order: { type: "integer" },
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
        },
        required: ["title", "order", "lessons"],
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
  required: ["units", "unclassified", "duplicates"],
  additionalProperties: false,
};

/**
 * AI course structuring for the organize import path: ignores Drive folders as
 * hard boundaries and builds units + multi-file content/quiz lessons from
 * per-file content analysis (title/category/topicSummary).
 */
export async function classifyOrganizeImport(
  course: { title: string; department: string },
  importTree: DriveImportTree,
  analysisByFileId: Map<string, DriveFileAnalysis>
): Promise<OrganizeClassification> {
  const client = new Anthropic();

  const filesForModel = importTree.units.flatMap((unit) =>
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

  const response = await client.messages.create(
    {
      model: "claude-opus-5",
      max_tokens: 32000,
      output_config: { format: { type: "json_schema", schema: ORGANIZE_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `You are structuring a course from a flat list of Google Drive files for "${course.title}" (${course.department}). Folder layout is NOT authoritative — instructors dump materials in arbitrary folders. Use each file's content-derived title, category, and topicSummary to decide structure. "folderPathHint" is only a weak cohesion signal when topics are otherwise ambiguous.

Build:
1. **Units** — coherent topics for the semester (typically ~8–20, not one unit per file). Cross-folder files on the same topic belong in the same unit.
2. **Content lessons** (type "lesson") — one lesson per teaching topic inside a unit. Bundle related materials into ONE lesson:
   - videoFileIds: lecture recordings / docs whose purpose is a video link (Lesson Content tab).
   - contentFileIds: notes, readings, handouts, transcripts to show as lesson content (HTML notes under Lesson Content).
   - fileTabFileIds: slide decks, lecture PDFs, supplemental files for the Lesson Files tab.
   Prefer one rich lesson over many tiny single-file lessons when materials cover the same topic.
3. **Quiz lessons** (type "quiz") — homework, exams, practice problem sets. Put assessment files in quizFileIds. Prefer a PDF (or other fully readable format) as the first quizFileId when the same set exists in multiple formats; list other formats of that same set under "duplicates" pointing at that survivor. Leave video/content/fileTab arrays empty for quizzes. Leave quizFileIds empty for content lessons.

Rules:
- Every driveFileId you place must appear in the input list. Never invent IDs.
- Each file ID appears in at most one lesson role array across the whole course (or in duplicates / unclassified).
- Duplicates: same lecture/assignment saved as both .pptx and .pdf (etc.) — keep ONE survivor in a lesson array; put the rest in "duplicates" with duplicateOfDriveFileId pointing at the survivor. Prefer PDF when choosing among equivalent formats.
- Unclassified: administrative junk, unrelated files, or anything that shouldn't become student-facing lesson content — with a short reason. Do NOT leave practice-problem or homework PDFs unclassified when they clearly belong with a quiz lesson — put them in quizFileIds (or duplicates of that quiz).
- Unit and lesson titles should be specific and descriptive (not "Unit 1" / "Lesson 2" unless that is genuinely all that is known).
- Order units and lessons 1-based by likely course sequence.

Files (JSON):
${JSON.stringify(filesForModel, null, 2)}`,
        },
      ],
    },
    { timeout: 5 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `Organize classification response contained no text content (stop_reason: ${response.stop_reason ?? "unknown"}, ${filesForModel.length} file(s) submitted).`
    );
  }

  const parsed = JSON.parse(textBlock.text) as OrganizeClassification;
  return {
    units: parsed.units ?? [],
    unclassified: parsed.unclassified ?? [],
    duplicates: parsed.duplicates ?? [],
  };
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
        quizOrder += 1;
        quizzes.push({
          title: lesson.title || cleanTitle(primary.name),
          order: quizOrder,
          file: primary,
        });
        for (const extra of quizFiles.slice(1)) {
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
