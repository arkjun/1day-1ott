import { describe, expect, it } from "vitest";
import type { EntryRow } from "./api";
import { filterEntries } from "./allEntries";

function row(p: Partial<EntryRow>): EntryRow {
  return {
    id: "e1",
    contentId: "c1",
    watchedOn: "2026-07-01",
    reaction: null,
    note: null,
    isNotePublic: true,
    platform: null,
    type: "movie",
    title: "무제",
    posterUrl: null,
    ...p,
  };
}

describe("filterEntries", () => {
  const entries = [
    row({ id: "a", title: "듄: 파트2", watchedOn: "2026-07-01" }),
    row({ id: "b", title: "Interstellar", watchedOn: "2025-12-24", note: "재관람" }),
    row({ id: "c", title: "무빙", watchedOn: "2025-12-25", type: "tv" }),
  ];

  it("빈 검색어면 전체를 그대로 돌려준다", () => {
    expect(filterEntries(entries, "  ")).toEqual(entries);
  });

  it("제목을 대소문자 구분 없이 부분 일치로 찾는다", () => {
    expect(filterEntries(entries, "STELLAR").map((e) => e.id)).toEqual(["b"]);
  });

  it("감상 메모도 검색 대상이다", () => {
    expect(filterEntries(entries, "재관람").map((e) => e.id)).toEqual(["b"]);
  });

  it("날짜로도 찾는다(연/월 접두어 포함)", () => {
    expect(filterEntries(entries, "2025-12").map((e) => e.id)).toEqual(["b", "c"]);
  });

  it("일치가 없으면 빈 배열", () => {
    expect(filterEntries(entries, "없는작품")).toEqual([]);
  });
});
