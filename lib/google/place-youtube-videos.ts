import Anthropic from "@anthropic-ai/sdk";
import type { YoutubePlaylistVideo } from "@/lib/google/youtube-playlist";

export type YoutubeExistingTopic = { id: string; title: string; hasVideo: boolean };
export type YoutubeExistingUnit = { id: string; title: string; topics: YoutubeExistingTopic[] };

export type YoutubeNewUnit = { key: string; title: string; insertAfterUnitId: string | null };

export type YoutubeVideoPlacement = {
  videoId: string;
  /** An existing unit's id, or one of the declared newUnits[].key values. */
  unitRef: string;
  /** An existing topic's id within that unit (only when it has no video yet), or null for a new topic. */
  existingTopicId: string | null;
  /** Required when existingTopicId is null. */
  newTopicTitle: string | null;
  /** For a new topic in a unit that already has topics: the existing topic it comes right after, or null to lead. Ignored for a brand-new unit (those are ordered by real playlist position instead) and when reusing an existing topic. */
  insertAfterTopicId: string | null;
};

export type YoutubePlacementResult = {
  newUnits: YoutubeNewUnit[];
  placements: YoutubeVideoPlacement[];
};

/**
 * Videos per Opus call. Keeping each call small is the actual fix for
 * duplicate/inconsistent units — a single call asked to organize 100+ videos
 * at once was not internally consistent (it would independently "invent" the
 * same conceptual unit twice, under two different keys, since it has nothing
 * concrete to anchor repeat mentions against). Below this size a model
 * reliably tracks "have I already created this."
 */
const GROUP_SIZE = 20;

const PLACEMENT_SCHEMA = {
  type: "object",
  properties: {
    newUnits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          insertAfterUnitId: { type: "string" },
        },
        required: ["key", "title", "insertAfterUnitId"],
        additionalProperties: false,
      },
    },
    placements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          videoId: { type: "string" },
          unitRef: { type: "string" },
          existingTopicId: { type: "string" },
          newTopicTitle: { type: "string" },
          insertAfterTopicId: { type: "string" },
        },
        required: ["videoId", "unitRef", "existingTopicId", "newTopicTitle", "insertAfterTopicId"],
        additionalProperties: false,
      },
    },
  },
  required: ["newUnits", "placements"],
  additionalProperties: false,
};

function placementPrompt(groupLabel: string | null): string {
  const groupHint = groupLabel
    ? `\n\nAll of the videos below come from the same YouTube playlist, titled "${groupLabel}". Treat this as a strong — usually decisive — signal that they belong together in ONE course unit (professors commonly use one playlist per unit). Only split them across more than one unit if their content clearly spans genuinely distinct, unrelated topics despite being grouped together.`
    : "";

  return `You are placing lecture videos from YouTube into a course's structure of units and topics (individual lectures within a unit). The goal is a course where videos are interleaved with the readings/slides/homework that already exist on the same topic, not a course with a handful of long, video-only units bolted on separately.

The existing course structure below gives every unit and topic a stable "id". You must reference an existing unit or topic ONLY by copying its id verbatim — never by retyping its title. If you need a unit or topic that doesn't already exist, declare it EXACTLY ONCE and reference that same declaration for every video that belongs there. Never re-describe or re-declare something that already exists (existing or freshly declared in this same response) — that creates a duplicate, which is the single most important mistake to avoid.${groupHint}

Step 1 — declare new units, only for units that don't already exist among the given ids. For each one, add ONE entry to "newUnits":
- key: a short id you invent (e.g. "n1", "n2", ...), unique among your own newUnits and never equal to an existing unit id.
- title: the unit's title.
- insertAfterUnitId: the id of the EXISTING unit (copied verbatim from the ids given) that this new unit's content comes right after in the course's overall sequence — or "" if it belongs before every existing unit. Never reference another new unit's key here, only an existing unit's id.
If two or more videos belong in the same new unit, declare it ONCE and have every one of those videos' placements use the same key.

Step 2 — for each video that is clearly a lecture recording belonging in this course, add ONE entry to "placements":
- videoId: copied verbatim from the video list.
- unitRef: the id of an EXISTING unit (copied verbatim), OR the key of one of your own newUnits entries from Step 1.
- existingTopicId: the id of an EXISTING topic within that unit that does NOT already have a video (copied verbatim) — or "" if no existing topic fits and this video needs a new one.
- newTopicTitle: required (non-empty) when existingTopicId is "" — a short title for the new topic, based on the video's own title. Leave "" when existingTopicId is set.
- insertAfterTopicId: only relevant when existingTopicId is "" AND the chosen unit already has other topics — the id of the EXISTING topic (within that same unit) this new one's content comes right after, so it slots in near related material instead of at the very end. Leave "" to place it before all existing topics, or when the unit has no existing topics at all.

Rules:
- NEVER reference an existing topic whose hasVideo is true.
- Prefer an existing unit/topic whenever a reasonable one exists. Judge fit by actual subject matter, not literal wording — a video's own title rarely matches an existing unit/topic title verbatim, so infer the underlying topic from lecture numbering, keyword overlap, and general subject-matter closeness rather than requiring a near-exact match. Treat inventing a new unit as a last resort, not a default: a video that's merely titled differently from an existing unit still belongs there if it's genuinely about the same subject.
- Do NOT invent one new unit as a generic catch-all for several videos just because none of them matched an existing unit perfectly. Judge each video's placement independently; only reuse the same newUnits key for multiple videos when they are really the same specific new topic that belongs together (e.g. consecutive lectures on one topic the existing course material never covered at all).
- A cumulative/final course review, final-exam review, or end-of-course wrap-up video — one that revisits material across the whole course rather than one specific topic — almost never fits an existing topical unit or topic. Give it its own new unit and set that unit's insertAfterUnitId to the LAST id among the existing units given below, so it lands at the very end of the course. Do not place it by topic keyword overlap the way you would a normal lecture video.
- Use lecture numbering and title/keyword overlap to judge fit within the chosen unit.
- Skip videos that are not lecture content for this course (trailers, welcome/intro messages, administrative announcements, office hours, unrelated playlists on the same channel, etc.), or that you aren't confident about — do not guess.
- Each existing topic receives at most one video; each video is placed at most once.
- Empty "placements" (and "newUnits") is correct if nothing here belongs in this course.`;
}

/** One Opus call, scoped to a single small group of videos (see GROUP_SIZE). */
async function placeVideoGroup(
  course: { title: string; department: string },
  groupVideos: YoutubePlaylistVideo[],
  groupLabel: string | null,
  existingUnits: YoutubeExistingUnit[]
): Promise<YoutubePlacementResult> {
  const client = new Anthropic();

  const payloadVideos = groupVideos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    description: v.description.slice(0, 300),
  }));

  const response = await client.messages.create(
    {
      model: "claude-opus-5",
      max_tokens: 8000,
      output_config: { format: { type: "json_schema", schema: PLACEMENT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `${placementPrompt(groupLabel)}\n\nCourse: "${course.title}" (${course.department})\n\nExisting course structure (JSON):\n${JSON.stringify(existingUnits, null, 2)}\n\nVideos to place (JSON):\n${JSON.stringify(payloadVideos, null, 2)}`,
        },
      ],
    },
    { timeout: 3 * 60 * 1000 }
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      `YouTube video placement returned no text content (stop_reason: ${response.stop_reason ?? "unknown"})`
    );
  }

  const raw = JSON.parse(textBlock.text) as {
    newUnits?: { key: string; title: string; insertAfterUnitId: string }[];
    placements?: {
      videoId: string;
      unitRef: string;
      existingTopicId: string;
      newTopicTitle: string;
      insertAfterTopicId: string;
    }[];
  };

  const existingUnitIds = new Set(existingUnits.map((u) => u.id));
  const topicOwnerUnit = new Map<string, string>(); // topic id -> unit id
  const topicById = new Map<string, YoutubeExistingTopic>();
  for (const unit of existingUnits) {
    for (const topic of unit.topics) {
      topicOwnerUnit.set(topic.id, unit.id);
      topicById.set(topic.id, topic);
    }
  }

  const newUnits: YoutubeNewUnit[] = [];
  const seenNewUnitKeys = new Set<string>();
  for (const nu of raw.newUnits ?? []) {
    if (!nu || typeof nu.key !== "string" || !nu.key || typeof nu.title !== "string" || !nu.title.trim()) continue;
    if (existingUnitIds.has(nu.key) || seenNewUnitKeys.has(nu.key)) continue;
    seenNewUnitKeys.add(nu.key);
    const anchor = typeof nu.insertAfterUnitId === "string" ? nu.insertAfterUnitId.trim() : "";
    newUnits.push({
      key: nu.key,
      title: nu.title.trim(),
      insertAfterUnitId: anchor && existingUnitIds.has(anchor) ? anchor : null,
    });
  }
  const validUnitRefs = new Set([...existingUnitIds, ...newUnits.map((u) => u.key)]);

  const videoIds = new Set(groupVideos.map((v) => v.videoId));
  const usedVideoIds = new Set<string>();
  const usedExistingTopicIds = new Set<string>();
  const usedNewTopicKeys = new Set<string>(); // `${unitRef} ${normalizedTitle}`
  const placements: YoutubeVideoPlacement[] = [];

  for (const p of raw.placements ?? []) {
    if (!p || typeof p.videoId !== "string" || typeof p.unitRef !== "string") continue;
    if (!videoIds.has(p.videoId) || usedVideoIds.has(p.videoId)) continue;
    if (!validUnitRefs.has(p.unitRef)) continue;

    const existingTopicId = typeof p.existingTopicId === "string" ? p.existingTopicId.trim() : "";
    if (existingTopicId) {
      if (topicOwnerUnit.get(existingTopicId) !== p.unitRef) continue; // must belong to the chosen unit
      if (topicById.get(existingTopicId)?.hasVideo) continue; // never override
      if (usedExistingTopicIds.has(existingTopicId)) continue;
      usedExistingTopicIds.add(existingTopicId);
      usedVideoIds.add(p.videoId);
      placements.push({
        videoId: p.videoId,
        unitRef: p.unitRef,
        existingTopicId,
        newTopicTitle: null,
        insertAfterTopicId: null,
      });
      continue;
    }

    const newTopicTitle = typeof p.newTopicTitle === "string" ? p.newTopicTitle.trim() : "";
    if (!newTopicTitle) continue;
    const dedupeKey = `${p.unitRef} ${newTopicTitle.toLowerCase()}`;
    if (usedNewTopicKeys.has(dedupeKey)) continue;
    usedNewTopicKeys.add(dedupeKey);
    usedVideoIds.add(p.videoId);

    const anchorId = typeof p.insertAfterTopicId === "string" ? p.insertAfterTopicId.trim() : "";
    const validAnchor = anchorId && topicOwnerUnit.get(anchorId) === p.unitRef ? anchorId : null;

    placements.push({
      videoId: p.videoId,
      unitRef: p.unitRef,
      existingTopicId: null,
      newTopicTitle,
      insertAfterTopicId: validAnchor,
    });
  }

  return { newUnits, placements };
}

/**
 * Splits videos into small, independently-processable groups: one per
 * distinct source playlist when that signal is available (a channel with one
 * playlist per unit — the playlist itself IS the unit boundary, so grouping
 * this way is a zero-risk, deterministic fact rather than something asked of
 * the model), otherwise fixed-size chunks in playlist order.
 */
function groupVideosForPlacement(
  videos: YoutubePlaylistVideo[]
): { label: string | null; videos: YoutubePlaylistVideo[] }[] {
  const byPlaylist = new Map<string, YoutubePlaylistVideo[]>();
  const unlabeled: YoutubePlaylistVideo[] = [];

  for (const video of videos) {
    if (video.playlistTitle) {
      const list = byPlaylist.get(video.playlistTitle) ?? [];
      list.push(video);
      byPlaylist.set(video.playlistTitle, list);
    } else {
      unlabeled.push(video);
    }
  }

  const groups: { label: string | null; videos: YoutubePlaylistVideo[] }[] = [...byPlaylist.entries()].map(
    ([label, vids]) => ({ label, videos: [...vids].sort((a, b) => a.position - b.position) })
  );

  const sortedUnlabeled = [...unlabeled].sort((a, b) => a.position - b.position);
  for (let i = 0; i < sortedUnlabeled.length; i += GROUP_SIZE) {
    groups.push({ label: null, videos: sortedUnlabeled.slice(i, i + GROUP_SIZE) });
  }

  return groups;
}

type WorkingTopic = { id: string; title: string; hasVideo: boolean };
type WorkingUnit = { id: string; title: string; topics: WorkingTopic[] };

/**
 * Places every video into the course's unit/topic structure. Processes
 * videos in small groups (see groupVideosForPlacement/GROUP_SIZE) one at a
 * time, sequentially, feeding each group's confirmed result forward as
 * "existing" context for the next — so a later group reuses a unit an
 * earlier one just created (by its real id) instead of re-declaring an
 * equivalent one from scratch. This bounds how much a single Opus call has
 * to hold consistently, which is what previously produced near-duplicate
 * units when ~100+ videos were all organized in one shot.
 */
export async function placeYoutubeVideos(
  course: { title: string; department: string },
  videos: YoutubePlaylistVideo[],
  existingUnits: YoutubeExistingUnit[]
): Promise<YoutubePlacementResult> {
  if (videos.length === 0) return { newUnits: [], placements: [] };

  const groups = groupVideosForPlacement(videos);
  const working: WorkingUnit[] = existingUnits.map((u) => ({
    id: u.id,
    title: u.title,
    topics: u.topics.map((t) => ({ ...t })),
  }));

  const newUnits: YoutubeNewUnit[] = [];
  const placements: YoutubeVideoPlacement[] = [];
  let newUnitCounter = 0;
  let newTopicCounter = 0;

  for (const group of groups) {
    if (group.videos.length === 0) continue;

    let groupResult: YoutubePlacementResult;
    try {
      groupResult = await placeVideoGroup(course, group.videos, group.label, working);
    } catch (error) {
      console.error(
        `placeYoutubeVideos: group "${group.label ?? "(ungrouped chunk)"}" (${group.videos.length} video(s)) failed, skipping it:`,
        error instanceof Error ? error.message : error
      );
      continue;
    }

    const keyRemap = new Map<string, string>();
    for (const nu of groupResult.newUnits) {
      const stableKey = `n${newUnitCounter++}`;
      keyRemap.set(nu.key, stableKey);
      newUnits.push({ key: stableKey, title: nu.title, insertAfterUnitId: nu.insertAfterUnitId });
      working.push({ id: stableKey, title: nu.title, topics: [] });
    }

    for (const p of groupResult.placements) {
      const resolvedUnitRef = keyRemap.get(p.unitRef) ?? p.unitRef;
      const wu = working.find((u) => u.id === resolvedUnitRef);
      if (!wu) continue;

      if (p.existingTopicId) {
        const topic = wu.topics.find((t) => t.id === p.existingTopicId);
        if (topic) topic.hasVideo = true;
      } else {
        wu.topics.push({ id: `nt${newTopicCounter++}`, title: p.newTopicTitle ?? "", hasVideo: true });
      }

      placements.push({ ...p, unitRef: resolvedUnitRef });
    }
  }

  return { newUnits, placements };
}
