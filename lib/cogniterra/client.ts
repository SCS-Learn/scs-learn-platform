import { getCogniterraAccessToken } from "@/lib/cogniterra/oauth-client";

/**
 * A direct (non-LTI) browsable URL for a Cogniterra lesson. Cogniterra's LTI
 * launch does not reliably honor the custom_lesson deep-link param - it
 * lands on the course's own first lesson regardless - while this same
 * lesson id reliably opens the right content when visited directly. Used as
 * a fallback link alongside the LTI iframe until that's resolved on
 * Cogniterra's end.
 */
export function cogniterraLessonUrl(cogniterraLessonId: string | number): string {
  return `https://cogniterra.org/lesson/${cogniterraLessonId}/`;
}

export type CogniterraLesson = {
  id: number;
  title: string;
  position: number;
};

type StepikSection = {
  id: number;
  course?: number;
  position: number;
  units: number[];
};

type StepikCourse = {
  id: number;
  sections?: number[];
};

type StepikUnit = {
  id: number;
  lesson: number;
  position: number;
};

type StepikLesson = {
  id: number;
  title: string;
};

const DEFAULT_API_BASE = "https://cogniterra.org/api";
const MAX_SECTION_PAGES = 50;
const ID_BATCH_SIZE = 40;

function apiBaseUrl(): string {
  return (process.env.COGNITERRA_API_URL ?? DEFAULT_API_BASE).replace(/\/+$/, "");
}

async function fetchJson<T>(url: string, accessToken: string | null): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    // An authenticated request's result depends on who's asking - never cache
    // it across instructors/requests the way the anonymous, public-only case
    // safely can.
    ...(accessToken ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
  });
  if (!response.ok) {
    throw new Error(`Cogniterra API ${response.status}: ${url}`);
  }
  return response.json() as Promise<T>;
}

async function fetchByIds<TItem>(
  base: string,
  resource: string,
  ids: number[],
  key: string,
  accessToken: string | null
): Promise<TItem[]> {
  const items: TItem[] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batch = ids.slice(i, i + ID_BATCH_SIZE);
    if (batch.length === 0) continue;
    const query = batch.map((id) => `ids[]=${id}`).join("&");
    const payload = await fetchJson<Record<string, TItem[]>>(`${base}/${resource}?${query}`, accessToken);
    items.push(...(payload[key] ?? []));
  }
  return items;
}

/**
 * The course's own `sections` field is the authoritative list - fetching it
 * directly (works once authenticated, even for a private course) sidesteps
 * `/api/sections?course=` entirely, which the fallback below documents as
 * unreliable. Null means the course endpoint itself failed (not
 * authenticated and/or no access) - caller falls back to the paginated scan.
 */
async function fetchCourseSectionIds(
  base: string,
  courseId: string,
  accessToken: string | null
): Promise<number[] | null> {
  try {
    const payload = await fetchJson<{ courses?: StepikCourse[] }>(
      `${base}/courses/${encodeURIComponent(courseId)}`,
      accessToken
    );
    return payload.courses?.[0]?.sections ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches lessons from a Cogniterra course via the Stepik-compatible JSON API.
 *
 * Important: section.units are *unit* ids, not lesson ids — we resolve units → lessons.
 * Some courses are not publicly enumerable; callers should fall back to course-level LTI
 * when this returns an empty list.
 */
export async function fetchCogniterraLessons(courseId: string): Promise<CogniterraLesson[]> {
  const base = apiBaseUrl();
  const courseIdNum = Number(courseId);
  // Anonymous calls silently can't see a private course's own sections at
  // all (Cogniterra returns unrelated public catalog noise instead) - when
  // the instructor has connected their Cogniterra account, ask as them
  // instead, which can see whatever that account can see.
  const accessToken = await getCogniterraAccessToken();
  const unitIds: number[] = [];

  const sectionIds = await fetchCourseSectionIds(base, courseId, accessToken);

  if (sectionIds && sectionIds.length > 0) {
    const sections = await fetchByIds<StepikSection>(base, "sections", sectionIds, "sections", accessToken);
    for (const section of [...sections].sort((a, b) => a.position - b.position)) {
      for (const unitId of section.units ?? []) {
        unitIds.push(unitId);
      }
    }
  } else if (sectionIds === null) {
    // Course endpoint itself failed (no access at all, or not authenticated
    // and the course is private) - fall back to the old paginated scan,
    // which at least still works for a genuinely public course.
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= MAX_SECTION_PAGES) {
      const sectionsPayload = await fetchJson<{
        meta?: { has_next?: boolean };
        sections: StepikSection[];
      }>(`${base}/sections?course=${encodeURIComponent(courseId)}&page=${page}`, accessToken);

      const pageSections = sectionsPayload.sections ?? [];
      let matchedThisPage = 0;

      for (const section of [...pageSections].sort((a, b) => a.position - b.position)) {
        // Cogniterra sometimes ignores the course filter and returns mixed sections —
        // only keep rows that belong to this course.
        if (section.course != null && Number(section.course) !== courseIdNum) {
          continue;
        }
        matchedThisPage += 1;
        for (const unitId of section.units ?? []) {
          unitIds.push(unitId);
        }
      }

      // Private / unlistable courses: first page is unrelated catalog noise — stop.
      if (page === 1 && matchedThisPage === 0 && pageSections.length > 0) {
        break;
      }

      hasNext = Boolean(sectionsPayload.meta?.has_next);
      page += 1;
    }
  }
  // sectionIds is an empty array: a real course with zero sections - nothing to do.

  if (unitIds.length === 0) {
    return [];
  }

  const units = await fetchByIds<StepikUnit>(base, "units", unitIds, "units", accessToken);
  const lessonIds: number[] = [];
  const positionByLessonId = new Map<number, number>();
  let order = 0;
  const unitById = new Map(units.map((u) => [u.id, u]));

  for (const unitId of unitIds) {
    const unit = unitById.get(unitId);
    if (!unit?.lesson) continue;
    if (positionByLessonId.has(unit.lesson)) continue;
    order += 1;
    lessonIds.push(unit.lesson);
    positionByLessonId.set(unit.lesson, order);
  }

  if (lessonIds.length === 0) {
    return [];
  }

  const lessons = await fetchByIds<StepikLesson>(base, "lessons", lessonIds, "lessons", accessToken);

  return lessons
    .map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      position: positionByLessonId.get(lesson.id) ?? 0,
    }))
    .sort((a, b) => a.position - b.position);
}
