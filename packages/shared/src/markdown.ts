import type { ContentType, Reaction } from "./index";

export interface EntryRowData {
  watchedOn: string;
  title: string;
  type: ContentType;
  reaction: Reaction | null;
  note: string | null;
  platform: string | null;
}
export interface ParsedEntryRow extends EntryRowData {
  row: number; // 1-based 데이터 행 번호
}
export interface ParseError {
  row: number;
  message: string;
}
export interface ParseResult {
  ok: ParsedEntryRow[];
  errors: ParseError[];
}

/** 유형: 한국어 라벨(canonical) ↔ enum. */
const TYPE_LABEL: Record<ContentType, string> = {
  movie: "영화",
  tv: "드라마",
  variety: "예능",
  documentary: "시사·교양",
  anime: "애니",
  youtube: "유튜브",
  other: "기타",
};
/**
 * import 인식용: 한국어 라벨 + 영어 enum 키 → enum (소문자/trim 정규화).
 * ContentType은 런타임 값이 아니라 type-only import이므로 index.ts와의
 * 순환 참조(export * from "./markdown")에 얽히지 않는다. TYPE_LABEL(위)이
 * ContentType을 빠짐없이 커버하므로 그 키만으로 top-level에서 안전하게 구성한다.
 */
const TYPE_LOOKUP: Map<string, ContentType> = new Map(
  (Object.keys(TYPE_LABEL) as ContentType[]).flatMap((t) => [
    [t, t], // 영어 키
    [TYPE_LABEL[t].toLowerCase(), t], // 한국어 라벨
  ]) as [string, ContentType][],
);

/** 반응: enum → 한국어 라벨(export). */
const REACTION_LABEL: Record<Reaction, string> = {
  down: "싫어요",
  up: "좋아요",
  love: "매우 좋아요",
};
/** import 인식용: canonical + alias + 이모지 → enum. */
const REACTION_LOOKUP: Map<string, Reaction> = new Map([
  ["싫어요", "down"], ["👎", "down"], ["별로", "down"],
  ["좋아요", "up"], ["👍", "up"], ["굿", "up"],
  ["매우 좋아요", "love"], ["👍👍", "love"], ["최고", "love"],
] as [string, Reaction][]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 파이프 표에서 셀 배열 추출. 앞뒤 파이프 제거 후 `|` 분리 + trim. */
function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** 구분선 행인가? (셀이 전부 -, :, 공백) */
function isSeparator(cells: string[]): boolean {
  return cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, "")) || c === "");
}

export function parseEntriesMarkdown(md: string): ParseResult {
  const pipeLines = md.split(/\r?\n/).filter((l) => l.trim().startsWith("|"));
  const ok: ParsedEntryRow[] = [];
  const errors: ParseError[] = [];

  let headerSeen = false;
  let dataRow = 0;
  for (const line of pipeLines) {
    const cells = splitCells(line);
    if (!headerSeen) {
      headerSeen = true;
      // 첫 파이프 라인은 보통 헤더지만, 첫 셀이 날짜 형식이면 헤더 없이 바로
      // 데이터가 시작된 것 — 헤더로 오인해 스킵하면 첫 행이 조용히 사라진다.
      if (!DATE_RE.test(cells[0] ?? "")) continue;
    }
    if (isSeparator(cells)) continue;

    dataRow++;
    const [watchedOn = "", title = "", typeRaw = "", reactionRaw = "", note = "", platform = ""] = cells;

    if (!DATE_RE.test(watchedOn)) {
      errors.push({ row: dataRow, message: `날짜 형식 오류 (YYYY-MM-DD): "${watchedOn}"` });
      continue;
    }
    if (title.length < 1 || title.length > 300) {
      errors.push({ row: dataRow, message: `제목은 1~300자여야 합니다` });
      continue;
    }

    let type: ContentType = "other";
    if (typeRaw !== "") {
      const found = TYPE_LOOKUP.get(typeRaw.toLowerCase());
      if (!found) {
        errors.push({ row: dataRow, message: `알 수 없는 유형: "${typeRaw}"` });
        continue;
      }
      type = found;
    }

    let reaction: Reaction | null = null;
    if (reactionRaw !== "") {
      const found = REACTION_LOOKUP.get(reactionRaw);
      if (!found) {
        errors.push({ row: dataRow, message: `알 수 없는 반응: "${reactionRaw}"` });
        continue;
      }
      reaction = found;
    }

    if (note.length > 1000) {
      errors.push({ row: dataRow, message: `감상은 1000자 이하여야 합니다` });
      continue;
    }
    if (platform.length > 60) {
      errors.push({ row: dataRow, message: `플랫폼은 60자 이하여야 합니다` });
      continue;
    }

    ok.push({
      row: dataRow,
      watchedOn,
      title,
      type,
      reaction,
      note: note === "" ? null : note,
      platform: platform === "" ? null : platform,
    });
  }

  return { ok, errors };
}

/** 셀 안 개행/파이프는 표를 깨뜨리므로 공백으로. */
function cell(v: string | null): string {
  return (v ?? "").replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim();
}

const HEADER = "| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 |";
const SEPARATOR = "| --- | --- | --- | --- | --- | --- |";

export function formatEntriesMarkdown(rows: EntryRowData[]): string {
  const body = rows.map((r) =>
    `| ${cell(r.watchedOn)} | ${cell(r.title)} | ${TYPE_LABEL[r.type]} | ${r.reaction ? REACTION_LABEL[r.reaction] : ""} | ${cell(r.note)} | ${cell(r.platform)} |`,
  );
  return [HEADER, SEPARATOR, ...body].join("\n") + "\n";
}
