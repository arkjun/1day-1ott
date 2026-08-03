import type { EntryRow } from "./api";

const FULL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 전체 기록 검색 — 완전한 날짜는 감상일과 정확히, 나머지는 제목·감상·날짜에 부분 일치한다. */
export function filterEntries(entries: EntryRow[], query: string): EntryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  if (FULL_DATE_PATTERN.test(q)) {
    return entries.filter((entry) => entry.watchedOn === q);
  }
  return entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      (e.note?.toLowerCase().includes(q) ?? false) ||
      e.watchedOn.includes(q),
  );
}
