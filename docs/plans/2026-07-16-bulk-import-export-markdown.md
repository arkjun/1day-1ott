# 기록 대량 업로드/다운로드 (Markdown) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 자기 시청 기록(entries)을 markdown 표로 대량 업로드(미리보기 후 확정)하고 전체를 markdown으로 다운로드한다.

**Architecture:** 파싱/직렬화는 `@1ott/shared`의 순수 함수(`parseEntriesMarkdown`/`formatEntriesMarkdown`)로 두고 api·web·테스트가 공유. API는 `entries.ts`에 `POST /api/entries/import`(dry-run/commit)와 `GET /api/entries/export` 추가, 기존 `upsertContent`+entries insert 재사용. web은 `MyPage.tsx`에 가져오기/내보내기 섹션과 미리보기 모달.

**Tech Stack:** TypeScript, zod, Hono, Drizzle(D1), React, vitest, `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/specs/2026-07-16-bulk-import-export-markdown-design.md`

## Global Constraints

- 모든 content는 free-text 신규 생성 (tmdbId/ytId/posterUrl 없음). 기존 `upsertContent` 그대로 사용.
- 필수 컬럼: 날짜(`YYYY-MM-DD`), 제목(1~300자). 선택: 유형·반응·감상(≤1000자)·플랫폼(≤60자).
- 유형 라벨(export/import 공용): `영화/드라마/예능/시사·교양/애니/유튜브/기타` = `movie/tv/variety/documentary/anime/youtube/other`. import는 영어 enum 키도 허용. 빈칸→`other`. 미인식→행 오류.
- 반응 라벨(canonical): `싫어요/좋아요/매우 좋아요` = `down/up/love`. import alias: `👎/별로`, `👍/굿`, `👍👍/최고`. 빈칸→`null`. 미인식→행 오류.
- import 행 상한 **500**. 초과 시 `400 { error: "too_many_rows" }`.
- 중복(내 기존 entries에 `watchedOn`+`title` 동일)은 **경고만**, 등록은 진행.
- 오류 행은 제외하고 나머지만 등록(부분 성공).
- 인증: `/api/entries/*`는 기존 미들웨어가 `userId` 주입(추가 작업 불필요).
- `contentTypes = ["tv","movie","variety","documentary","anime","youtube","other"]`, `reactions = ["down","up","love"]` (from `@1ott/shared`).

---

### Task 1: 공유 markdown 파서/직렬화 (`@1ott/shared`)

**Files:**
- Create: `packages/shared/src/markdown.ts`
- Modify: `packages/shared/src/index.ts` (맨 끝에 re-export 1줄)
- Test: `packages/shared/src/markdown.test.ts`

**Interfaces:**
- Consumes: `ContentType`, `Reaction`, `contentTypes`, `reactions` (from `./index`).
- Produces:
  - `interface EntryRowData { watchedOn: string; title: string; type: ContentType; reaction: Reaction | null; note: string | null; platform: string | null }`
  - `interface ParsedEntryRow extends EntryRowData { row: number }` (row = 1-based 데이터 행 번호)
  - `interface ParseError { row: number; message: string }`
  - `interface ParseResult { ok: ParsedEntryRow[]; errors: ParseError[] }`
  - `function parseEntriesMarkdown(md: string): ParseResult`
  - `function formatEntriesMarkdown(rows: EntryRowData[]): string`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/markdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEntriesMarkdown, formatEntriesMarkdown } from "./markdown";

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
      type: "other", reaction: "down", note: null, platform: null,
    });
  });

  it("잘못된 날짜는 행 오류", () => {
    const md = `| 날짜 | 제목 |\n|--|--|\n| 2026-7-1 | 무빙 |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(ok).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(1);
    expect(errors[0].message).toContain("날짜");
  });

  it("빈 제목은 행 오류", () => {
    const md = `| 날짜 | 제목 |\n|--|--|\n| 2026-07-01 |  |`;
    const { errors } = parseEntriesMarkdown(md);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("제목");
  });

  it("유형은 영어 enum 키도 인식, 미인식은 오류", () => {
    const md = `| 날짜 | 제목 | 유형 |\n|--|--|--|\n| 2026-07-01 | A | movie |\n| 2026-07-01 | B | 만화책 |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(ok).toHaveLength(1);
    expect(ok[0].type).toBe("movie");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("유형");
  });

  it("반응은 이모지/별칭도 인식, 미인식은 오류", () => {
    const md = `| 날짜 | 제목 | 유형 | 반응 |\n|--|--|--|--|\n| 2026-07-01 | A |  | 👍 |\n| 2026-07-01 | B |  | 👍👍 |\n| 2026-07-01 | C |  | 최고 |\n| 2026-07-01 | D |  | 음 |`;
    const { ok, errors } = parseEntriesMarkdown(md);
    expect(ok.map((r) => r.reaction)).toEqual(["up", "love", "love"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("반응");
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
});

describe("formatEntriesMarkdown", () => {
  it("표 헤더+구분선+행을 생성한다", () => {
    const md = formatEntriesMarkdown([
      { watchedOn: "2026-07-15", title: "무빙", type: "tv", reaction: "up", note: "재밌었다", platform: "디즈니+" },
    ]);
    const lines = md.trim().split("\n");
    expect(lines[0]).toBe("| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 |");
    expect(lines[1]).toMatch(/^\|[\s|:-]+\|$/);
    expect(lines[2]).toBe("| 2026-07-15 | 무빙 | 드라마 | 좋아요 | 재밌었다 | 디즈니+ |");
  });

  it("null/빈 필드는 빈 셀", () => {
    const md = formatEntriesMarkdown([
      { watchedOn: "2026-07-14", title: "어떤영화", type: "other", reaction: null, note: null, platform: null },
    ]);
    expect(md.trim().split("\n")[2]).toBe("| 2026-07-14 | 어떤영화 | 기타 |  |  |  |");
  });

  it("셀 안 개행/파이프는 공백으로 치환해 표를 지킨다", () => {
    const md = formatEntriesMarkdown([
      { watchedOn: "2026-07-14", title: "제목", type: "other", reaction: null, note: "한 줄\n두 줄|끝", platform: null },
    ]);
    const dataLine = md.trim().split("\n")[2];
    expect(dataLine).not.toContain("\n두 줄");
    expect(dataLine).toBe("| 2026-07-14 | 제목 | 기타 |  | 한 줄 두 줄 끝 |  |");
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @1ott/shared test`
Expected: FAIL — `parseEntriesMarkdown`/`formatEntriesMarkdown` not exported.

- [ ] **Step 3: Implement `markdown.ts`**

Create `packages/shared/src/markdown.ts`:

```ts
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
/** import 인식용: 한국어 라벨 + 영어 enum 키 → enum (소문자/trim 정규화). */
const TYPE_LOOKUP: Map<string, ContentType> = (() => {
  const m = new Map<string, ContentType>();
  for (const t of contentTypes) {
    m.set(t, t); // 영어 키
    m.set(TYPE_LABEL[t].toLowerCase(), t); // 한국어 라벨
  }
  return m;
})();

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
```

- [ ] **Step 4: Re-export from `index.ts`**

Append to `packages/shared/src/index.ts` (맨 끝):

```ts
export * from "./markdown";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @1ott/shared test`
Expected: PASS (markdown + 기존 테스트 모두).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/markdown.ts packages/shared/src/markdown.test.ts packages/shared/src/index.ts
git commit -m "feat: add markdown parser/formatter for bulk entries in shared"
```

---

### Task 2: import/export API 엔드포인트 (`apps/api`)

**Files:**
- Modify: `apps/api/src/routes/entries.ts` (import 추가, 핸들러 2개 + dup 헬퍼 추가)
- Test: `apps/api/test/api.test.ts` (통합 테스트 추가)

**Interfaces:**
- Consumes: `parseEntriesMarkdown`, `formatEntriesMarkdown`, `EntryRowData`, `ParsedEntryRow` (from `@1ott/shared`); 기존 `upsertContent`, `createDb`, `schema`, `nanoid`.
- Produces:
  - `POST /api/entries/import` — body `{ markdown: string, commit: boolean }`.
    - dry-run: `200 { committed: false, okCount: number, errors: ParseError[], dupWarnings: { row: number; watchedOn: string; title: string }[] }`
    - commit: `200 { committed: true, inserted: number, errors: ParseError[] }`
    - `400 { error: "too_many_rows" }` (행 > 500), `400 { error: "invalid_input" }` (body 파싱 실패)
  - `GET /api/entries/export` — `200` `text/markdown`, `Content-Disposition: attachment; filename="1ott-<YYYY-MM-DD>.md"`, 본문 = `formatEntriesMarkdown` 결과(날짜 desc, createdAt desc).

- [ ] **Step 1: Write failing integration tests**

Append to `apps/api/test/api.test.ts` (파일 끝, 기존 `signUp`/`authed` 헬퍼 재사용):

```ts
describe("POST /api/entries/import", () => {
  const TABLE = `| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 |
|--|--|--|--|--|--|
| 2026-07-15 | 무빙 | 드라마 | 좋아요 | 재밌었다 | 디즈니+ |
| 2026-07-15 | 폭싹 속았수다 | 드라마 | 매우 좋아요 |  |  |
| 나쁜날짜 | 오류행 |  |  |  |  |`;

  async function importMd(cookie: string, markdown: string, commit: boolean) {
    return app.request(
      "/api/entries/import",
      authed(cookie, { method: "POST", body: JSON.stringify({ markdown, commit }) }),
      env,
    );
  }

  it("dry-run은 파싱만 하고 DB를 바꾸지 않는다", async () => {
    const cookie = await signUp();
    const res = await importMd(cookie, TABLE, false);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.committed).toBe(false);
    expect(body.okCount).toBe(2);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].row).toBe(3);

    // DB 불변 확인: 목록이 비어있어야 한다.
    const list = await app.request("/api/entries", authed(cookie), env);
    expect((await list.json()).entries).toHaveLength(0);
  });

  it("commit은 유효 행만 insert하고 오류 행은 제외한다", async () => {
    const cookie = await signUp();
    const res = await importMd(cookie, TABLE, true);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.committed).toBe(true);
    expect(body.inserted).toBe(2);

    const list = await app.request("/api/entries", authed(cookie), env);
    const entries = (await list.json()).entries;
    expect(entries).toHaveLength(2);
    expect(entries.map((e: { title: string }) => e.title).sort()).toEqual(["무빙", "폭싹 속았수다"].sort());
  });

  it("이미 있는 (날짜+제목)은 dupWarnings로 표시한다", async () => {
    const cookie = await signUp();
    await importMd(cookie, TABLE, true); // 무빙 등록
    const res = await importMd(cookie, TABLE, false);
    const body = await res.json();
    expect(body.dupWarnings.some((d: { title: string }) => d.title === "무빙")).toBe(true);
  });

  it("501행이면 400 too_many_rows", async () => {
    const cookie = await signUp();
    const rows = Array.from({ length: 501 }, (_, i) => `| 2026-07-15 | 제목${i} |  |  |  |  |`).join("\n");
    const md = `| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 |\n|--|--|--|--|--|--|\n${rows}`;
    const res = await importMd(cookie, md, false);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("too_many_rows");
  });
});

describe("GET /api/entries/export", () => {
  it("내 기록을 markdown 표로 내려준다", async () => {
    const cookie = await signUp();
    await createEntry(cookie, { title: "듄", type: "movie", watchedOn: "2026-07-11", reaction: "love" });
    const res = await app.request("/api/entries/export", authed(cookie), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const text = await res.text();
    expect(text).toContain("| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 |");
    expect(text).toContain("| 2026-07-11 | 듄 | 영화 | 매우 좋아요 |  |  |");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @1ott/api test`
Expected: FAIL — import/export 라우트 없음(404 → 기대값 불일치).

- [ ] **Step 3: Implement endpoints**

In `apps/api/src/routes/entries.ts`:

3a. 상단 import에 shared 함수 추가:

```ts
import { entryInputSchema, countToLevel, reactionSchema, formatEntriesMarkdown, parseEntriesMarkdown, type EntryRowData } from "@1ott/shared";
```

3b. 파일 상단 스키마 영역(`entryPatchSchema` 근처)에 import body 스키마 추가:

```ts
const importBodySchema = z.object({
  markdown: z.string().max(500_000),
  commit: z.boolean(),
});
```

3c. dup 계산 헬퍼 추가(`upsertContent` 아래):

```ts
/** 내 기존 entries 중 (watchedOn+title)이 겹치는 파싱 행을 경고로. */
async function computeDupWarnings(
  db: ReturnType<typeof createDb>,
  userId: string,
  rows: { row: number; watchedOn: string; title: string }[],
): Promise<{ row: number; watchedOn: string; title: string }[]> {
  if (rows.length === 0) return [];
  const existing = await db
    .select({ watchedOn: schema.entries.watchedOn, title: schema.content.title })
    .from(schema.entries)
    .innerJoin(schema.content, eq(schema.entries.contentId, schema.content.id))
    .where(eq(schema.entries.userId, userId))
    .all();
  const seen = new Set(existing.map((e) => `${e.watchedOn} ${e.title}`));
  return rows.filter((r) => seen.has(`${r.watchedOn} ${r.title}`))
    .map((r) => ({ row: r.row, watchedOn: r.watchedOn, title: r.title }));
}
```

3d. import 핸들러 추가(`entriesRoute.post("/entries", ...)` 아래):

```ts
/** 대량 업로드 — dry-run(commit:false)은 파싱만, commit:true는 실제 등록. */
entriesRoute.post("/entries/import", async (c) => {
  const parsed = importBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { markdown, commit } = parsed.data;
  const { ok, errors } = parseEntriesMarkdown(markdown);
  if (ok.length + errors.length > 500) {
    return c.json({ error: "too_many_rows" }, 400);
  }

  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const dupWarnings = await computeDupWarnings(db, userId, ok);

  if (!commit) {
    return c.json({ committed: false, okCount: ok.length, errors, dupWarnings });
  }

  let inserted = 0;
  for (const r of ok) {
    const contentId = await upsertContent(
      db,
      {
        type: r.type,
        title: r.title,
        watchedOn: r.watchedOn,
        reaction: r.reaction ?? undefined,
        note: r.note ?? undefined,
        platform: r.platform ?? undefined,
      },
      c.req.query("lang"),
    );
    await db.insert(schema.entries).values({
      id: nanoid(),
      userId,
      contentId,
      watchedOn: r.watchedOn,
      reaction: r.reaction ?? null,
      note: r.note ?? null,
      platform: r.platform ?? null,
    });
    inserted++;
  }
  return c.json({ committed: true, inserted, errors });
});
```

3e. export 핸들러 추가(import 핸들러 아래):

```ts
/** 내 전체 기록을 markdown 표로 다운로드. */
entriesRoute.get("/entries/export", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const { entries, content } = schema;

  const rows = await db
    .select({
      watchedOn: entries.watchedOn,
      title: content.title,
      type: content.type,
      reaction: entries.reaction,
      note: entries.note,
      platform: entries.platform,
    })
    .from(entries)
    .innerJoin(content, eq(entries.contentId, content.id))
    .where(eq(entries.userId, userId))
    .orderBy(desc(entries.watchedOn), desc(entries.createdAt))
    .all();

  const data: EntryRowData[] = rows.map((r) => ({
    watchedOn: r.watchedOn,
    title: r.title,
    type: r.type as EntryRowData["type"],
    reaction: (r.reaction ?? null) as EntryRowData["reaction"],
    note: r.note ?? null,
    platform: r.platform ?? null,
  }));

  const today = new Date().toISOString().slice(0, 10);
  return new Response(formatEntriesMarkdown(data), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="1ott-${today}.md"`,
    },
  });
});
```

> 참고: `desc`는 이미 `entries.ts` 상단에서 import됨(`import { and, desc, eq, sql } from "drizzle-orm"`). 추가 import 불필요.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @1ott/api test`
Expected: PASS (import/export + 기존 테스트).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/entries.ts apps/api/test/api.test.ts
git commit -m "feat: add bulk import(dry-run/commit) and markdown export endpoints"
```

---

### Task 3: web api 헬퍼 (`apps/web/src/lib/api.ts`)

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: `POST /api/entries/import`, `GET /api/entries/export` (Task 2).
- Produces:
  - `interface ImportError { row: number; message: string }`
  - `interface ImportDup { row: number; watchedOn: string; title: string }`
  - `type ImportResult = { committed: false; okCount: number; errors: ImportError[]; dupWarnings: ImportDup[] } | { committed: true; inserted: number; errors: ImportError[] }`
  - `api.importEntries(markdown: string, commit: boolean): Promise<ImportResult>`
  - `api.exportEntries(): Promise<void>` (브라우저 파일 다운로드 트리거)

- [ ] **Step 1: Add types + helpers**

In `apps/web/src/lib/api.ts`, `EntryRow` 인터페이스 근처에 타입 추가:

```ts
export interface ImportError { row: number; message: string }
export interface ImportDup { row: number; watchedOn: string; title: string }
export type ImportResult =
  | { committed: false; okCount: number; errors: ImportError[]; dupWarnings: ImportDup[] }
  | { committed: true; inserted: number; errors: ImportError[] };
```

`api` 객체 안에 메서드 추가(`heatmap` 근처):

```ts
importEntries: (markdown: string, commit: boolean) =>
  req<ImportResult>(`/api/entries/import?lang=${i18n.language}`, {
    method: "POST",
    body: JSON.stringify({ markdown, commit }),
  }),
exportEntries: async () => {
  const res = await fetch("/api/entries/export", { credentials: "include" });
  if (!res.ok) throw new Error(`export → ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "1ott.md";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
},
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @1ott/web typecheck` (없으면 `pnpm --filter @1ott/web build`)
Expected: 타입 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add importEntries/exportEntries api helpers"
```

---

### Task 4: MyPage 가져오기/내보내기 UI + i18n

**Files:**
- Modify: `apps/web/src/components/MyPage.tsx` (섹션 컴포넌트 추가 + 렌더)
- Modify: `apps/web/src/i18n/locales/ko.ts`, `en.ts`, `ja.ts`

**Interfaces:**
- Consumes: `api.importEntries`, `api.exportEntries`, `ImportResult` (Task 3).

- [ ] **Step 1: i18n 문자열 추가**

각 로케일 파일의 최상위 객체에 `impexport` 키 추가.

`ko.ts`:
```ts
  impexport: {
    title: "가져오기 / 내보내기",
    desc: "기록을 markdown 표로 올리거나 내려받아요.",
    download: "markdown 다운로드",
    fileLabel: "markdown 파일 선택",
    or: "또는 붙여넣기",
    placeholder: "| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 |\n| 2026-07-15 | 무빙 | 드라마 | 좋아요 | 재밌었다 | 디즈니+ |",
    preview: "미리보기",
    summary: "등록 {{ok}}건 · 오류 {{err}}건 · 중복 의심 {{dup}}건",
    errorsHead: "오류 행",
    dupsHead: "중복 의심 행 (그래도 등록됨)",
    rowLabel: "{{row}}행",
    confirm: "{{ok}}건 등록",
    cancel: "취소",
    done: "{{n}}건 등록 완료",
    tooMany: "한 번에 500행까지 올릴 수 있어요.",
    empty: "등록할 유효한 행이 없어요.",
    failed: "가져오기에 실패했어요.",
  },
```

`en.ts`:
```ts
  impexport: {
    title: "Import / Export",
    desc: "Upload or download your log as a markdown table.",
    download: "Download markdown",
    fileLabel: "Choose markdown file",
    or: "or paste",
    placeholder: "| Date | Title | Type | Reaction | Note | Platform |\n| 2026-07-15 | Moving | 드라마 | 좋아요 | Great | Disney+ |",
    preview: "Preview",
    summary: "{{ok}} to add · {{err}} errors · {{dup}} possible dups",
    errorsHead: "Error rows",
    dupsHead: "Possible duplicates (added anyway)",
    rowLabel: "row {{row}}",
    confirm: "Add {{ok}}",
    cancel: "Cancel",
    done: "Added {{n}}",
    tooMany: "Up to 500 rows at a time.",
    empty: "No valid rows to add.",
    failed: "Import failed.",
  },
```

`ja.ts`:
```ts
  impexport: {
    title: "インポート / エクスポート",
    desc: "記録を markdown 表でアップロード・ダウンロードできます。",
    download: "markdown をダウンロード",
    fileLabel: "markdown ファイルを選択",
    or: "または貼り付け",
    placeholder: "| 日付 | タイトル | 種類 | 反応 | 感想 | プラットフォーム |\n| 2026-07-15 | ムービング | 드라마 | 좋아요 | 面白い | Disney+ |",
    preview: "プレビュー",
    summary: "登録 {{ok}}件 · エラー {{err}}件 · 重複疑い {{dup}}件",
    errorsHead: "エラー行",
    dupsHead: "重複疑い行（登録はされます）",
    rowLabel: "{{row}}行目",
    confirm: "{{ok}}件を登録",
    cancel: "キャンセル",
    done: "{{n}}件を登録しました",
    tooMany: "一度に 500 行までです。",
    empty: "登録できる有効な行がありません。",
    failed: "インポートに失敗しました。",
  },
```

> 유형/반응 라벨은 한국어 canonical 고정이라 placeholder 예시도 한국어 라벨을 그대로 둔다(파서가 그 라벨만 인식).

- [ ] **Step 2: `ImportExport` 컴포넌트 추가**

`MyPage.tsx`의 `Settings` 컴포넌트 아래에 추가:

```tsx
/** 기록 대량 가져오기/내보내기. dry-run 미리보기 후 확정. */
function ImportExport() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Extract<ImportResult, { committed: false }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
    e.target.value = ""; // 같은 파일 재선택 허용
  }

  async function runPreview() {
    setBusy(true);
    setMsg(null);
    setPreview(null);
    try {
      const res = await api.importEntries(text, false);
      if (res.committed) return; // dry-run이라 도달 안 함
      setPreview(res);
    } catch (err) {
      setMsg(err instanceof Error && err.message.includes("400") ? t("impexport.tooMany") : t("impexport.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.importEntries(text, true);
      if (res.committed) {
        setMsg(t("impexport.done", { n: res.inserted }));
        setPreview(null);
        setText("");
        setTimeout(() => window.location.reload(), 800);
      }
    } catch {
      setMsg(t("impexport.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    try {
      await api.exportEntries();
    } catch {
      setMsg(t("impexport.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.card}>
      <div style={st.cardHead}>
        <b>{t("impexport.title")}</b>
        <span style={st.muted}>{t("impexport.desc")}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <button style={st.ghost} disabled={busy} onClick={download}>
          {t("impexport.download")}
        </button>
        <label style={{ ...st.ghost, cursor: "pointer" }}>
          {t("impexport.fileLabel")}
          <input type="file" accept=".md,.markdown,text/markdown" onChange={onFile} style={{ display: "none" }} />
        </label>
      </div>

      <textarea
        style={{ ...st.input, width: "100%", minHeight: 120, fontFamily: "monospace", resize: "vertical" }}
        placeholder={t("impexport.placeholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button style={st.primary} disabled={busy || !text.trim()} onClick={runPreview}>
          {t("impexport.preview")}
        </button>
      </div>

      {preview && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ marginBottom: 8 }}>
            {t("impexport.summary", {
              ok: preview.okCount,
              err: preview.errors.length,
              dup: preview.dupWarnings.length,
            })}
          </div>

          {preview.errors.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ ...st.muted, color: "crimson" }}>{t("impexport.errorsHead")}</div>
              {preview.errors.map((e) => (
                <div key={`e${e.row}`} style={{ fontSize: 13 }}>
                  {t("impexport.rowLabel", { row: e.row })}: {e.message}
                </div>
              ))}
            </div>
          )}

          {preview.dupWarnings.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={st.muted}>{t("impexport.dupsHead")}</div>
              {preview.dupWarnings.map((d) => (
                <div key={`d${d.row}`} style={{ fontSize: 13 }}>
                  {t("impexport.rowLabel", { row: d.row })}: {d.watchedOn} · {d.title}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={st.primary} disabled={busy || preview.okCount === 0} onClick={commit}>
              {preview.okCount === 0 ? t("impexport.empty") : t("impexport.confirm", { ok: preview.okCount })}
            </button>
            <button style={st.ghost} disabled={busy} onClick={() => setPreview(null)}>
              {t("impexport.cancel")}
            </button>
          </div>
        </div>
      )}

      {msg && <div style={{ ...st.muted, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
```

- [ ] **Step 3: 렌더 + import 추가**

`MyPage.tsx` 상단 import에 타입 추가:

```ts
import { api, type PasskeyRow, type ImportResult } from "../lib/api";
```

`MyPage` 함수 return의 `<Settings user={user} />` 아래에 추가:

```tsx
      <Settings user={user} />
      <ImportExport />
```

- [ ] **Step 4: 수동 검증**

`pnpm dev:api` + `pnpm dev:web` 실행 후 `/me`에서:
1. "markdown 다운로드" → `.md` 파일 저장, 열어서 표 확인.
2. 표(오류 행 포함)를 textarea에 붙여넣고 "미리보기" → "등록 N건 · 오류 M건 · 중복 의심 K건" 표시.
3. "N건 등록" → 홈 잔디/목록에 반영 확인.
4. 같은 표 재업로드 → 미리보기에 중복 의심 표시.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/MyPage.tsx apps/web/src/i18n/locales/ko.ts apps/web/src/i18n/locales/en.ts apps/web/src/i18n/locales/ja.ts
git commit -m "feat: add import/export section to MyPage with preview"
```

---

## Self-Review

**Spec coverage:**
- 포맷(표/컬럼/필수·선택) → Task 1 파서/포매터 + 테스트. ✅
- 유형/반응 라벨 매핑(한국어+영어키+이모지, 미인식 오류) → Task 1 `TYPE_LOOKUP`/`REACTION_LOOKUP` + 테스트. ✅
- dry-run 미리보기 후 확정 → Task 2 import(commit flag) + Task 4 미리보기 모달. ✅
- 부분 성공(오류 행 제외) → Task 2 commit 루프 `ok`만. ✅
- 중복 경고만 → Task 2 `computeDupWarnings`. ✅
- 500행 상한 → Task 2 `too_many_rows` + 테스트. ✅
- platform 유지(채우는 유일 경로) → 파서/포매터/insert 모두 platform 포함. ✅
- export 파일 다운로드 → Task 2 헤더 + Task 3 `exportEntries` blob. ✅
- 테스트(shared 단위 + api 통합) → Task 1, Task 2. ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "적절히 처리" 류 없음. ✅

**Type consistency:** `EntryRowData`/`ParsedEntryRow`/`ParseError`/`ImportResult` 이름·필드가 Task 1↔2↔3↔4에서 일치. `computeDupWarnings` 입력은 `{row,watchedOn,title}`로 `ParsedEntryRow` 호환. `upsertContent` 입력은 `reaction?/note?/platform?`(undefined) 형태로 매핑. ✅

## 열린 한계 (spec과 동일, 의도됨)
- 셀 내 `|` 미지원(포매터가 공백 치환, 파서는 분리자로 취급).
- 중복 자동 제거 없음(경고만).
- content dedup 없음(free-text).
- 웹 UI 컴포넌트 자동 테스트 없음(리포 관례대로 lib/통합 테스트로 커버, UI는 수동 검증).
