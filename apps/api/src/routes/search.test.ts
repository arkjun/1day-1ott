import { describe, expect, it } from "vitest";
import { classifyTmdbType } from "./search";

describe("classifyTmdbType", () => {
  it.each([
    [{ id: 1, title: "영화", media_type: "movie" }, "movie"],
    [{ id: 2, name: "드라마", media_type: "tv", genre_ids: [18] }, "tv"],
    [{ id: 3, name: "애니", media_type: "tv", genre_ids: [16, 18] }, "anime"],
    [{ id: 4, name: "시사", media_type: "tv", genre_ids: [99, 10767] }, "documentary"],
    [{ id: 5, name: "예능", media_type: "tv", genre_ids: [10764] }, "variety"],
  ])("%o → %s", (item, expected) => {
    expect(classifyTmdbType(item)).toBe(expected);
  });

  it("인물 결과는 제외한다", () => {
    expect(
      classifyTmdbType({ id: 6, name: "배우", media_type: "person" }),
    ).toBeNull();
  });
});
