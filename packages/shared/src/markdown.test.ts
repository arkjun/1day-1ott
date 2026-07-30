import { describe, expect, it } from "vitest";
import type { ContentType, Reaction } from "./index";
import { parseEntriesMarkdown, formatEntriesMarkdown } from "./markdown";

/** 유형별 canonical 한국어 라벨. 라벨이 바뀌면 아래 round-trip 테스트가 실패해야 한다. */
const TYPE_LABELS: Record<ContentType, string> = {
  movie: "영화",
  tv: "드라마",
  variety: "예능",
  documentary: "시사·교양",
  anime: "애니",
  youtube: "유튜브",
  other: "기타",
};
const REACTIONS: Reaction[] = ["down", "up", "love"];

const TABLE = `| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 |
|------|------|------|------|------|--------|
| 2026-07-15 | 무빙 | 드라마 | 좋아요 | 재밌었다 | 디즈니+ |
| 2026-07-15 | 폭싹 속았수다 | 드라마 | 매우 좋아요 |  |  |
| 2026-07-14 | 어떤영화 |  | 싫어요 |  | 넷플릭스 |`;

describe("parseEntriesMarkdown", () => {
  it("표를 행 단위로 파싱한다 (헤더/구분선 스킵)", () => {
    const { ok, errors } = parseEntriesMarkdown(TABLE);
    expect(errors).toEqual([]);
    expect(ok).toHaveLength(3);
    expect(ok[0]).toEqual({
      row: 1, watchedOn: "2026-07-15", title: "무빙",
      type: "tv", reaction: "up", note: "재밌었다", platform: "디즈니+",
    });
  });

  it("선택 컬럼 빈칸: 유형→other, 반응→null, 감상/플랫폼→null", () => {
    const { ok } = parseEntriesMarkdown(TABLE);
    expect(ok[2]).toEqual({
      row: 3, watchedOn: "2026-07-14", title: "어떤영화",
      type: "other", reaction: "down", note: null, platform: "넷플릭스",
    });
  });

  it("잘못된 날짜는 행 오류", () => {
    const md = `| 날짜 | 제목 |\n|--|--|\n| 2026-7-1 | 무빙 |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(ok).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.row).toBe(1);
    expect(errors[0]!.message).toContain("날짜");
  });

  it("빈 제목은 행 오류", () => {
    const md = `| 날짜 | 제목 |\n|--|--|\n| 2026-07-01 |  |`;
    const { errors } = parseEntriesMarkdown(md);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("제목");
  });

  it("유형은 영어 enum 키도 인식, 미인식은 오류", () => {
    const md = `| 날짜 | 제목 | 유형 |\n|--|--|--|\n| 2026-07-01 | A | movie |\n| 2026-07-01 | B | 만화책 |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(ok).toHaveLength(1);
    expect(ok[0]!.type).toBe("movie");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("유형");
  });

  it("반응은 이모지/별칭도 인식, 미인식은 오류", () => {
    const md = `| 날짜 | 제목 | 유형 | 반응 |\n|--|--|--|--|\n| 2026-07-01 | A |  | 👍 |\n| 2026-07-01 | B |  | 👍👍 |\n| 2026-07-01 | C |  | 최고 |\n| 2026-07-01 | D |  | 음 |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(ok.map((r) => r.reaction)).toEqual(["up", "love", "love"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("반응");
  });

  it("표 밖 텍스트는 무시한다", () => {
    const md = `# 내 기록\n메모입니다\n\n${TABLE}`;
    const { ok } = parseEntriesMarkdown(md);
    expect(ok).toHaveLength(3);
  });

  it("행 번호는 데이터 행 기준 1-based", () => {
    const { ok } = parseEntriesMarkdown(TABLE);
    expect(ok.map((r) => r.row)).toEqual([1, 2, 3]);
  });

  it("헤더 없이 데이터로 바로 시작해도(첫 셀이 날짜) 모든 행을 파싱한다", () => {
    const md = `| 2026-07-15 | 무빙 | 드라마 | 좋아요 |  |  |\n| 2026-07-14 | 듄 | 영화 |  |  |  |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(errors).toEqual([]);
    expect(ok).toHaveLength(2);
    expect(ok.map((r) => r.row)).toEqual([1, 2]);
    expect(ok[0]!.title).toBe("무빙");
    expect(ok[1]!.title).toBe("듄");
  });

  it("정상 헤더+구분선 표는 여전히 헤더를 스킵한다", () => {
    const md = `| 날짜 | 제목 |\n|--|--|\n| 2026-07-01 | A |`;
    const { ok } = parseEntriesMarkdown(md);
    expect(ok).toHaveLength(1);
    expect(ok[0]!.row).toBe(1);
    expect(ok[0]!.title).toBe("A");
  });

  it("헤더 없는 한 줄짜리 표도 파싱한다", () => {
    const md = `| 2026-07-15 | 무빙 |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(errors).toEqual([]);
    expect(ok).toHaveLength(1);
    expect(ok[0]!.row).toBe(1);
    expect(ok[0]!.title).toBe("무빙");
  });

  it("선택적인 TMDB ID를 파싱한다", () => {
    const md = `| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 | TMDB ID |
|--|--|--|--|--|--|--|
| 2026-07-15 | 무빙 | 드라마 | 좋아요 |  | 디즈니+ | 95557 |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(errors).toEqual([]);
    expect(ok[0]).toMatchObject({ title: "무빙", type: "tv", tmdbId: 95557 });
  });

  it("TMDB ID는 양의 정수만 허용한다", () => {
    const md = `| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 | TMDB ID |
|--|--|--|--|--|--|--|
| 2026-07-15 | 무빙 | 드라마 | 좋아요 |  | 디즈니+ | abc |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(ok).toEqual([]);
    expect(errors[0]?.message).toContain("TMDB ID");
  });
});

describe("formatEntriesMarkdown", () => {
  it("표 헤더+구분선+행을 생성한다", () => {
    const md = formatEntriesMarkdown([
      { watchedOn: "2026-07-15", title: "무빙", type: "tv", reaction: "up", note: "재밌었다", platform: "디즈니+" },
    ]);
    const lines = md.trim().split("\n");
    expect(lines[0]).toBe("| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 | TMDB ID |");
    expect(lines[1]).toMatch(/^\|[\s|:-]+\|$/);
    expect(lines[2]).toBe("| 2026-07-15 | 무빙 | 드라마 | 좋아요 | 재밌었다 | 디즈니+ |  |");
  });

  it("null/빈 필드는 빈 셀", () => {
    const md = formatEntriesMarkdown([
      { watchedOn: "2026-07-14", title: "어떤영화", type: "other", reaction: null, note: null, platform: null },
    ]);
    expect(md.trim().split("\n")[2]).toBe("| 2026-07-14 | 어떤영화 | 기타 |  |  |  |  |");
  });

  it("셀 안 개행/파이프는 공백으로 치환해 표를 지킨다", () => {
    const md = formatEntriesMarkdown([
      { watchedOn: "2026-07-14", title: "제목", type: "other", reaction: null, note: "한 줄\n두 줄|끝", platform: null },
    ]);
    const dataLine = md.trim().split("\n")[2];
    expect(dataLine).not.toContain("\n두 줄");
    expect(dataLine).toBe("| 2026-07-14 | 제목 | 기타 |  | 한 줄 두 줄 끝 |  |  |");
  });

  it("TMDB ID를 내보내기에 보존한다", () => {
    const md = formatEntriesMarkdown([
      {
        watchedOn: "2026-07-15",
        title: "무빙",
        type: "tv",
        reaction: "up",
        note: null,
        platform: "디즈니+",
        tmdbId: 95557,
      },
    ]);
    expect(md).toContain("| 2026-07-15 | 무빙 | 드라마 | 좋아요 |  | 디즈니+ | 95557 |");
  });

  it("format → parse 왕복이 동일하다", () => {
    const rows = [
      { watchedOn: "2026-07-15", title: "무빙", type: "tv" as const, reaction: "up" as const, note: "재밌었다", platform: "디즈니+" },
      { watchedOn: "2026-07-14", title: "어떤영화", type: "other" as const, reaction: null, note: null, platform: null },
    ];
    const { ok, errors } = parseEntriesMarkdown(formatEntriesMarkdown(rows));
    expect(errors).toEqual([]);
    expect(ok.map(({ row, ...r }) => r)).toEqual(rows);
  });

  it("모든 유형 × 모든 반응이 format → parse 왕복에서 보존되고, 라벨이 출력에 그대로 나온다", () => {
    const types = Object.keys(TYPE_LABELS) as ContentType[];
    const rows = types.map((type, i) => ({
      watchedOn: "2026-07-15",
      title: `제목${i}`,
      type,
      reaction: REACTIONS[i % REACTIONS.length]!,
      note: "메모",
      platform: "넷플릭스",
    }));

    const md = formatEntriesMarkdown(rows);
    for (const type of types) {
      expect(md).toContain(TYPE_LABELS[type]);
    }

    const { ok, errors } = parseEntriesMarkdown(md);
    expect(errors).toEqual([]);
    expect(ok.map(({ row, ...r }) => r)).toEqual(rows);
  });
});
