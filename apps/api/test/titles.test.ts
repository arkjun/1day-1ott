import { describe, expect, it } from "vitest";
import { pickTmdbTitle } from "../src/lib/titles";

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
