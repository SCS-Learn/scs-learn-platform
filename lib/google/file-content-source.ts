import type { SlideText } from "@/lib/google/extract-slide-text";

/** What analyzeDriveFileContent/extractFileAtoms read a file from - a real PDF, or (when no PDF could be produced) text pulled straight from a slide deck's own XML. */
export type FileContentSource = { kind: "pdf"; pdfBase64: string } | { kind: "slideText"; slides: SlideText[] };

export function buildSourceContentBlock(
  source: FileContentSource
):
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "text"; text: string } {
  if (source.kind === "pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: source.pdfBase64 },
    };
  }

  const body = source.slides
    .map(
      (slide) =>
        `Slide ${slide.index}:\n${slide.texts.length > 0 ? slide.texts.join("\n") : "(no extractable text on this slide)"}`
    )
    .join("\n\n");

  return {
    type: "text",
    text: `This file couldn't be converted to a PDF, so here is the raw text pulled directly out of the slide deck's own XML - titles, captions, and speaker notes only. Any actual drawings, diagrams, or photos on the slides are NOT in this text; they're attached separately below as images.\n\n${body}`,
  };
}
