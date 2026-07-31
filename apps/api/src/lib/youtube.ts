import type { ContentDetail } from "@1ott/shared";
import { eq } from "drizzle-orm";
import type { createDb } from "../db";
import { schema } from "../db";
import { withCache } from "./titles";

type Db = ReturnType<typeof createDb>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const OEMBED_TIMEOUT_MS = 3_000;

interface YouTubeContentRow {
  id: string;
  type: string;
  ytId: string | null;
  meta: string | null;
}

export function youtubeVideoUrl(ytId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`;
}

export function parseYouTubeChannelName(meta: string | null): string | null {
  if (!meta) return null;
  try {
    const value = (JSON.parse(meta) as {
      youtube?: { channelName?: unknown };
    }).youtube?.channelName;
    if (typeof value !== "string") return null;
    const channelName = value.trim();
    return channelName ? channelName : null;
  } catch {
    return null;
  }
}

export function withYouTubeChannelName(
  meta: string | null,
  channelName: string,
): string {
  return withCache(meta, { youtube: { channelName } });
}

export async function fetchYouTubeChannelName(
  ytId: string,
  fetcher: Fetcher = fetch,
  timeoutMs = OEMBED_TIMEOUT_MS,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const oembed =
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeVideoUrl(ytId))}` +
      "&format=json";
    const res = await fetcher(oembed, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { author_name?: unknown };
    if (typeof data.author_name !== "string") return null;
    const channelName = data.author_name.trim();
    return channelName ? channelName.slice(0, 200) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveYouTubeSource(
  db: Db,
  row: YouTubeContentRow,
): Promise<ContentDetail["source"]> {
  if (row.type !== "youtube" || !row.ytId) return undefined;

  let channelName = parseYouTubeChannelName(row.meta);
  if (!channelName) {
    channelName = await fetchYouTubeChannelName(row.ytId);
    if (channelName) {
      await db
        .update(schema.content)
        .set({ meta: withYouTubeChannelName(row.meta, channelName) })
        .where(eq(schema.content.id, row.id));
    }
  }

  return {
    ...(channelName ? { name: channelName } : {}),
    url: youtubeVideoUrl(row.ytId),
  };
}
