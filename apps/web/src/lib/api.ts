import type { EntryInput, HeatmapCell } from "@1ott/shared";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface EntryRow {
  id: string;
  watchedOn: string;
  rating: number | null;
  note: string | null;
  platform: string | null;
  type: string;
  title: string;
  posterUrl: string | null;
}

export const api = {
  createEntry: (input: EntryInput) =>
    req<{ id: string; contentId: string }>("/api/entries", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listEntries: () => req<{ entries: EntryRow[] }>("/api/entries"),
  heatmap: () => req<{ cells: HeatmapCell[] }>("/api/heatmap"),
};
