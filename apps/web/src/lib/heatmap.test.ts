import type { HeatmapCell } from "@1ott/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildYear, currentStreak, isoDaysAgo } from "./heatmap";

// 날짜 로직은 "오늘"에 의존하므로 시계를 고정한다.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

const cell = (date: string, count = 1): HeatmapCell => ({
  date,
  count,
  level: countLevel(count),
});
const countLevel = (n: number): HeatmapCell["level"] =>
  n <= 0 ? 0 : n >= 4 ? 4 : (n as 1 | 2 | 3);

describe("isoDaysAgo", () => {
  it("0은 오늘, 1은 어제 (로컬 날짜)", () => {
    expect(isoDaysAgo(0)).toBe("2026-07-14");
    expect(isoDaysAgo(1)).toBe("2026-07-13");
  });

  it("월 경계를 넘는다", () => {
    expect(isoDaysAgo(14)).toBe("2026-06-30");
  });
});

describe("buildYear", () => {
  it("과거→오늘 순으로 정확히 365칸", () => {
    const out = buildYear([]);
    expect(out).toHaveLength(365);
    expect(out[0]?.date).toBe(isoDaysAgo(364));
    expect(out[364]?.date).toBe("2026-07-14");
  });

  it("기록 있는 날은 count/level 유지, 빈 날은 0으로 패딩", () => {
    const out = buildYear([cell("2026-07-14", 2)]);
    expect(out[364]).toEqual({ date: "2026-07-14", count: 2, level: 2 });
    expect(out[363]).toEqual({ date: "2026-07-13", count: 0, level: 0 });
  });

  it("365일보다 오래된 셀은 무시", () => {
    const out = buildYear([cell("2020-01-01", 3)]);
    expect(out.every((c) => c.count === 0)).toBe(true);
  });
});

describe("currentStreak", () => {
  it("기록 없으면 0", () => {
    expect(currentStreak([])).toBe(0);
  });

  it("오늘부터 뒤로 연속 일수", () => {
    const cells = [cell(isoDaysAgo(0)), cell(isoDaysAgo(1)), cell(isoDaysAgo(2))];
    expect(currentStreak(cells)).toBe(3);
  });

  it("오늘 아직 기록 안 했으면 어제부터 인정 (하루 유예)", () => {
    const cells = [cell(isoDaysAgo(1)), cell(isoDaysAgo(2))];
    expect(currentStreak(cells)).toBe(2);
  });

  it("빈 날을 만나면 끊긴다", () => {
    const cells = [cell(isoDaysAgo(0)), cell(isoDaysAgo(2))];
    expect(currentStreak(cells)).toBe(1);
  });

  it("count 0 셀은 기록으로 치지 않는다", () => {
    expect(currentStreak([cell(isoDaysAgo(0), 0)])).toBe(0);
  });
});
