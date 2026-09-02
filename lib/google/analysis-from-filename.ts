import type { DriveFileAnalysis, DriveFileCategory } from "@/lib/google/analyze-drive-file";

const QUIZ_PATTERN =
  /\b(hw|homework|quiz|exam|problem|pset|assignment|assessment|questions?|problems?)\b/i;

function cleanFilenameTitle(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[_-]+/g, " ").trim();
}

function categoryFromFilename(name: string): DriveFileCategory {
  const lower = name.toLowerCase();
  if (QUIZ_PATTERN.test(lower)) {
    return /\b(practice|problem)\b/i.test(lower) ? "practice_problems" : "homework";
  }
  if (/\b(slide|deck|lecture|lec)\b/i.test(lower)) return "slides";
  if (/\b(reading|paper|article)\b/i.test(lower)) return "reading";
  return "lecture";
}

/** Filename-derived metadata for the organize import path — no LLM, no PDF reads. */
export function analysisFromFilename(
  fileName: string,
  isCourseContent: boolean,
  notCourseContentReason = ""
): DriveFileAnalysis {
  const category = categoryFromFilename(fileName);
  const type = category === "homework" || category === "practice_problems" ? "quiz" : "lesson";
  return {
    title: cleanFilenameTitle(fileName),
    type,
    category,
    topicSummary: "",
    isCourseContent,
    notCourseContentReason: isCourseContent ? "" : notCourseContentReason,
  };
}
