import { PDFDocument } from "pdf-lib";
import type { FileContentSource } from "@/lib/google/file-content-source";

// Title, category, and topic almost always show up in a file's opening
// pages/slides - analyzeDriveFileContent only needs enough to name those,
// not the whole file. extractFileAtoms decomposes every page for real, so
// it must keep getting the untruncated source; only pass the result of this
// through to analyzeDriveFileContent.
const MAX_CLASSIFICATION_PAGES = 8;
const MAX_CLASSIFICATION_SLIDES = 8;
const MAX_CLASSIFICATION_CHARS = 6000;

async function truncatePdfBase64(pdfBase64: string, maxPages: number): Promise<string> {
  try {
    const srcDoc = await PDFDocument.load(Buffer.from(pdfBase64, "base64"), { ignoreEncryption: true });
    if (srcDoc.getPageCount() <= maxPages) return pdfBase64;

    const truncated = await PDFDocument.create();
    const pages = await truncated.copyPages(srcDoc, Array.from({ length: maxPages }, (_, i) => i));
    for (const page of pages) truncated.addPage(page);
    return Buffer.from(await truncated.save()).toString("base64");
  } catch {
    // A PDF pdf-lib can't parse (encrypted, malformed) still deserves a
    // classification attempt - fall back to reading the whole thing rather
    // than failing the file outright.
    return pdfBase64;
  }
}

/**
 * Trims a file's content down to roughly its first pages/slides - enough for
 * analyzeDriveFileContent to name what a file is without paying to read all
 * of it.
 */
export async function truncateSourceForClassification(source: FileContentSource): Promise<FileContentSource> {
  if (source.kind === "pdf") {
    return { kind: "pdf", pdfBase64: await truncatePdfBase64(source.pdfBase64, MAX_CLASSIFICATION_PAGES) };
  }
  if (source.kind === "slideText") {
    return { kind: "slideText", slides: source.slides.slice(0, MAX_CLASSIFICATION_SLIDES) };
  }
  return { kind: "plainText", text: source.text.slice(0, MAX_CLASSIFICATION_CHARS) };
}
