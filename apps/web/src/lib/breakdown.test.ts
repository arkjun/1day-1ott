import { describe, expect, it } from "vitest";
import { buildTypeBreakdown } from "./breakdown";

describe("buildTypeBreakdown", () => {
  it("드라마는 동일 contentId의 여러 기록을 한 작품으로 센다", () => {
    const result = buildTypeBreakdown([
      { type: "tv", contentId: "moving" },
      { type: "tv", contentId: "moving" },
      { type: "tv", contentId: "mask-girl" },
      { type: "movie", contentId: "parasite" },
    ]);

    expect(result).toEqual([
      { type: "tv", count: 3, workCount: 2, pct: 75 },
      { type: "movie", count: 1, pct: 25 },
    ]);
  });

  it("동률이면 기존 입력 순서를 유지한다", () => {
    const result = buildTypeBreakdown([
      { type: "movie", contentId: "movie-1" },
      { type: "tv", contentId: "tv-1" },
    ]);

    expect(result.map(({ type }) => type)).toEqual(["movie", "tv"]);
  });
});
