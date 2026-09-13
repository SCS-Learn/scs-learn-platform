import { getYoutubeClient, toYoutubeApiError } from "@/lib/google/youtube-client";

export type YoutubePlaylistVideo = {
  videoId: string;
  title: string;
  description: string;
  position: number;
  /** Title of the playlist this video came from, when fetched via a channel (null for a direct playlist link). */
  playlistTitle: string | null;
};

const PLAYLIST_ID_PATTERNS = [/[?&]list=([a-zA-Z0-9_-]+)/];
/** Common playlist id prefixes (uploads, likes, watch-later, and regular playlists). */
const BARE_PLAYLIST_ID_PATTERN = /^(PL|UU|LL|FL|OL|RD)[a-zA-Z0-9_-]{10,}$/;

/** True when the input names a single playlist rather than a channel. */
export function looksLikePlaylistReference(input: string): boolean {
  const trimmed = input.trim();
  return PLAYLIST_ID_PATTERNS.some((p) => p.test(trimmed)) || BARE_PLAYLIST_ID_PATTERN.test(trimmed);
}

/** Accepts a full YouTube playlist URL (playlist?list=... or watch?v=...&list=...) or a bare playlist id. */
export function parseYoutubePlaylistUrl(input: string): string {
  const trimmed = input.trim();
  for (const pattern of PLAYLIST_ID_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1]!;
  }
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  throw new Error("That doesn't look like a YouTube playlist link");
}

/** Fetches every video in a public/unlisted YouTube playlist, in playlist order. */
export async function fetchYoutubePlaylistVideos(
  playlistUrlOrId: string,
  playlistTitle: string | null = null
): Promise<YoutubePlaylistVideo[]> {
  const playlistId = parseYoutubePlaylistUrl(playlistUrlOrId);
  const youtube = getYoutubeClient();

  const videos: YoutubePlaylistVideo[] = [];
  let pageToken: string | undefined;

  do {
    let response;
    try {
      response = await youtube.playlistItems.list({
        part: ["snippet"],
        playlistId,
        maxResults: 50,
        pageToken,
      });
    } catch (error) {
      throw toYoutubeApiError(
        error,
        "That playlist could not be found — check the link, and that the playlist is public or unlisted."
      );
    }

    for (const item of response.data.items ?? []) {
      const snippet = item.snippet;
      const videoId = snippet?.resourceId?.videoId;
      if (!videoId || !snippet?.title) continue;
      if (snippet.title === "Deleted video" || snippet.title === "Private video") continue;
      videos.push({
        videoId,
        title: snippet.title,
        description: snippet.description ?? "",
        position: snippet.position ?? videos.length,
        playlistTitle,
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return videos.sort((a, b) => a.position - b.position);
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

const VIDEO_ID_PATTERNS = [
  /[?&]v=([a-zA-Z0-9_-]{11})/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /\/embed\/([a-zA-Z0-9_-]{11})/,
];

/** Pulls the video id out of any common YouTube URL form (watch/youtu.be/embed); null if it's not a recognizable YouTube link. */
export function extractYoutubeVideoId(url: string): string | null {
  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1]!;
  }
  return null;
}
