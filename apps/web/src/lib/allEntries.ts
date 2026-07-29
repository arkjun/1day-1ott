import type { EntryRow } from "./api";

/** 전체 기록 검색 — 제목·감상 메모·날짜(문자열 부분 일치)를 한 칸에서 훑는다. */
export function filterEntries(entries: EntryRow[], query: string): EntryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      (e.note?.toLowerCase().includes(q) ?? false) ||
      e.watchedOn.includes(q),
  );
}
