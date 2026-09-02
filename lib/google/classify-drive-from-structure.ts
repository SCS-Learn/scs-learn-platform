import type { DriveImportTree } from "@/lib/google/drive-traversal";
import type { DriveClassification, DriveDuplicate } from "@/lib/google/classify-drive-content";

/** Prefer the format most likely to render well as a whole-file embed. */
const MIME_PRIORITY: Record<string, number> = {
  "application/pdf": 0,
  "application/vnd.google-apps.presentation": 1,
  "application/vnd.google-apps.document": 2,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": 3,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 4,
};

function duplicateScore(mimeType: string): number {
  return MIME_PRIORITY[mimeType] ?? 10;
}

function normalizedBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().toLowerCase();
}

function detectDuplicates(
  files: { id: string; name: string; mimeType: string }[]
): { duplicates: DriveDuplicate[]; duplicateFileIds: Set<string> } {
  const byBaseName = new Map<string, typeof files>();
  for (const file of files) {
    const base = normalizedBaseName(file.name);
    const list = byBaseName.get(base) ?? [];
    list.push(file);
    byBaseName.set(base, list);
  }

  const duplicates: DriveDuplicate[] = [];
  const duplicateFileIds = new Set<string>();

  for (const group of byBaseName.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => duplicateScore(a.mimeType) - duplicateScore(b.mimeType) || a.name.localeCompare(b.name)
    );
    const survivor = sorted[0]!;
    for (const duplicate of sorted.slice(1)) {
      duplicates.push({
        driveFileId: duplicate.id,
        duplicateOfDriveFileId: survivor.id,
        reason: `Same content as "${survivor.name}" (kept the more complete format).`,
      });
      duplicateFileIds.add(duplicate.id);
    }
  }

  return { duplicates, duplicateFileIds };
}

/**
 * Groups files using the Drive folder tree directly — one unit per top-level
 * subfolder (or a single unit when the root is flat). No LLM calls.
 */
export function classifyDriveImportFromStructure(importTree: DriveImportTree): DriveClassification {
  const allFiles = importTree.units.flatMap((unit) =>
    unit.files.map((file) => ({ id: file.id, name: file.name, mimeType: file.mimeType }))
  );
  const { duplicates, duplicateFileIds } = detectDuplicates(allFiles);

  const units = importTree.units
    .map((unit, unitIndex) => ({
      driveFolderId: unit.folderId,
      title: importTree.isFlat ? "Course Materials" : unit.folderName,
      order: unitIndex + 1,
      lessons: unit.files
        .filter((file) => !duplicateFileIds.has(file.id))
        .map((file, lessonIndex) => ({
          driveFileId: file.id,
          order: lessonIndex + 1,
        })),
    }))
    .filter((unit) => unit.lessons.length > 0);

  return { units, unclassified: [], duplicates };
}
