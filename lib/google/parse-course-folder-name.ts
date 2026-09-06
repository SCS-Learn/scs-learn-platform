/** CMU-style course codes, e.g. 02-251, 15-122, 10-601, 67-262A */
const CMU_COURSE_CODE = /\d{2}-\d{3}[A-Za-z]?/;

function cleanTitle(title: string): string {
  return title.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Derives course code and title from a Google Drive folder name.
 * Expects names like "02-251 Introduction to Bioinformatics" or "02-251 - Intro to Bio".
 */
export function parseCourseFolderName(folderName: string): { code: string; title: string } {
  const trimmed = folderName.trim();
  if (!trimmed) {
    throw new Error("That Drive folder has no name.");
  }

  const leadingMatch = trimmed.match(
    new RegExp(`^(${CMU_COURSE_CODE.source})\\s*(?:[-_:–—|,]\\s*|\\s+)(.+)$`)
  );
  if (leadingMatch) {
    return { code: leadingMatch[1], title: cleanTitle(leadingMatch[2]) };
  }

  if (new RegExp(`^${CMU_COURSE_CODE.source}$`).test(trimmed)) {
    return { code: trimmed, title: trimmed };
  }

  const anywhereMatch = trimmed.match(CMU_COURSE_CODE);
  if (anywhereMatch) {
    const code = anywhereMatch[0];
    const title = cleanTitle(
      trimmed
        .replace(code, "")
        .replace(/^[\s\-_:–—|,]+|[\s\-_:–—|,]+$/g, "")
    );
    if (title) return { code, title };
    return { code, title: trimmed };
  }

  throw new Error(
    `Couldn't find a course code in the folder name "${trimmed}". Name your Drive folder like "02-251 Introduction to Bioinformatics".`
  );
}
