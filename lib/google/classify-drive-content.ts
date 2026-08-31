import Anthropic from "@anthropic-ai/sdk";
import type { DriveImportTree } from "@/lib/google/drive-traversal";
import type { DriveFileAnalysis } from "@/lib/google/analyze-drive-file";

export type ClassifiedLesson = {
  driveFileId: string;
  order: number;
};

export type ClassifiedUnit = {
  driveFolderId: string;
  title: string;
  order: number;
  lessons: ClassifiedLesson[];
};

export type DriveDuplicate = { driveFileId: string; duplicateOfDriveFileId: string; reason: string };

export type DriveClassification = {
  units: ClassifiedUnit[];
  unclassified: { driveFileId: string; name: string; reason: string }[];
  duplicates: DriveDuplicate[];
};

const CLASSIFICATION_SCHEMA = {
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
                driveFileId: { type: "string" },
                order: { type: "integer" },
              },
              required: ["driveFileId", "order"],
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
 * Groups files into units by actual topic, using the content-derived
 * title/type/topicSummary from analyzeDriveFileContent (per-file, Sonnet)
 * rather than filenames - this call itself stays on Haiku since its input
 * is just those short summaries, not the underlying PDFs.
 */
export async function classifyDriveImport(
  course: { title: string; department: string },
  importTree: DriveImportTree,
  analysisByFileId: Map<string, DriveFileAnalysis>
): Promise<DriveClassification> {
  const client = new Anthropic();

  const folderIdByFileId = new Map<string, string>();
  const filesForModel = importTree.units.flatMap((unit) =>
    unit.files.map((f) => {
      folderIdByFileId.set(f.id, unit.folderId);
      const analysis = analysisByFileId.get(f.id);
      return {
        driveFileId: f.id,
        driveFolderId: unit.folderId,
        folderName: importTree.isFlat ? null : unit.folderName,
        subfolderPath: f.folderPath.join("/") || null,
        fileName: f.name,
        title: analysis?.title ?? f.name,
        category: analysis?.category ?? "other",
        topicSummary: analysis?.topicSummary || null,
      };
    })
  );

  const response = await client.messages.create({
    model: "claude-opus-5",
    // A real course folder (recursed into every subfolder) can easily carry
    // 100+ classifiable files once junk is filtered out - a whole semester
    // of lectures/recitations/homeworks/practice sets needs real room to be
    // enumerated in one JSON response. 8000 was tuned for a much smaller
    // input and silently produced a response with no text content at all
    // once the file count grew past what it could fit.
    max_tokens: 32000,
    output_config: { format: { type: "json_schema", schema: CLASSIFICATION_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `You are grouping files into course units for "${course.title}" (${course.department}). Each file below already has a content-derived title and topic summary from actually being read - use those, not just filenames or folder names, to decide grouping.

Group files into units by TOPIC ONLY - ignore which Drive folder a file came from entirely. Real course Drive structures commonly keep lectures, recitations, homework, and practice-problem sets in separate top-level folders (e.g. "Lectures", "Recitations", "Theory Homeworks") even when a specific recitation or homework set is directly about one specific lecture's topic - "driveFolderId" is not a meaningful grouping boundary and files with different "driveFolderId" values should freely end up in the same unit whenever their topics genuinely correspond. Favor consolidation: aim for well-consolidated units, each covering one coherent topic and containing every file (lecture, recitation, homework, practice problems, reference material, etc.) that specifically belongs to that topic. A typical semester course should produce roughly 10-20 units total, not a separate unit per file - only split files into different units when they are genuinely about different subjects, not merely because they came from different folders. "subfolderPath" (when present) is a secondary, same-folder-only cohesion signal: files sharing a subfolderPath (e.g. several files under "Week 3") were deliberately co-located and often belong together, but this never overrides the primary topic-based, cross-folder grouping described above. Give each unit a specific, descriptive title reflecting what its lessons actually cover - skip generic labels like "Section I" unless that's genuinely the best description available. Order units and lessons by the sequence implied by topic continuity within the given list order, giving each a 1-based "order" integer.

Some files may be exact duplicates of each other's content - the same lecture saved twice, or the same deck exported to two different formats (e.g. the same lecture as both "Genome_Assembly.pptx" and "Genome_Assembly.pdf"). Use "fileName", "title", and "topicSummary" together to spot these: when two or more files are genuinely the same specific content (not just the same general topic - literally the same lecture/document), keep exactly ONE of them as a lesson (prefer whichever looks most complete - a real, non-empty "topicSummary" beats an empty one) and list every other file in that group under "duplicates" instead of "lessons" or "unclassified", with "duplicateOfDriveFileId" pointing at the one you kept. Do not mark files as duplicates just because they cover a similar topic - only when they are really the same content.

Files (JSON):
${JSON.stringify(filesForModel, null, 2)}`,
      },
    ],
  }, { timeout: 5 * 60 * 1000 }); // raised alongside max_tokens - a large-file-count response takes longer to generate

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `Classification response contained no text content (stop_reason: ${response.stop_reason ?? "unknown"}, ${filesForModel.length} file(s) submitted) - the course folder may have too many classifiable files for one pass.`
    );
  }
  const parsed = JSON.parse(textBlock.text) as {
    units: { title: string; order: number; lessons: ClassifiedLesson[] }[];
    unclassified: { driveFileId: string; name: string; reason: string }[];
    duplicates: DriveDuplicate[];
  };

  // Units can now legitimately mix files from different source folders (that's
  // the whole point of cross-folder topic grouping above), so driveFolderId
  // here is no longer "the one folder every file in this unit shares" - it's
  // just whichever file happens to be first in the list, kept only because
  // addUnitFromImport wants some representative folder id for
  // units.source_drive_folder_id. Purely informational/cosmetic now.
  const units: ClassifiedUnit[] = parsed.units
    .map((unit) => ({
      title: unit.title,
      order: unit.order,
      lessons: unit.lessons,
      driveFolderId: folderIdByFileId.get(unit.lessons[0]?.driveFileId) ?? importTree.units[0]?.folderId ?? "",
    }))
    .filter((unit) => unit.lessons.length > 0);

  return { units, unclassified: parsed.unclassified, duplicates: parsed.duplicates ?? [] };
}
