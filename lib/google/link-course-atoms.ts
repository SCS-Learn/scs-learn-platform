import Anthropic from "@anthropic-ai/sdk";
import type { Atom } from "@/lib/google/extract-file-atoms";
import type { DriveClassification } from "@/lib/google/classify-drive-content";

/** One atom placed in whole-course order, with its concept labels normalized against the rest of the course and its prerequisite atoms resolved - possibly across files. */
export type CourseAtom = {
  courseAtomId: string;
  order: number;
  sourceFileId: string;
  sourceFileName: string;
  atom: Atom;
  canonicalConcepts: string[];
  crossFileDependsOn: string[];
};

const LINK_SCHEMA = {
  type: "object",
  properties: {
    atoms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          courseAtomId: { type: "string" },
          canonicalConcepts: { type: "array", items: { type: "string" } },
          crossFileDependsOn: { type: "array", items: { type: "string" } },
        },
        required: ["courseAtomId", "canonicalConcepts", "crossFileDependsOn"],
        additionalProperties: false,
      },
    },
  },
  required: ["atoms"],
  additionalProperties: false,
};

function orderAtoms(
  classification: DriveClassification,
  atomsByFileId: Map<string, Atom[]>,
  fileNameById: Map<string, string>
): CourseAtom[] {
  const orderedFileIds: string[] = [];
  for (const unit of [...classification.units].sort((a, b) => a.order - b.order)) {
    for (const lesson of [...unit.lessons].sort((a, b) => a.order - b.order)) {
      orderedFileIds.push(lesson.driveFileId);
    }
  }
  // Files the classifier couldn't place still get their atoms linked - just
  // ranked after everything classified, so they can never look like a
  // prerequisite for content that actually runs earlier in the course.
  for (const fileId of atomsByFileId.keys()) {
    if (!orderedFileIds.includes(fileId)) orderedFileIds.push(fileId);
  }

  const courseAtoms: CourseAtom[] = [];
  let order = 0;
  for (const fileId of orderedFileIds) {
    for (const atom of atomsByFileId.get(fileId) ?? []) {
      courseAtoms.push({
        courseAtomId: `atom_${String(order).padStart(4, "0")}`,
        order,
        sourceFileId: fileId,
        sourceFileName: fileNameById.get(fileId) ?? fileId,
        atom,
        canonicalConcepts: atom.concepts,
        crossFileDependsOn: [],
      });
      order += 1;
    }
  }
  return courseAtoms;
}

/**
 * Stage 3 of the atom pipeline: places every file's atoms into one course-wide
 * sequence (unit order, then lesson order, then each file's own reading
 * order), then asks Claude to canonicalize concept labels across the whole
 * course and link each atom to the *earlier* atoms it builds on - which may
 * come from an earlier file, not just earlier in the same file. Falls back to
 * unlinked (but still ordered) atoms if the linking call fails, so one bad
 * call never drops the atoms themselves.
 */
export async function linkCourseAtoms(
  course: { title: string; department: string },
  classification: DriveClassification,
  atomsByFileId: Map<string, Atom[]>,
  fileNameById: Map<string, string>
): Promise<CourseAtom[]> {
  const courseAtoms = orderAtoms(classification, atomsByFileId, fileNameById);
  if (courseAtoms.length === 0) return courseAtoms;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: LINK_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `You are linking atoms already extracted from every file in the course "${course.title}" (${course.department}). They are listed below in course-flow order (the order units and lessons actually run in) - an atom later in this list is taught later in the course than one earlier in the list.

For each atom, report:
- "courseAtomId": copy it back unchanged, exactly as given.
- "canonicalConcepts": rewrite its "concepts" into a small set of canonical, course-wide concept names - reuse the exact same canonical name for atoms from different files that are really about the same idea, even if their local wording differs.
- "crossFileDependsOn": the "courseAtomId"s of EARLIER atoms in this list only (never later ones, never itself) that this atom directly builds on, because this atom's concepts/prerequisites were first properly introduced there - across files where relevant, not just within the same file. Keep this to real, direct dependencies (usually 0-3); empty array if standalone or if nothing earlier actually covers its prerequisites.

Atoms (JSON, course-flow order):
${JSON.stringify(
  courseAtoms.map((c) => ({
    courseAtomId: c.courseAtomId,
    sourceFileName: c.sourceFileName,
    title: c.atom.title,
    role: c.atom.role,
    modality: c.atom.modality,
    concepts: c.atom.concepts,
    prerequisites: c.atom.prerequisites,
  })),
  null,
  2
)}`,
        },
      ],
    }, { timeout: 2 * 60 * 1000 });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return courseAtoms;
    const parsed = JSON.parse(textBlock.text) as {
      atoms: { courseAtomId: string; canonicalConcepts: string[]; crossFileDependsOn: string[] }[];
    };

    const orderById = new Map(courseAtoms.map((c) => [c.courseAtomId, c.order]));
    const linkedById = new Map(parsed.atoms.map((a) => [a.courseAtomId, a]));

    return courseAtoms.map((courseAtom) => {
      const linked = linkedById.get(courseAtom.courseAtomId);
      if (!linked) return courseAtom;
      // Defensive: never let a bad response make an atom "depend on" itself or something taught later.
      const validDependsOn = linked.crossFileDependsOn.filter((id) => {
        const depOrder = orderById.get(id);
        return depOrder !== undefined && depOrder < courseAtom.order;
      });
      return {
        ...courseAtom,
        canonicalConcepts: linked.canonicalConcepts.length > 0 ? linked.canonicalConcepts : courseAtom.canonicalConcepts,
        crossFileDependsOn: validDependsOn,
      };
    });
  } catch {
    return courseAtoms;
  }
}
