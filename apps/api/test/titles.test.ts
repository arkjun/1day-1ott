import { describe, expect, it } from "vitest";
import {
  CACHE_TTL_MS,
  buildFacts,
  isFresh,
  parseMeta,
  parseTitles,
  pickLang,
  pickTmdbTitle,
  withCache,
} from "../src/lib/titles";

describe("pickTmdbTitle", () => {
  it("요청 언어 번역이 있으면 그 제목을 쓴다", () => {
    // 원어 vi, ko 번역 존재 → 아파트
    const d = { name: "아파트", original_name: "Phi Vụ Chung Cư", original_language: "vi" };
    expect(pickTmdbTitle(d, "ko")).toBe("아파트");
  });

  it("요청 언어 번역이 없어 원어로 폴백되면 null (원문 유지)", () => {
    // ko 요청인데 TMDB 가 원어(vi) 제목을 그대로 반환 → 캐시 거부
    const d = {
      name: "Phi Vụ Chung Cư",
      original_name: "Phi Vụ Chung Cư",
      original_language: "vi",
    };
    expect(pickTmdbTitle(d, "ko")).toBeNull();
  });

  it("요청 언어가 원어와 같으면 원어 제목이 곧 정답", () => {
    // 한국 원작을 ko 로 요청: name==original 이지만 통과해야 함
    const d = { name: "기생충", original_name: "기생충", original_language: "ko" };
    expect(pickTmdbTitle(d, "ko")).toBe("기생충");
  });

  it("제목 없으면 null", () => {
    expect(pickTmdbTitle({ original_language: "en" }, "ko")).toBeNull();
  });
});

describe("pickLang", () => {
  it("지원 언어 그대로 통과", () => {
    expect(pickLang("ko")).toBe("ko");
    expect(pickLang("ja")).toBe("ja");
  });

  // 브라우저 로케일이 en-US/ja-JP 로 오면 전부 원문 폴백되던 버그.
  it("지역 서브태그가 붙어도 앞 언어로 인식", () => {
    expect(pickLang("en-US")).toBe("en");
    expect(pickLang("ja-JP")).toBe("ja");
    expect(pickLang("ko-KR")).toBe("ko");
    expect(pickLang("EN-us")).toBe("en");
  });

  it("미지원/미지정은 undefined", () => {
    expect(pickLang("fr-FR")).toBeUndefined();
    expect(pickLang("")).toBeUndefined();
    expect(pickLang(undefined)).toBeUndefined();
  });
});

describe("meta 언어별 캐시", () => {
  it("titles/posters 를 함께 보존하며 병합한다", () => {
    const meta = JSON.stringify({ titles: { ko: "기생충" }, extra: 1 });
    const next = withCache(meta, {
      titles: { ko: "기생충", ja: "パラサイト" },
      posters: { ja: "/jp.jpg" },
    });
    expect(parseTitles(next)).toEqual({ ko: "기생충", ja: "パラサイト" });
    expect(parseMeta(next).posters).toEqual({ ja: "/jp.jpg" });
    expect(JSON.parse(next).extra).toBe(1);
  });

  it("해당 언어 포스터 없음은 빈 문자열로 캐시(재조회 방지)", () => {
    const next = withCache(null, { posters: { en: "" } });
    expect(parseMeta(next).posters.en).toBe("");
  });

  it("손상된 meta 는 빈 캐시로 취급", () => {
    expect(parseMeta("{oops")).toEqual({ titles: {}, posters: {}, facts: {}, fetchedAt: {} });
  });
});

describe("isFresh (TMDB 약관 1.C 캐시 상한)", () => {
  const now = 1_700_000_000_000;

  it("TTL 안이면 신선", () => {
    const c = parseMeta(JSON.stringify({ fetchedAt: { ko: now - 1000 } }));
    expect(isFresh(c, "ko", now)).toBe(true);
  });

  it("TTL 지나면 만료", () => {
    const c = parseMeta(JSON.stringify({ fetchedAt: { ko: now - CACHE_TTL_MS - 1 } }));
    expect(isFresh(c, "ko", now)).toBe(false);
  });

  it("fetchedAt 없는 옛 레코드는 만료 취급", () => {
    const c = parseMeta(JSON.stringify({ titles: { ko: "기생충" } }));
    expect(isFresh(c, "ko", now)).toBe(false);
  });

  it("TTL 은 약관 상한(6개월)보다 짧다", () => {
    expect(CACHE_TTL_MS).toBeLessThan(180 * 24 * 60 * 60 * 1000);
  });
});

describe("buildFacts", () => {
  it("영화: 러닝타임·연도·장르·평점", () => {
    const f = buildFacts({
      release_date: "2019-05-30",
      runtime: 132,
      genres: [{ id: 18, name: "드라마" }],
      vote_average: 8.5,
      vote_count: 100,
      overview: "줄거리",
      backdrop_path: "/bd.jpg",
    });
    expect(f).toMatchObject({
      year: "2019",
      runtime: 132,
      genres: ["드라마"],
      voteAverage: 8.5,
      voteCount: 100,
      overview: "줄거리",
      backdropUrl: "https://image.tmdb.org/t/p/w780/bd.jpg",
    });
  });

  it("TV: episode_run_time 첫 값을 러닝타임으로, 시즌/화수 포함", () => {
    const f = buildFacts({
      first_air_date: "2021-09-17",
      episode_run_time: [60, 55],
      number_of_seasons: 2,
      number_of_episodes: 16,
      status: "Returning Series",
    });
    expect(f).toMatchObject({
      year: "2021",
      runtime: 60,
      seasons: 2,
      episodes: 16,
      status: "Returning Series",
    });
  });

  it("빈 값은 키 자체를 넣지 않는다", () => {
    expect(buildFacts({})).toEqual({});
    expect(buildFacts({ overview: "", vote_average: 0, genres: [] })).toEqual({});
  });
});
