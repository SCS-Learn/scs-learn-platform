import type JSZip from "jszip";
import type { drive_v3 } from "googleapis";
import { loadOoxmlZip } from "@/lib/google/load-ooxml-zip";

export type SlideText = { index: number; texts: string[]; imagePaths: string[] };

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTextRuns(xml: string): string[] {
  return [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
    .map((match) => decodeXmlEntities(match[1]))
    .filter((text) => text.trim().length > 0);
}

function slideNumber(path: string): number | null {
  const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : null;
}

/** Resolves a rels Target (relative to ppt/slides/, may start with "../") to a path from the zip root, e.g. "../media/image5.png" -> "ppt/media/image5.png". */
function resolveRelsTarget(target: string): string {
  const parts = ["ppt", "slides"];
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

/** Every media path a slide's own relationships file says it embeds - this is how a specific image gets attributed to the specific slide it's actually on, instead of an arbitrary whole-file scan. */
function extractImagePaths(relsXml: string): string[] {
  const paths: string[] = [];
  for (const tag of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const typeMatch = tag[0].match(/Type="([^"]*)"/);
    const targetMatch = tag[0].match(/Target="([^"]*)"/);
    if (!typeMatch || !targetMatch || !/\/image$/.test(typeMatch[1])) continue;
    paths.push(resolveRelsTarget(targetMatch[1]));
  }
  return paths;
}

/** Pulls slide titles/captions/speaker notes/embedded-image paths out of an already-loaded presentation zip - shared by callers that already have the zip open, so they don't fetch the file twice. */
export async function extractSlideTextFromZip(zip: JSZip): Promise<SlideText[]> {
  const slides: SlideText[] = [];
  for (const path of Object.keys(zip.files)) {
    const index = slideNumber(path);
    if (index === null) continue;

    const texts = extractTextRuns(await zip.files[path].async("text"));

    const notesFile = zip.files[`ppt/notesSlides/notesSlide${index}.xml`];
    const notesTexts = notesFile ? extractTextRuns(await notesFile.async("text")) : [];

    const relsFile = zip.files[`ppt/slides/_rels/slide${index}.xml.rels`];
    const imagePaths = relsFile ? extractImagePaths(await relsFile.async("text")) : [];

    slides.push({
      index,
      texts: notesTexts.length > 0 ? [...texts, ...notesTexts.map((note) => `[speaker note] ${note}`)] : texts,
      imagePaths,
    });
  }
  return slides.sort((a, b) => a.index - b.index);
}

/**
 * Fallback for when a file can't be turned into a PDF at all - a real
 * (already Office Open XML) .pptx uploaded as-is, which Drive's export API
 * can't convert (that only works on Google-native Slides files). Reads
 * titles/captions/speaker notes straight out of the deck's own slide XML, so
 * a visually-driven deck (hand-drawn diagrams, few words) still gets real
 * text to analyze instead of nothing - the actual drawings still come
 * through separately as extracted images.
 */
export async function extractSlideText(
  drive: drive_v3.Drive,
  file: { id: string; mimeType: string },
  resourceKeyHeader?: string
): Promise<SlideText[]> {
  try {
    const zip = await loadOoxmlZip(drive, file, resourceKeyHeader);
    if (!zip) return [];
    return await extractSlideTextFromZip(zip);
  } catch {
    return [];
  }
}
