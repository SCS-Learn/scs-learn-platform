import type { DriveEntry, DriveImportUnit } from "@/lib/google/drive-traversal";
import type { DriveDuplicate } from "@/lib/google/classify-drive-content";
import type { FileRole } from "@/lib/google/file-role";

const ROLE_SUFFIX =
  /\s*(slides?|decks?|lectures?|lecs?|notes?|readings?|handouts?|videos?|recitations?|recs?|pdfs?|pptx?s?|ppts?)\s*$/i;

function cleanTitle(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[_-]+/g, " ").trim();
}

function stripRoleSuffix(name: string): string {
  return name.replace(ROLE_SUFFIX, "").trim();
}

function topicKeyAndTitle(file: DriveEntry): { key: string; title: string } {
  if (file.folderPath.length > 0) {
    const title = file.folderPath[file.folderPath.length - 1]!;
    return { key: file.folderPath.join("/").toLowerCase(), title };
  }
  const title = stripRoleSuffix(cleanTitle(file.name)) || cleanTitle(file.name);
  return { key: title.toLowerCase(), title };
}

export type TopicGroup = {
  title: string;
  order: number;
  videoFiles: DriveEntry[];
  slideFiles: DriveEntry[];
  notesFiles: DriveEntry[];
};

export type QuizLessonRef = {
  title: string;
  order: number;
  file: DriveEntry;
};

export type UnitTopicClassification = {
  topics: TopicGroup[];
  quizzes: QuizLessonRef[];
};

function unitTopicTitle(folderName: string): string {
  return (
    folderName
      .replace(/^lecture\s+\d+\s*[-–—:]\s*/i, "")
      .replace(/^unit\s+\d+\s*[-–—:]\s*/i, "")
      .trim() || folderName
  );
}

function isVideoPlaceholderName(name: string): boolean {
  return /\b(lesson\s*)?(video|recording|lecture\s*video|watch)\b/i.test(name);
}

/**
 * Within one unit folder, groups files into topic lessons (video + slides +
 * notes) and separate quiz lessons.
 *
 * When every file sits directly in the unit folder (no subfolders), the whole
 * unit is one topic — e.g. a lecture folder with slides.pdf + deck.pptx +
 * "Lesson Video" doc all belong together.
 */
export function classifyUnitIntoTopics(
  unit: DriveImportUnit,
  roleByFileId: Map<string, FileRole>,
  duplicateFileIds: Set<string>
): UnitTopicClassification {
  const quizzes: QuizLessonRef[] = [];
  const eligibleFiles = unit.files.filter((file) => {
    if (duplicateFileIds.has(file.id)) return false;
    const role = roleByFileId.get(file.id) ?? "skip";
    return role !== "skip";
  });

  const allDirectInUnit = eligibleFiles.every((f) => f.folderPath.length === 0);

  if (allDirectInUnit && eligibleFiles.length > 0) {
    const title = unitTopicTitle(unit.folderName);
    const group: TopicGroup = {
      title,
      order: 1,
      videoFiles: [],
      slideFiles: [],
      notesFiles: [],
    };

    for (const file of eligibleFiles) {
      const role = roleByFileId.get(file.id)!;
      if (role === "quiz") {
        quizzes.push({ title: cleanTitle(file.name), order: quizzes.length + 1, file });
        continue;
      }
      if (role === "video" || isVideoPlaceholderName(file.name)) group.videoFiles.push(file);
      else if (role === "notes") group.notesFiles.push(file);
      else group.slideFiles.push(file);
    }

    const topics = group.videoFiles.length + group.slideFiles.length + group.notesFiles.length > 0
      ? [group]
      : [];

    return { topics, quizzes };
  }

  const topicMap = new Map<
    string,
    { title: string; videoFiles: DriveEntry[]; slideFiles: DriveEntry[]; notesFiles: DriveEntry[] }
  >();

  const sortedFiles = [...unit.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  for (const file of sortedFiles) {
    if (duplicateFileIds.has(file.id)) continue;
    const role = roleByFileId.get(file.id) ?? "skip";
    if (role === "skip") continue;

    if (role === "quiz") {
      quizzes.push({ title: cleanTitle(file.name), order: quizzes.length + 1, file });
      continue;
    }

    const { key, title } = topicKeyAndTitle(file);
    const group = topicMap.get(key) ?? { title, videoFiles: [], slideFiles: [], notesFiles: [] };
    if (role === "video") group.videoFiles.push(file);
    else if (role === "notes") group.notesFiles.push(file);
    else group.slideFiles.push(file);
    topicMap.set(key, group);
  }

  // Merge orphan video-only topics (e.g. "Lesson Video" doc) into the slide topic.
  mergeOrphanVideoTopics(topicMap);

  const topics: TopicGroup[] = [...topicMap.values()]
    .filter((g) => g.videoFiles.length + g.slideFiles.length + g.notesFiles.length > 0)
    .map((group, index) => ({ ...group, order: index + 1 }));

  return { topics, quizzes };
}

/** Moves video files from small standalone topics into the nearest slide topic. */
function mergeOrphanVideoTopics(
  topicMap: Map<
    string,
    { title: string; videoFiles: DriveEntry[]; slideFiles: DriveEntry[]; notesFiles: DriveEntry[] }
  >
): void {
  const slideTopicKey = [...topicMap.entries()].find(([, g]) => g.slideFiles.length > 0)?.[0];
  if (!slideTopicKey) return;

  const slideTopic = topicMap.get(slideTopicKey)!;

  for (const [key, group] of [...topicMap.entries()]) {
    if (key === slideTopicKey) continue;
    if (group.slideFiles.length === 0 && group.notesFiles.length === 0 && group.videoFiles.length > 0) {
      slideTopic.videoFiles.push(...group.videoFiles);
      topicMap.delete(key);
    }
  }
}

/** Detect duplicate files across a whole import tree. */
export function detectDuplicatesFromUnits(
  units: DriveImportUnit[]
): { duplicates: DriveDuplicate[]; duplicateFileIds: Set<string> } {
  const MIME_PRIORITY: Record<string, number> = {
    "application/pdf": 0,
    "application/vnd.google-apps.presentation": 1,
    "application/vnd.google-apps.document": 2,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": 3,
  };

  const allFiles = units.flatMap((u) => u.files);
  const byBaseName = new Map<string, DriveEntry[]>();

  for (const file of allFiles) {
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().toLowerCase();
    const list = byBaseName.get(base) ?? [];
    list.push(file);
    byBaseName.set(base, list);
  }

  const duplicates: DriveDuplicate[] = [];
  const duplicateFileIds = new Set<string>();

  for (const group of byBaseName.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) =>
        (MIME_PRIORITY[a.mimeType] ?? 10) - (MIME_PRIORITY[b.mimeType] ?? 10) ||
        a.name.localeCompare(b.name)
    );
    const survivor = sorted[0]!;
    for (const dup of sorted.slice(1)) {
      duplicates.push({
        driveFileId: dup.id,
        duplicateOfDriveFileId: survivor.id,
        reason: `Same content as "${survivor.name}".`,
      });
      duplicateFileIds.add(dup.id);
    }
  }

  return { duplicates, duplicateFileIds };
}
