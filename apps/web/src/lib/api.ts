import type { ContentType, EntryInput, HeatmapCell, Reaction, SearchResult } from "@1ott/shared";

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
  reaction: Reaction | null;
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
  updateEntry: (
    id: string,
    patch: { watchedOn?: string; reaction?: Reaction | null; note?: string | null; platform?: string | null },
  ) =>
    req<{ ok: boolean }>(`/api/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteEntry: (id: string) =>
    req<{ ok: boolean }>(`/api/entries/${id}`, { method: "DELETE" }),
  heatmap: () => req<{ cells: HeatmapCell[] }>("/api/heatmap"),
  search: (q: string, type: ContentType) =>
    req<{ results: SearchResult[] }>(
      `/api/search?q=${encodeURIComponent(q)}&type=${type}`,
    ),
  yt: (url: string) =>
    req<{ result: SearchResult }>(`/api/yt?url=${encodeURIComponent(url)}`),
  updateMe: (patch: { username?: string; isPublic?: boolean }) =>
    req<{ ok: boolean }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  publicProfile: (username: string) =>
    req<import("@1ott/shared").PublicProfile>(
      `/api/u/${encodeURIComponent(username)}`,
    ),
};
