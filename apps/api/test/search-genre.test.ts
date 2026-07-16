import { describe, expect, it } from "vitest";
import { mapTmdb, matchesTypeGenre, tmdbLang } from "../src/routes/search";

describe("tmdbLang", () => {
  it("지원 언어는 TMDB 코드로 매핑", () => {
    expect(tmdbLang("ko")).toBe("ko-KR");
    expect(tmdbLang("en")).toBe("en-US");
    expect(tmdbLang("ja")).toBe("ja-JP");
  });
  it("미지정/미지원은 ko-KR fallback", () => {
    expect(tmdbLang(undefined)).toBe("ko-KR");
    expect(tmdbLang("fr")).toBe("ko-KR");
  });
});

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

  it("tv: 예능(10764)/토크(10767)/애니(16)/다큐(99)/뉴스(10763) 제외", () => {
    expect(matchesTypeGenre([10764], "tv")).toBe(false);
    expect(matchesTypeGenre([10767], "tv")).toBe(false);
    expect(matchesTypeGenre([16, 35], "tv")).toBe(false);
    expect(matchesTypeGenre([99], "tv")).toBe(false); // 다큐는 시사교양 탭으로
    expect(matchesTypeGenre([10763], "tv")).toBe(false); // 뉴스도
    expect(matchesTypeGenre([18], "tv")).toBe(true);
    expect(matchesTypeGenre([18, 35], "tv")).toBe(true);
  });

  it("documentary: 다큐(99)/뉴스(10763) 포함식", () => {
    expect(matchesTypeGenre([99], "documentary")).toBe(true);
    expect(matchesTypeGenre([10763, 18], "documentary")).toBe(true);
    expect(matchesTypeGenre([18], "documentary")).toBe(false);
    expect(matchesTypeGenre([], "documentary")).toBe(false);
    expect(matchesTypeGenre(undefined, "documentary")).toBe(false);
  });

  it("tv: 장르 태그가 없거나 비어 있으면 통과 (제외식이므로 놓치지 않는다)", () => {
    expect(matchesTypeGenre([], "tv")).toBe(true);
    expect(matchesTypeGenre(undefined, "tv")).toBe(true);
  });

  it("movie: 항상 통과 (애니 영화 포함)", () => {
    expect(matchesTypeGenre([16], "movie")).toBe(true);
    expect(matchesTypeGenre(undefined, "movie")).toBe(true);
  });

  it("variety: 예능(10764)/토크(10767) 포함식", () => {
    expect(matchesTypeGenre([10764], "variety")).toBe(true);
    expect(matchesTypeGenre([10767, 35], "variety")).toBe(true);
    expect(matchesTypeGenre([18], "variety")).toBe(false);
    expect(matchesTypeGenre([], "variety")).toBe(false);
    expect(matchesTypeGenre(undefined, "variety")).toBe(false);
  });
});

describe("mapTmdb", () => {
  const item = { id: 1, name: "놀면 뭐하니?", first_air_date: "2019-07-27" };

  it("variety 탭 검색 결과는 type=variety 로 매핑 (tv 로 저장되면 안 됨)", () => {
    expect(mapTmdb(item, "variety")?.type).toBe("variety");
  });

  it("tv/anime 매핑은 기존대로", () => {
    expect(mapTmdb(item, "tv")?.type).toBe("tv");
    expect(mapTmdb(item, "anime")?.type).toBe("anime");
  });

  it("documentary 탭 검색 결과는 type=documentary 로 매핑", () => {
    const doc = { id: 9, name: "그것이 알고싶다", first_air_date: "1992-03-31" };
    expect(mapTmdb(doc, "documentary")?.type).toBe("documentary");
  });

  it("overview·rating·genreIds 를 통과시킨다", () => {
    const rich = {
      id: 2,
      title: "인셉션",
      release_date: "2010-07-16",
      overview: "꿈 속의 꿈…",
      vote_average: 8.4,
      genre_ids: [28, 878, 12],
    };
    const r = mapTmdb(rich, "movie");
    expect(r?.overview).toBe("꿈 속의 꿈…");
    expect(r?.rating).toBe(8.4);
    expect(r?.genreIds).toEqual([28, 878, 12]);
  });

  it("빈 값은 undefined 로 (평점 0·설명 없음)", () => {
    const r = mapTmdb({ id: 3, title: "무명작", vote_average: 0 }, "movie");
    expect(r?.overview).toBeUndefined();
    expect(r?.rating).toBeUndefined();
  });
});
