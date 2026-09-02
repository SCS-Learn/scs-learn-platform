import type { DriveEntry } from "@/lib/google/drive-traversal";

export type FileRole = "video" | "slides" | "notes" | "quiz" | "skip";

type ResolvedRouting = "video" | "google_slides" | "slide_pdf" | "slide_cards" | "unsupported";

const QUIZ_PATTERN = /\b(hw|homework|quiz|exam|pset|assignment|assessment|problem\s*set)\b/i;
const NOTES_PATTERN = /\b(notes?|reading|handout|worksheet|summary|transcript)\b/i;
const SLIDES_PATTERN = /\b(slides?|deck|lecture|lec|presentation|ppt)\b/i;
/** Docs/files whose primary purpose is pointing at a lecture recording. */
const VIDEO_NAME_PATTERN = /\b(lesson\s*)?(video|recording|lecture\s*video|watch)\b/i;

const DOC_MIMES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const SLIDE_MIMES = new Set([
  "application/pdf",
  "application/vnd.google-apps.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** Classifies a Drive file's role within a topic lesson — no LLM. */
export function classifyFileRole(
  file: DriveEntry,
  routing: ResolvedRouting,
  isCourseContent: boolean
): FileRole {
  if (!isCourseContent || routing === "unsupported") return "skip";
  if (routing === "video") return "video";

  const lower = file.name.toLowerCase();
  if (QUIZ_PATTERN.test(lower)) return "quiz";
  if (VIDEO_NAME_PATTERN.test(lower)) return "video";
  if (NOTES_PATTERN.test(lower)) return "notes";
  if (DOC_MIMES.has(file.mimeType)) return "notes";

  if (routing === "google_slides" || routing === "slide_cards") return "slides";
  if (routing === "slide_pdf") {
    if (NOTES_PATTERN.test(lower)) return "notes";
    if (SLIDES_PATTERN.test(lower)) return "slides";
    // Ambiguous PDF — default to slides (lecture deck) unless named like notes.
    return "slides";
  }

  return "skip";
}
