import { describe, expect, it } from "vitest";
import { countToLevel, entryInputSchema } from "./index";

describe("countToLevel", () => {
  it("0 이하는 level 0", () => {
    expect(countToLevel(0)).toBe(0);
    expect(countToLevel(-1)).toBe(0);
  });

  it("1~3은 개수 그대로, 4 이상은 4로 포화", () => {
    expect(countToLevel(1)).toBe(1);
    expect(countToLevel(2)).toBe(2);
    expect(countToLevel(3)).toBe(3);
    expect(countToLevel(4)).toBe(4);
    expect(countToLevel(99)).toBe(4);
  });
});

describe("entryInputSchema", () => {
  const minimal = { type: "movie", title: "듄", watchedOn: "2026-07-14" };

  it("유형+제목+날짜 최소 입력으로 통과 (자유입력 폴백 계약)", () => {
    const parsed = entryInputSchema.safeParse(minimal);
    expect(parsed.success).toBe(true);
  });

  it("watchedOn은 YYYY-MM-DD 형식만 허용", () => {
    expect(entryInputSchema.safeParse({ ...minimal, watchedOn: "2026-7-14" }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...minimal, watchedOn: "07/14/2026" }).success).toBe(false);
  });

  it("빈 제목 거부", () => {
    expect(entryInputSchema.safeParse({ ...minimal, title: "" }).success).toBe(false);
  });

  it("정의되지 않은 콘텐츠 유형 거부", () => {
    expect(entryInputSchema.safeParse({ ...minimal, type: "book" }).success).toBe(false);
  });

  it("예능(variety) 유형 허용", () => {
    expect(entryInputSchema.safeParse({ ...minimal, type: "variety" }).success).toBe(true);
  });

  it("reaction은 down/up/love만 허용", () => {
    expect(entryInputSchema.safeParse({ ...minimal, reaction: "love" }).success).toBe(true);
    expect(entryInputSchema.safeParse({ ...minimal, reaction: "meh" }).success).toBe(false);
  });

  it("tmdbId는 양의 정수만", () => {
    expect(entryInputSchema.safeParse({ ...minimal, tmdbId: 693134 }).success).toBe(true);
    expect(entryInputSchema.safeParse({ ...minimal, tmdbId: -1 }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...minimal, tmdbId: 1.5 }).success).toBe(false);
  });

  it("posterUrl은 URL 형식만", () => {
    expect(entryInputSchema.safeParse({ ...minimal, posterUrl: "not-a-url" }).success).toBe(false);
  });

  it("YouTube 기록은 채널명을 함께 받을 수 있다", () => {
    expect(
      entryInputSchema.safeParse({
        ...minimal,
        type: "youtube",
        ytId: "dQw4w9WgXcQ",
        channelName: "Rick Astley",
      }).success,
    ).toBe(true);
  });

  it("YouTube 외 유형에는 채널명을 허용하지 않는다", () => {
    expect(
      entryInputSchema.safeParse({ ...minimal, channelName: "잘못된 채널" }).success,
    ).toBe(false);
  });
});
