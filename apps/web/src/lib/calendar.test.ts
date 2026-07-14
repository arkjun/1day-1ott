import { describe, expect, it } from "vitest";
import { buildYearSummary, listYears } from "./calendar";
import type { CalendarEntry } from "./calendar";

const e = (
  watchedOn: string,
  over: Partial<CalendarEntry> = {},
): CalendarEntry => ({
  watchedOn,
  type: "movie",
  title: "엘든 링",
  posterUrl: "https://img/elden.jpg",
  ...over,
});

describe("listYears", () => {
  it("기록 없으면 빈 배열", () => {
    expect(listYears([])).toEqual([]);
  });

  it("등장 연도를 중복 없이 최신순으로", () => {
    const entries = [
      e("2025-03-01"),
      e("2026-01-05"),
      e("2025-12-31"),
      e("2024-07-07"),
    ];
    expect(listYears(entries)).toEqual([2026, 2025, 2024]);
  });

  it("이상한 날짜는 무시", () => {
    expect(listYears([e("nonsense"), e("2026-01-01")])).toEqual([2026]);
  });
});

describe("buildYearSummary", () => {
  it("기록 0이어도 12달 모두 count 0으로 채운다", () => {
    const s = buildYearSummary([], 2026);
    expect(s.year).toBe(2026);
    expect(s.months).toHaveLength(12);
    expect(s.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(s.months.every((m) => m.count === 0 && m.posters.length === 0)).toBe(true);
    expect(s.total).toBe(0);
    expect(s.types).toEqual([]);
  });

  it("해당 연도만 월별로 센다 (다른 해 제외)", () => {
    const entries = [
      e("2026-01-10"),
      e("2026-01-20", { title: "세키로" }),
      e("2026-03-05", { title: "바이오하자드" }),
      e("2025-01-01", { title: "작년 기록" }),
    ];
    const s = buildYearSummary(entries, 2026);
    expect(s.months[0]?.count).toBe(2); // 1월
    expect(s.months[2]?.count).toBe(1); // 3월
    expect(s.months[1]?.count).toBe(0); // 2월
    expect(s.total).toBe(3);
  });

  it("월별 유형 카운트를 집계한다", () => {
    const entries = [
      e("2026-02-01", { type: "movie" }),
      e("2026-02-02", { type: "tv", title: "드라마1" }),
      e("2026-02-03", { type: "tv", title: "드라마2" }),
    ];
    const s = buildYearSummary(entries, 2026);
    expect(s.months[1]?.typeCounts).toEqual({ movie: 1, tv: 2 });
  });

  it("types는 연간 카운트 내림차순 (동률은 이름순)", () => {
    const entries = [
      e("2026-01-01", { type: "youtube", title: "a" }),
      e("2026-02-01", { type: "tv", title: "b" }),
      e("2026-03-01", { type: "tv", title: "c" }),
      e("2026-04-01", { type: "movie", title: "d" }),
    ];
    expect(buildYearSummary(entries, 2026).types).toEqual(["tv", "movie", "youtube"]);
  });

  it("포스터: null 제외, 최근순, 최대 4장", () => {
    const entries = [
      e("2026-05-01", { title: "A", posterUrl: "https://img/a.jpg" }),
      e("2026-05-02", { title: "B", posterUrl: null }),
      e("2026-05-03", { title: "C", posterUrl: "https://img/c.jpg" }),
      e("2026-05-10", { title: "D", posterUrl: "https://img/d.jpg" }),
      e("2026-05-15", { title: "E", posterUrl: "https://img/e.jpg" }),
      e("2026-05-20", { title: "F", posterUrl: "https://img/f.jpg" }),
    ];
    const s = buildYearSummary(entries, 2026);
    expect(s.months[4]?.posters).toEqual([
      "https://img/f.jpg",
      "https://img/e.jpg",
      "https://img/d.jpg",
      "https://img/c.jpg",
    ]);
    expect(s.months[4]?.count).toBe(6); // 개수엔 무포스터도 포함
  });

  it("같은 작품(title)을 여러 번 봐도 콜라주엔 1장", () => {
    const entries = [
      e("2026-06-01", { title: "붉은사막", posterUrl: "https://img/rd.jpg" }),
      e("2026-06-05", { title: "붉은사막", posterUrl: "https://img/rd.jpg" }),
      e("2026-06-09", { title: "고스트", posterUrl: "https://img/gt.jpg" }),
    ];
    const s = buildYearSummary(entries, 2026);
    expect(s.months[5]?.posters).toEqual(["https://img/gt.jpg", "https://img/rd.jpg"]);
    expect(s.months[5]?.count).toBe(3);
  });

  it("전부 무포스터인 달은 posters 빈 배열, count는 유지", () => {
    const entries = [
      e("2026-07-01", { type: "other", title: "직접입력", posterUrl: null }),
    ];
    const s = buildYearSummary(entries, 2026);
    expect(s.months[6]?.posters).toEqual([]);
    expect(s.months[6]?.count).toBe(1);
  });

  it("이상한 watchedOn은 조용히 무시", () => {
    const entries = [e("2026-13-01"), e("garbage"), e("2026-00-01"), e("2026-04-01")];
    const s = buildYearSummary(entries, 2026);
    expect(s.total).toBe(1);
    expect(s.months[3]?.count).toBe(1);
  });
});
