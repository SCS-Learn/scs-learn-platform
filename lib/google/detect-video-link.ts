// Pure regex, zero LLM: a file whose extracted text is essentially just a
// link to a known video host (a lecture recording shared as a Doc/Slide
// containing nothing but a YouTube/Vimeo/Drive-video link). Anything else
// returns null and the caller treats the file as ordinary slide/document
// content instead.

const VIDEO_URL_PATTERN =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+|vimeo\.com\/\d+|drive\.google\.com\/file\/d\/[\w-]+)\S*/i;

export function detectVideoLink(texts: string[]): string | null {
  const joined = texts.join(" ");
  const match = joined.match(VIDEO_URL_PATTERN);
  if (!match) return null;

  // Only treat this as "the file IS a video link" when there isn't a lot of
  // other text around it - otherwise a lecture slide that merely mentions or
  // cites a video URL among substantial other content would get misrouted
  // into a bare video block instead of being read as slide content.
  const nonUrlText = joined.replace(match[0], "").trim();
  if (nonUrlText.length > 200) return null;

  return match[0];
}
