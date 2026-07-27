import { describe, expect, it } from "vitest";
import { pickRecentContents, type RecentContent } from "./recentContents";

describe("pickRecentContents", () => {
  it("최신순을 유지하며 같은 작품을 제거하고 유형별 최대 5개를 반환한다", () => {
    const entries: RecentContent[] = [
      { contentId: "a", type: "movie", title: "A", posterUrl: null },
      { contentId: "a", type: "movie", title: "A", posterUrl: null },
      { contentId: "b", type: "movie", title: "B", posterUrl: "/b.jpg" },
      { contentId: "c", type: "movie", title: "C", posterUrl: null },
      { contentId: "d", type: "movie", title: "D", posterUrl: null },
      { contentId: "e", type: "movie", title: "E", posterUrl: null },
      { contentId: "tv-a", type: "tv", title: "TV A", posterUrl: null },
      { contentId: "f", type: "movie", title: "F", posterUrl: null },
      { contentId: "tv-b", type: "tv", title: "TV B", posterUrl: null },
    ];

    expect(pickRecentContents(entries).map((entry) => entry.contentId)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "tv-a",
      "tv-b",
    ]);
    expect(pickRecentContents(entries)[1]?.posterUrl).toBe("/b.jpg");
  });

  it("제한값을 유형별로 각각 적용한다", () => {
    const entries: RecentContent[] = [
      { contentId: "movie-a", type: "movie", title: "Movie A", posterUrl: null },
      { contentId: "tv-a", type: "tv", title: "TV A", posterUrl: null },
      { contentId: "movie-b", type: "movie", title: "Movie B", posterUrl: null },
      { contentId: "tv-b", type: "tv", title: "TV B", posterUrl: null },
    ];

    expect(pickRecentContents(entries, 1).map((entry) => entry.contentId)).toEqual([
      "movie-a",
      "tv-a",
    ]);
  });

  it("빈 목록은 빈 배열을 반환한다", () => {
    expect(pickRecentContents([])).toEqual([]);
  });
});
