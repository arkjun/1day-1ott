import { type ContentType, type Reaction, contentTypes, reactions } from "./index";

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
 * index.ts가 이 파일을 `export * from "./markdown"`로 재수출하는 순환 참조 구조라,
 * 모듈 top-level에서 즉시 contentTypes를 순회하면 평가 순서에 따라 아직 초기화되지
 * 않은 상태를 참조할 수 있다. 첫 호출 시점까지 지연 생성해 이를 피한다.
 */
let typeLookupCache: Map<string, ContentType> | null = null;
function getTypeLookup(): Map<string, ContentType> {
  if (!typeLookupCache) {
    const m = new Map<string, ContentType>();
    for (const t of contentTypes) {
      m.set(t, t); // 영어 키
      m.set(TYPE_LABEL[t].toLowerCase(), t); // 한국어 라벨
    }
    typeLookupCache = m;
  }
  return typeLookupCache;
}

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
      headerSeen = true; // 첫 파이프 라인 = 헤더
      continue;
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
      const found = getTypeLookup().get(typeRaw.toLowerCase());
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
