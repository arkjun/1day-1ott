import { describe, expect, it } from "vitest";
import { parsePosters, parseTitles, pickTmdbTitle, withCache } from "../src/lib/titles";

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

describe("meta 언어별 포스터 캐시", () => {
  it("titles/posters 를 함께 보존하며 병합한다", () => {
    const meta = JSON.stringify({ titles: { ko: "기생충" }, extra: 1 });
    const next = withCache(meta, {
      titles: { ko: "기생충", ja: "パラサイト" },
      posters: { ja: "/jp.jpg" },
    });
    expect(parseTitles(next)).toEqual({ ko: "기생충", ja: "パラサイト" });
    expect(parsePosters(next)).toEqual({ ja: "/jp.jpg" });
    expect(JSON.parse(next).extra).toBe(1);
  });

  it("해당 언어 포스터 없음은 빈 문자열로 캐시(재조회 방지)", () => {
    const next = withCache(null, { posters: { en: "" } });
    expect(parsePosters(next).en).toBe("");
    expect(parsePosters(next).en === undefined).toBe(false);
  });

  it("손상된 meta 는 빈 캐시로 취급", () => {
    expect(parsePosters("{oops")).toEqual({});
  });
});
