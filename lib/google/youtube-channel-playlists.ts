import { getYoutubeClient, toYoutubeApiError } from "@/lib/google/youtube-client";
import { fetchYoutubePlaylistVideos, type YoutubePlaylistVideo } from "@/lib/google/youtube-playlist";

export type YoutubeChannelPlaylist = {
  playlistId: string;
  title: string;
};

/** Only reasonably confident, unambiguous forms — anything else asks the instructor for a link we can resolve directly. */
const CHANNEL_ID_PATTERN = /\/channel\/(UC[a-zA-Z0-9_-]{10,})/;
const HANDLE_PATTERN = /\/@([a-zA-Z0-9_.-]+)/;
const USER_PATTERN = /\/user\/([a-zA-Z0-9_-]+)/;
const CUSTOM_PATTERN = /\/c\/([a-zA-Z0-9_-]+)/;
const BARE_CHANNEL_ID_PATTERN = /^UC[a-zA-Z0-9_-]{10,}$/;
const BARE_HANDLE_PATTERN = /^@[a-zA-Z0-9_.-]+$/;

async function resolveChannelId(input: string): Promise<string> {
  const trimmed = input.trim();

  const channelMatch = trimmed.match(CHANNEL_ID_PATTERN) ?? (BARE_CHANNEL_ID_PATTERN.test(trimmed) ? [null, trimmed] : null);
  if (channelMatch) return channelMatch[1]!;

  const youtube = getYoutubeClient();

  const handle = trimmed.match(HANDLE_PATTERN)?.[1] ?? (BARE_HANDLE_PATTERN.test(trimmed) ? trimmed.slice(1) : null);
  if (handle) {
    let response;
    try {
      response = await youtube.channels.list({ part: ["id"], forHandle: `@${handle}` });
    } catch (error) {
      throw toYoutubeApiError(error, `Could not find a YouTube channel for handle "@${handle}".`);
    }
    const id = response.data.items?.[0]?.id;
    if (id) return id;
    throw new Error(`Could not find a YouTube channel for handle "@${handle}".`);
  }

  const userMatch = trimmed.match(USER_PATTERN)?.[1];
  if (userMatch) {
    let response;
    try {
      response = await youtube.channels.list({ part: ["id"], forUsername: userMatch });
    } catch (error) {
      throw toYoutubeApiError(error, `Could not find a YouTube channel for username "${userMatch}".`);
    }
    const id = response.data.items?.[0]?.id;
    if (id) return id;
    throw new Error(`Could not find a YouTube channel for username "${userMatch}".`);
  }

  const customMatch = trimmed.match(CUSTOM_PATTERN)?.[1];
  if (customMatch) {
    throw new Error(
      `Custom YouTube URLs like "/c/${customMatch}" can't be resolved directly — open the channel, copy its "@handle" link instead, or paste the specific playlist link for one unit's videos.`
    );
  }

  throw new Error("That doesn't look like a YouTube channel link.");
}

/** Lists every public playlist on a channel (title + id), paginated. */
export async function fetchChannelPlaylists(channelUrlOrHandle: string): Promise<YoutubeChannelPlaylist[]> {
  const channelId = await resolveChannelId(channelUrlOrHandle);
  const youtube = getYoutubeClient();

  const playlists: YoutubeChannelPlaylist[] = [];
  let pageToken: string | undefined;

  do {
    let response;
    try {
      response = await youtube.playlists.list({
        part: ["snippet"],
        channelId,
        maxResults: 50,
        pageToken,
      });
    } catch (error) {
      throw toYoutubeApiError(error, "That channel could not be found.");
    }

    for (const item of response.data.items ?? []) {
      const title = item.snippet?.title;
      if (!item.id || !title) continue;
      playlists.push({ playlistId: item.id, title });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return playlists;
}

const MAX_CHANNEL_PLAYLISTS = 20;

/**
 * Resolves a channel to its playlists and fetches every video across all of
 * them (each tagged with its source playlist title) — used when a course
 * splits lecture videos across one playlist per unit instead of a single
 * combined playlist.
 */
export async function fetchAllVideosForChannel(
  channelUrlOrHandle: string
): Promise<{ videos: YoutubePlaylistVideo[]; truncated: boolean }> {
  const playlists = await fetchChannelPlaylists(channelUrlOrHandle);
  if (playlists.length === 0) {
    throw new Error("That channel has no public playlists.");
  }

  const truncated = playlists.length > MAX_CHANNEL_PLAYLISTS;
  const selected = playlists.slice(0, MAX_CHANNEL_PLAYLISTS);

  const videos: YoutubePlaylistVideo[] = [];
  for (const playlist of selected) {
    const playlistVideos = await fetchYoutubePlaylistVideos(playlist.playlistId, playlist.title);
    videos.push(...playlistVideos);
  }

  return { videos, truncated };
}
