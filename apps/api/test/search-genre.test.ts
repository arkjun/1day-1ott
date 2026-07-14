import { describe, expect, it } from "vitest";
import { matchesTypeGenre } from "../src/routes/search";

/**
 * TMDB search/tv 는 장르 구분 없이 모든 TV 프로그램을 반환하므로
 * genre_ids 후처리로 탭 의도에 맞게 거른다.
 * - anime 탭: Animation(16) 포함식 — 확실한 것만
 * - tv(드라마) 탭: 예능(10764)/토크(10767)/애니(16) 제외식 — 태그 부실 작품을 놓치지 않게
 * - movie 탭: 필터 없음 (search/movie 자체가 영화만 반환)
 */
describe("matchesTypeGenre", () => {
  it("anime: Animation(16) 포함된 것만 통과", () => {
    expect(matchesTypeGenre([16, 35], "anime")).toBe(true);
    expect(matchesTypeGenre([18], "anime")).toBe(false);
    expect(matchesTypeGenre([], "anime")).toBe(false);
    expect(matchesTypeGenre(undefined, "anime")).toBe(false);
  });

  it("tv: 예능(10764)/토크(10767)/애니(16) 제외", () => {
    expect(matchesTypeGenre([10764], "tv")).toBe(false);
    expect(matchesTypeGenre([10767], "tv")).toBe(false);
    expect(matchesTypeGenre([16, 35], "tv")).toBe(false);
    expect(matchesTypeGenre([18], "tv")).toBe(true);
    expect(matchesTypeGenre([18, 35], "tv")).toBe(true);
  });

  it("tv: 장르 태그가 없거나 비어 있으면 통과 (제외식이므로 놓치지 않는다)", () => {
    expect(matchesTypeGenre([], "tv")).toBe(true);
    expect(matchesTypeGenre(undefined, "tv")).toBe(true);
  });

  it("movie: 항상 통과 (애니 영화 포함)", () => {
    expect(matchesTypeGenre([16], "movie")).toBe(true);
    expect(matchesTypeGenre(undefined, "movie")).toBe(true);
  });
});
