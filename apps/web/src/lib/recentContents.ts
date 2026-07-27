import type { ContentType } from "@1ott/shared";

export interface RecentContent {
  contentId: string;
  type: ContentType;
  title: string;
  posterUrl: string | null;
}

export function pickRecentContents(
  entries: RecentContent[],
  limit = 5,
): RecentContent[] {
  const seen = new Set<string>();
  const counts = new Map<ContentType, number>();
  const result: RecentContent[] = [];

  for (const entry of entries) {
    if (seen.has(entry.contentId)) continue;
    seen.add(entry.contentId);

    const count = counts.get(entry.type) ?? 0;
    if (count >= limit) continue;

    result.push(entry);
    counts.set(entry.type, count + 1);
  }

  return result;
}
