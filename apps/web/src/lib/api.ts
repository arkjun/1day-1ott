import type { ContentDetail, ContentType, EntryInput, HeatmapCell, MyContentEntry, Reaction, SearchResult } from "@1ott/shared";
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
  contentId: string;
  watchedOn: string;
  reaction: Reaction | null;
  note: string | null;
  platform: string | null;
  type: ContentType;
  title: string;
  posterUrl: string | null;
}

export interface ImportError { row: number; message: string }
export interface ImportDup { row: number; watchedOn: string; title: string }
export type ImportResult =
  | { committed: false; okCount: number; errors: ImportError[]; dupWarnings: ImportDup[] }
  | { committed: true; inserted: number; errors: ImportError[] };

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
  importEntries: (markdown: string, commit: boolean) =>
    req<ImportResult>(`/api/entries/import?lang=${i18n.language}`, {
      method: "POST",
      body: JSON.stringify({ markdown, commit }),
    }),
  exportEntries: async () => {
    const res = await fetch("/api/entries/export", { credentials: "include" });
    if (!res.ok) throw new Error(`export → ${res.status}`);
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") ?? "";
    const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "1ott.md";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    // 클릭 직후 바로 revoke하면 일부 브라우저(Safari 등)가 다운로드를
    // 시작하기 전에 blob URL이 무효화돼 다운로드가 취소될 수 있다.
    // 매크로태스크 하나만 미루면 브라우저가 다운로드를 개시하기에 충분하다.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },
  search: (q: string, type: ContentType | "all") =>
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
  content: (id: string) =>
    req<ContentDetail>(`/api/content/${encodeURIComponent(id)}?lang=${i18n.language}`),
  contentMine: (id: string) =>
    req<{ entries: MyContentEntry[] }>(`/api/content/${encodeURIComponent(id)}/mine`),
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
