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
  const result: RecentContent[] = [];

  for (const entry of entries) {
    if (seen.has(entry.contentId)) continue;
    seen.add(entry.contentId);
    result.push(entry);
    if (result.length === limit) break;
  }

  return result;
}
