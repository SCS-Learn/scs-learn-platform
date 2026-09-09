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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
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
  key: string
): Promise<TItem[]> {
  const items: TItem[] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batch = ids.slice(i, i + ID_BATCH_SIZE);
    if (batch.length === 0) continue;
    const query = batch.map((id) => `ids[]=${id}`).join("&");
    const payload = await fetchJson<Record<string, TItem[]>>(`${base}/${resource}?${query}`);
    items.push(...(payload[key] ?? []));
  }
  return items;
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
  const unitIds: number[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext && page <= MAX_SECTION_PAGES) {
    const sectionsPayload = await fetchJson<{
      meta?: { has_next?: boolean };
      sections: StepikSection[];
    }>(`${base}/sections?course=${encodeURIComponent(courseId)}&page=${page}`);

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

  if (unitIds.length === 0) {
    return [];
  }

  const units = await fetchByIds<StepikUnit>(base, "units", unitIds, "units");
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

  const lessons = await fetchByIds<StepikLesson>(base, "lessons", lessonIds, "lessons");

  return lessons
    .map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      position: positionByLessonId.get(lesson.id) ?? 0,
    }))
    .sort((a, b) => a.position - b.position);
}
