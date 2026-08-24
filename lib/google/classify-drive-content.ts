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

export type DriveClassification = {
  units: ClassifiedUnit[];
  unclassified: { driveFileId: string; name: string; reason: string }[];
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
  },
  required: ["units", "unclassified"],
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
        title: analysis?.title ?? f.name,
        type: analysis?.type ?? "lesson",
        topicSummary: analysis?.topicSummary || null,
      };
    })
  );

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8000,
    output_config: { format: { type: "json_schema", schema: CLASSIFICATION_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `You are grouping files into course units for "${course.title}" (${course.department}). Each file below already has a content-derived title and topic summary from actually being read - use those, not just filenames or folder names, to decide grouping.

Group files into units by topic: each unit should represent one coherent topic or section. Prefer MORE, NARROWER units over a few broad ones - if a folder's files span multiple distinct topics, split that folder into several units rather than treating it as one big unit; don't force everything into as few units as possible just because they came from the same folder. A unit may not mix files from two different "driveFolderId" values, but a single folder's files can become multiple units when their topics diverge. Give each unit a specific, descriptive title reflecting what its lessons actually cover - skip generic labels like "Section I" unless that's genuinely the best description available. Order units and lessons by the sequence implied by topic continuity within the given list order, giving each a 1-based "order" integer.

Files (JSON):
${JSON.stringify(filesForModel, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Classification response contained no text content");
  }
  const parsed = JSON.parse(textBlock.text) as {
    units: { title: string; order: number; lessons: ClassifiedLesson[] }[];
    unclassified: { driveFileId: string; name: string; reason: string }[];
  };

  const units: ClassifiedUnit[] = parsed.units.map((unit) => ({
    title: unit.title,
    order: unit.order,
    lessons: unit.lessons,
    driveFolderId: folderIdByFileId.get(unit.lessons[0]?.driveFileId) ?? importTree.units[0]?.folderId ?? "",
  }));

  return { units, unclassified: parsed.unclassified };
}
