"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient, getServiceAccountEmail, parseDriveFolderUrl } from "@/lib/google/drive-client";
import { buildDriveImportTree } from "@/lib/google/drive-traversal";
import { classifyDriveImport } from "@/lib/google/classify-drive-content";
import { downloadDriveFileAsPdfBase64 } from "@/lib/google/download-drive-file";
import { analyzeDriveFileContent, type DriveFileAnalysis } from "@/lib/google/analyze-drive-file";
import { extractDriveFileImages } from "@/lib/google/extract-drive-images";
import { uploadDriveImage } from "@/lib/google/upload-drive-image";
import { addUnitFromImport, addLessonFromImport } from "@/lib/instructor/data/lessons";
import { addAttachment } from "@/lib/instructor/data/attachments";
import { flushAtomStore, writeAtomRecord } from "@/lib/debug/atom-store";

type ResolvedFigure = {
  imageIndex: number;
  url: string;
  storagePath: string;
  contentType: string;
  caption: string;
  sizeBytes: number;
};

function cleanFilenameTitle(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[_-]+/g, " ").trim();
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Fills in the placeholder <img data-figure-index="N"> tags Claude left in contentHtml with the uploaded URL. */
function embedFigures(contentHtml: string, figures: ResolvedFigure[]): string {
  let html = contentHtml;
  for (const figure of figures) {
    const placeholder = new RegExp(`<img[^>]*data-figure-index=["']${figure.imageIndex}["'][^>]*>`, "i");
    const imgTag = `<img src="${figure.url}" alt="${escapeHtmlAttr(figure.caption)}">`;
    html = placeholder.test(html)
      ? html.replace(placeholder, imgTag)
      : `${html}<figure>${imgTag}<figcaption>${escapeHtmlAttr(figure.caption)}</figcaption></figure>`;
  }
  return html;
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

  await flushAtomStore();

  const drive = getDriveClient();
  const tree = await buildDriveImportTree(drive, folderId, resourceKey).catch((error) => {
    throw new Error(driveErrorMessage(error));
  });

  const driveFilesById = new Map(tree.units.flatMap((u) => u.files).map((f) => [f.id, f]));

  // Read every file's actual content up front, in parallel, before grouping
  // or touching the DB - downloading + Claude are the slow part, and a bad
  // PDF here just falls back to a filename-derived title/type for that one
  // file (it still gets its attachment) instead of breaking the import.
  const figuresByFileId = new Map<string, ResolvedFigure[]>();

  const analysisByFileId = new Map<string, DriveFileAnalysis>(
    await Promise.all(
      Array.from(driveFilesById.values()).map(async (file) => {
        const [pdfBase64, images] = await Promise.all([
          downloadDriveFileAsPdfBase64(drive, file, resourceKeyHeader),
          extractDriveFileImages(drive, file, resourceKeyHeader).catch(() => []),
        ]);
        const analysis = pdfBase64 ? await analyzeDriveFileContent(course, pdfBase64, images).catch(() => null) : null;
        if (!analysis) {
          const fallback = {
            title: cleanFilenameTitle(file.name),
            type: file.mimeType === "application/vnd.google-apps.form" ? "quiz" : "lesson",
            topicSummary: "",
            contentHtml: "",
            figures: [],
          } as DriveFileAnalysis;
          await writeAtomRecord(`analyze-${file.name}`, { file: { id: file.id, name: file.name }, fallback: true, analysis: fallback });
          return [file.id, fallback] as const;
        }

        await writeAtomRecord(`analyze-${file.name}`, { file: { id: file.id, name: file.name }, fallback: false, analysis });

        const resolvedFigures = (
          await Promise.all(
            analysis.figures.map(async (figure): Promise<ResolvedFigure | null> => {
              const image = images[figure.imageIndex];
              if (!image) return null;
              const uploaded = await uploadDriveImage(file.id, figure.imageIndex, image);
              if (!uploaded) return null;
              return {
                ...uploaded,
                imageIndex: figure.imageIndex,
                contentType: image.contentType,
                caption: figure.caption,
                sizeBytes: image.data.length,
              };
            })
          )
        ).filter((figure): figure is ResolvedFigure => figure !== null);
        figuresByFileId.set(file.id, resolvedFigures);

        return [file.id, { ...analysis, contentHtml: embedFigures(analysis.contentHtml, resolvedFigures) }] as const;
      })
    )
  );

  const classification = await classifyDriveImport(course, tree, analysisByFileId);
  await writeAtomRecord("classify", { input: Array.from(analysisByFileId.entries()), classification });

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

      for (const figure of figuresByFileId.get(lesson.driveFileId) ?? []) {
        await addAttachment(newLesson.id, {
          name: `${analysis?.title ?? driveFile?.name ?? "Figure"} - ${figure.caption}`.slice(0, 200),
          url: figure.url,
          storagePath: figure.storagePath,
          contentType: figure.contentType,
          sizeBytes: figure.sizeBytes,
        });
      }
    }
  }

  revalidatePath(`/instructor/${courseCode}`);
  return { unitIds, lessonIds };
}
