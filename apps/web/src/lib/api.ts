import type { ContentType, EntryInput, HeatmapCell, Reaction, SearchResult } from "@1ott/shared";
import i18n from "../i18n";

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
    req<{ id: string; contentId: string }>(`/api/entries?lang=${i18n.language}`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listEntries: () =>
    req<{ entries: EntryRow[] }>(`/api/entries?lang=${i18n.language}`),
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
      `/api/search?q=${encodeURIComponent(q)}&type=${type}&lang=${i18n.language}`,
    ),
  yt: (url: string) =>
    req<{ result: SearchResult }>(`/api/yt?url=${encodeURIComponent(url)}`),
  updateMe: (patch: { username?: string; isPublic?: boolean; lang?: string }) =>
    req<{ ok: boolean }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  publicProfile: (username: string) =>
    req<import("@1ott/shared").PublicProfile>(
      `/api/u/${encodeURIComponent(username)}?lang=${i18n.language}`,
    ),
  // 목록/삭제는 WebAuthn 의식이 필요 없어 엔드포인트를 직접 호출한다.
  // (등록·로그인은 브라우저 의식이 필요 → authClient.passkey.* 사용)
  listPasskeys: () =>
    req<PasskeyRow[]>("/api/auth/passkey/list-user-passkeys"),
  deletePasskey: (id: string) =>
    req<unknown>("/api/auth/passkey/delete-passkey", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
};

export interface PasskeyRow {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
}
