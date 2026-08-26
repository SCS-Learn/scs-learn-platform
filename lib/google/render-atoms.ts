import type { Atom } from "@/lib/google/extract-file-atoms";

type AtomSection = { title: string; atoms: Atom[] };
export type AtomLesson = { title: string; sections: AtomSection[] };

// A single real slide/subsection is usually only 1-3 atoms - way too short
// to read as its own page. Keep bundling whole sections onto the current
// lesson until it clears this many atoms before starting a new one.
const MIN_ATOMS_PER_LESSON = 10;

/**
 * Splits one file's atoms (already in reading order) into dense, page-sized
 * lessons: atoms are first collapsed into contiguous runs sharing the same
 * "section" (one real slide/subsection each), then consecutive sections are
 * bundled together - always cutting at a section boundary, never mid-section
 * - until a lesson has enough atoms to be worth its own page.
 */
export function groupAtomsIntoSlides(atoms: Atom[]): AtomLesson[] {
  const sections: AtomSection[] = [];
  for (const atom of atoms) {
    const title = atom.section?.trim() || atom.title;
    const current = sections[sections.length - 1];
    if (current && current.title === title) {
      current.atoms.push(atom);
    } else {
      sections.push({ title, atoms: [atom] });
    }
  }

  const lessons: AtomLesson[] = [];
  for (const section of sections) {
    const current = lessons[lessons.length - 1];
    if (current && current.sections.reduce((n, s) => n + s.atoms.length, 0) < MIN_ATOMS_PER_LESSON) {
      current.sections.push(section);
    } else {
      lessons.push({ title: section.title, sections: [section] });
    }
  }
  return lessons;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

const ROLE_LABELS: Record<string, string> = {
  motivation: "Why it matters",
  definition: "Definition",
  theorem: "Theorem",
  worked_example: "Example",
  synthesis: "Takeaway",
};

function renderAtom(atom: Atom, assetUrlByAtomId: Map<string, string>): string {
  switch (atom.modality) {
    case "figure": {
      const url = assetUrlByAtomId.get(atom.id);
      if (!url) return "";
      const caption = atom.altText ?? atom.title;
      return `<figure><img src="${escapeHtmlAttr(url)}" alt="${escapeHtmlAttr(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
    }
    case "equation": {
      const latex = atom.latex ?? atom.content;
      return `<div data-type="math-block" data-latex="${escapeHtmlAttr(latex)}">${escapeHtml(latex)}</div>`;
    }
    case "code":
      return `<pre><code>${escapeHtml(atom.content)}</code></pre>`;
    case "question":
      return `<p><strong>Question:</strong> ${escapeHtml(atom.question ?? atom.content)}</p>`;
    default: {
      const label = ROLE_LABELS[atom.role];
      const body = escapeHtml(atom.content);
      return `<p>${label ? `<strong>${label}:</strong> ` : ""}${body}</p>`;
    }
  }
}

/** Renders one lesson's atoms, grouped by groupAtomsIntoSlides, back into per-section HTML with a heading between sections after the first. */
export function renderAtomsToHtml(lesson: AtomLesson, assetUrlByAtomId: Map<string, string>): string {
  return lesson.sections
    .map((section, index) => {
      const heading = index > 0 ? `<h3>${escapeHtml(section.title)}</h3>` : "";
      const body = section.atoms.map((atom) => renderAtom(atom, assetUrlByAtomId)).filter(Boolean).join("\n");
      return heading ? `${heading}\n${body}` : body;
    })
    .filter(Boolean)
    .join("\n");
}
