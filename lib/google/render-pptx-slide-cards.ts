import type { SlideText } from "@/lib/google/extract-slide-text";

// v1 fallback for a real (already OOXML) .pptx, which Drive's read-only API
// can't export to PDF or a true rendered image at all (see
// download-drive-file.ts / load-ooxml-zip.ts). Composes each slide's own
// verbatim text (extractSlideTextFromZip) and embedded pictures into a plain
// HTML card - not pixel-faithful to the original slide layout, but zero LLM
// involvement and no elevated Drive scope or server-side rendering infra.
// True visual rendering can replace this later without touching anything
// downstream, since callers only ever see the resulting HTML string.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renders one slide deck's slides into simple HTML cards, one per slide, in
 * slide order. imageUrlBySourcePath maps a slide's own imagePaths (from
 * SlideText) to the URL each image was uploaded to - a path with no entry is
 * skipped rather than broken.
 */
export function renderPptxSlideCards(
  slides: SlideText[],
  imageUrlBySourcePath: Map<string, string>
): string {
  return slides
    .map((slide) => {
      const textHtml = slide.texts.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
      const imageHtml = slide.imagePaths
        .map((path) => imageUrlBySourcePath.get(path))
        .filter((url): url is string => Boolean(url))
        .map((url) => `<img src="${escapeHtml(url)}" alt="Slide ${slide.index} image">`)
        .join("\n");

      return `<section class="slide-card" data-slide-index="${slide.index}">
${textHtml}
${imageHtml}
</section>`;
    })
    .join("\n");
}
