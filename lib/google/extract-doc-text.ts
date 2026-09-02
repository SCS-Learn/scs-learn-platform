import type JSZip from "jszip";

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Pulls paragraph text from a .docx zip's word/document.xml. */
export async function extractDocParagraphsFromZip(zip: JSZip): Promise<string[]> {
  const docFile = zip.files["word/document.xml"];
  if (!docFile) return [];

  const xml = await docFile.async("text");
  const paragraphs: string[] = [];

  for (const match of xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)) {
    const runs = [...match[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
      .map((m) => decodeXmlEntities(m[1] ?? ""))
      .join("");
    const text = runs.trim();
    if (text) paragraphs.push(text);
  }

  return paragraphs;
}

export function paragraphsToNotesHtml(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
}
