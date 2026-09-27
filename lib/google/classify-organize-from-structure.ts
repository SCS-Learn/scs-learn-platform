import type { DriveImportTree } from "@/lib/google/drive-traversal";
import type { DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import type { OrganizeClassification, OrganizeLessonPlan } from "@/lib/google/classify-drive-organize";

/**
 * Drop-in stand-in for classifyOrganizeImport that makes no model calls: one
 * unit per Drive subfolder, one lesson per file, titles from the filename.
 * Everything is typed "lesson" even when the filename looks like homework -
 * a quiz lesson would send its file to question extraction (the one remaining
 * model call on this path), and a quiz lesson with no questions is dropped
 * outright by the persistence loop, so quiz-typing here would make files
 * silently vanish from a course whose whole purpose is to check that files
 * land where they should.
 */
export function classifyOrganizeFromStructure(
  importTree: DriveImportTree,
  analysisByFileId: Map<string, DriveFileAnalysis>
): OrganizeClassification {
  const units = importTree.units
    .map((unit, unitIndex) => ({
      title: importTree.isFlat ? "Course Materials" : unit.folderName,
      order: unitIndex + 1,
      lessons: unit.files.map((file, fileIndex): OrganizeLessonPlan => ({
        title: analysisByFileId.get(file.id)?.title ?? file.name,
        order: fileIndex + 1,
        type: "lesson",
        videoFileIds: [],
        contentFileIds: [],
        fileTabFileIds: [file.id],
        quizFileIds: [],
      })),
    }))
    .filter((unit) => unit.lessons.length > 0);

  return { units, unclassified: [], duplicates: [] };
}
