"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, getServiceAccountEmail, parseDriveFolderUrl } from "@/lib/google/drive-client";
import { buildDriveImportTree } from "@/lib/google/drive-traversal";
import { classifyDriveImport } from "@/lib/google/classify-drive-content";
import { downloadDriveFileAsPdfBase64 } from "@/lib/google/download-drive-file";
import { analyzeDriveFileContent, type DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import { addUnitFromImport, addLessonFromImport } from "@/lib/instructor/data/lessons";
import { addAttachment } from "@/lib/instructor/data/attachments";

function cleanFilenameTitle(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[_-]+/g, " ").trim();
}

/** Null when only GOOGLE_API_KEY is configured - "Anyone with the link" is then the only option. */
export async function getDriveShareEmail(): Promise<string | null> {
  return getServiceAccountEmail();
}

function driveErrorMessage(error: unknown): string {
  const code = (error as { code?: number })?.code;
  if (code === 404 || code === 403) {
    return "Couldn't open that folder - make sure it's shared as \"Anyone with the link\" and try again.";
  }
  return "Couldn't reach Google Drive for that link.";
}

export async function getDriveImportPreview(
  folderUrl: string
): Promise<{ unitCount: number; lessonCount: number; isFlat: boolean }> {
  const { folderId, resourceKey } = parseDriveFolderUrl(folderUrl);
  const drive = getDriveClient();
  try {
    const tree = await buildDriveImportTree(drive, folderId, resourceKey);
    return {
      // In a flat folder this is just 1 (the whole thing, pre-split) - Claude
      // only decides the real unit count once the import actually runs.
      unitCount: tree.units.length,
      lessonCount: tree.units.reduce((sum, unit) => sum + unit.files.length, 0),
      isFlat: tree.isFlat,
    };
  } catch (error) {
    throw new Error(driveErrorMessage(error));
  }
}

export async function runDriveImport(
  courseCode: string,
  folderUrl: string
): Promise<{ unitIds: string[]; lessonIds: string[] }> {
  const { folderId, resourceKey } = parseDriveFolderUrl(folderUrl);
  const resourceKeyHeader = resourceKey ? `${folderId}/${resourceKey}` : undefined;

  const supabase = await createClient();
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("title, department")
    .eq("code", courseCode)
    .single();
  if (courseError || !course) throw new Error("Unknown course code");

  const drive = getDriveClient();
  const tree = await buildDriveImportTree(drive, folderId, resourceKey).catch((error) => {
    throw new Error(driveErrorMessage(error));
  });

  const driveFilesById = new Map(tree.units.flatMap((u) => u.files).map((f) => [f.id, f]));

  // Read every file's actual content up front, in parallel, before grouping
  // or touching the DB - downloading + Claude are the slow part, and a bad
  // PDF here just falls back to a filename-derived title/type for that one
  // file (it still gets its attachment) instead of breaking the import.
  const analysisByFileId = new Map<string, DriveFileAnalysis>(
    await Promise.all(
      Array.from(driveFilesById.values()).map(async (file) => {
        const pdfBase64 = await downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader);
        const analysis = pdfBase64 ? await analyzeDriveFileContent(course, pdfBase64).catch(() => null) : null;
        if (analysis) return [file.id, analysis] as const;
        return [
          file.id,
          {
            title: cleanFilenameTitle(file.name),
            type: file.mimeType === "application/vnd.google-apps.form" ? "quiz" : "lesson",
            topicSummary: "",
            contentHtml: "",
          } as DriveFileAnalysis,
        ] as const;
      })
    )
  );

  const classification = await classifyDriveImport(course, tree, analysisByFileId);

  const unitIds: string[] = [];
  const lessonIds: string[] = [];

  const sortedUnits = [...classification.units].sort((a, b) => a.order - b.order);
  for (const unit of sortedUnits) {
    const newUnit = await addUnitFromImport(courseCode, unit.title, unit.driveFolderId);
    unitIds.push(newUnit.id);

    const sortedLessons = [...unit.lessons].sort((a, b) => a.order - b.order);
    for (const [index, lesson] of sortedLessons.entries()) {
      const analysis = analysisByFileId.get(lesson.driveFileId);
      const newLesson = await addLessonFromImport(newUnit.id, {
        title: analysis?.title ?? "Untitled lesson",
        type: analysis?.type ?? "lesson",
        position: index + 1,
        sourceDriveFileId: lesson.driveFileId,
        contentHtml: analysis?.contentHtml || undefined,
      });
      lessonIds.push(newLesson.id);

      const driveFile = driveFilesById.get(lesson.driveFileId);
      if (driveFile?.webViewLink) {
        await addAttachment(newLesson.id, {
          name: driveFile.name,
          url: driveFile.webViewLink,
          storagePath: null,
          contentType: driveFile.mimeType,
          sizeBytes: 0,
        });
      }
    }
  }

  revalidatePath(`/instructor/${courseCode}`);
  return { unitIds, lessonIds };
}
