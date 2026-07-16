export interface BreakdownEntry {
  type: string;
  contentId: string;
}

export interface TypeBreakdown {
  type: string;
  count: number;
  pct: number;
  workCount?: number;
}

export function buildTypeBreakdown(entries: BreakdownEntry[]): TypeBreakdown[] {
  const counts = new Map<string, number>();
  const tvWorks = new Set<string>();

  for (const entry of entries) {
    counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
    if (entry.type === "tv") tvWorks.add(entry.contentId);
  }

  const total = entries.length || 1;
  return [...counts.entries()]
    .map(([type, count]) => ({
      type,
      count,
      pct: Math.round((count / total) * 100),
      ...(type === "tv" ? { workCount: tvWorks.size } : {}),
    }))
    .sort((a, b) => b.count - a.count);
}
