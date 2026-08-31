// Deterministic (no LLM) per-page text extraction from a PDF's own text
// layer - the PDF-shaped sibling of extract-slide-text.ts's OOXML slide-XML
// reader. Used by the organize pipeline so a quiz/assignment's question text
// can be stored verbatim instead of re-typed by a model.

export type PdfPageText = { index: number; texts: string[]; hasTextLayer: boolean };

/**
 * Reads every page's embedded text objects straight out of the PDF, in
 * reading order, top-to-bottom. hasTextLayer is false for a scanned/rasterized
 * page with nothing extractable - the caller falls back to LLM transcription
 * only for those pages, and marks the result accordingly rather than treating
 * it as guaranteed-verbatim.
 */
export async function extractPdfPageText(pdfBase64: string): Promise<PdfPageText[]> {
  // pdfjs-dist's legacy Node build avoids the worker/DOM APIs the standard
  // build assumes are present - this runs server-side only, in a Next.js
  // server action/route handler, never a browser.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = Buffer.from(pdfBase64, "base64");
  const loadingTask = getDocument({ data });
  const doc = await loadingTask.promise;

  const pages: PdfPageText[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    // pdf.js hands back one item per text run, in the order the PDF's
    // content stream draws them - not always strict top-to-bottom (a PDF can
    // draw out of visual order), but it's the closest thing to "reading
    // order" available without laying out every glyph's bounding box.
    const lines: string[] = [];
    let currentLine = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 1 && currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = "";
      }
      currentLine += item.str + (item.hasEOL ? "\n" : "");
      lastY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    const texts = lines.filter((line) => line.length > 0);
    pages.push({ index: pageNumber, texts, hasTextLayer: texts.length > 0 });
    page.cleanup();
  }

  await loadingTask.destroy();
  return pages;
}
