import { entryInputSchema, countToLevel, reactionSchema, formatEntriesMarkdown, parseEntriesMarkdown } from "@1ott/shared";
import type { EntryRowData, HeatmapCell } from "@1ott/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../env";
import { parseTitles, pickLang, resolveLocalized, withTitles } from "../lib/titles";

const entryPatchSchema = z.object({
  watchedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reaction: reactionSchema.nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  platform: z.string().max(60).nullable().optional(),
});

const importBodySchema = z.object({
  markdown: z.string().max(500_000),
  commit: z.boolean(),
});

type Vars = { userId: string };

export const entriesRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

/** 콘텐츠를 찾거나 생성. tmdbId/ytId 로 중복 제거, 없으면 자유입력 신규. */
async function upsertContent(
  db: ReturnType<typeof createDb>,
  input: ReturnType<typeof entryInputSchema.parse>,
  lang?: string,
): Promise<string> {
  const { content } = schema;
  const cache = pickLang(lang);

  if (input.contentId) return input.contentId;

  const key =
    input.tmdbId != null
      ? and(eq(content.type, input.type), eq(content.tmdbId, input.tmdbId))
      : input.ytId != null
        ? and(eq(content.type, input.type), eq(content.ytId, input.ytId))
        : undefined;
  if (key) {
    const found = await db
      .select({ id: content.id, meta: content.meta })
      .from(content)
      .where(key)
      .get();
    if (found) {
      // 저장 언어의 제목을 아직 캐시 안했으면 이번 입력으로 채운다(TMDB 호출 절약).
      if (cache) {
        const titles = parseTitles(found.meta);
        if (!titles[cache]) {
          titles[cache] = input.title;
          await db
            .update(content)
            .set({ meta: withTitles(found.meta, titles) })
            .where(eq(content.id, found.id));
        }
      }
      return found.id;
    }
  }

  const id = nanoid();
  await db.insert(content).values({
    id,
    type: input.type,
    tmdbId: input.tmdbId ?? null,
    ytId: input.ytId ?? null,
    title: input.title,
    posterUrl: input.posterUrl ?? null,
    meta: cache ? JSON.stringify({ titles: { [cache]: input.title } }) : null,
  });
  return id;
}

/**
 * 내 기존 entries 중 (watchedOn+title)이 겹치는 파싱 행을 경고로.
 * 전체 히스토리를 매번 조인하면 기록이 쌓일수록(잔디 앱 특성상 계속 누적) 매 import가
 * 느려지므로, 이번에 들여오는 행들의 watchedOn 날짜로만 좁혀서 조회한다.
 */
async function computeDupWarnings(
  db: ReturnType<typeof createDb>,
  userId: string,
  rows: { row: number; watchedOn: string; title: string }[],
): Promise<{ row: number; watchedOn: string; title: string }[]> {
  if (rows.length === 0) return [];
  const watchedOnDates = [...new Set(rows.map((r) => r.watchedOn))];
  const existing = await db
    .select({ watchedOn: schema.entries.watchedOn, title: schema.content.title })
    .from(schema.entries)
    .innerJoin(schema.content, eq(schema.entries.contentId, schema.content.id))
    .where(and(eq(schema.entries.userId, userId), inArray(schema.entries.watchedOn, watchedOnDates)))
    .all();
  // key가 `${watchedOn}|${title}` 여도 안전한 이유: watchedOn은 모든 insert 경로에서
  // ^\d{4}-\d{2}-\d{2}$ (고정 10자)로 검증되므로 분할 지점이 항상 index 10 — title에
  // '|'가 들어있어도(막을 규칙 없음) 그 위치를 밀어낼 수 없어 서로 다른 (watchedOn,title)
  // 쌍이 같은 키로 충돌할 수 없다.
  const seen = new Set(existing.map((e) => `${e.watchedOn}|${e.title}`));
  return rows
    .filter((r) => seen.has(`${r.watchedOn}|${r.title}`))
    .map((r) => ({ row: r.row, watchedOn: r.watchedOn, title: r.title }));
}

/** 기록 생성 — 웹/북마클릿/확장이 공유하는 단일 엔드포인트. */
entriesRoute.post("/entries", async (c) => {
  const parsed = entryInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;
  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  if (input.contentId) {
    const found = await db
      .select({ id: schema.content.id })
      .from(schema.content)
      .where(eq(schema.content.id, input.contentId))
      .get();
    if (!found) return c.json({ error: "invalid_content" }, 400);
  }

  const contentId = await upsertContent(db, input, c.req.query("lang"));
  const id = nanoid();
  await db.insert(schema.entries).values({
    id,
    userId,
    contentId,
    watchedOn: input.watchedOn,
    reaction: input.reaction ?? null,
    note: input.note ?? null,
    platform: input.platform ?? null,
  });

  return c.json({ id, contentId }, 201);
});

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

  if (!commit) {
    const dupWarnings = await computeDupWarnings(db, userId, ok);
    return c.json({ committed: false, okCount: ok.length, errors, dupWarnings });
  }

  let inserted = 0;
  const commitErrors = [...errors];
  for (const r of ok) {
    // 행 하나가 실패해도(D1 순간 장애 등) 나머지 행은 계속 진행 — 하나만 배치/트랜잭션이
    // 아니므로 여기서 멈추면 이미 커밋된 행을 응답에서 숨기는 셈이 되어 재업로드 시 중복
    // insert를 유발한다. 실패 행은 errors에 합류시켜 inserted가 실제 커밋 수와 맞도록 한다.
    try {
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
    } catch (e) {
      commitErrors.push({
        row: r.row,
        message: `등록 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return c.json({ committed: true, inserted, errors: commitErrors });
});

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

/** 기록 수정(본인 것만). 별점·감상·날짜·플랫폼. */
entriesRoute.patch("/entries/:id", async (c) => {
  const parsed = entryPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const id = c.req.param("id");

  const owned = await db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, id), eq(schema.entries.userId, userId)))
    .get();
  if (!owned) return c.json({ error: "not_found" }, 404);

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) patch[k] = v;
  }
  if (Object.keys(patch).length > 0) {
    await db.update(schema.entries).set(patch).where(eq(schema.entries.id, id));
  }
  return c.json({ ok: true });
});

/** 기록 삭제(본인 것만). */
entriesRoute.delete("/entries/:id", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const id = c.req.param("id");

  const owned = await db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, id), eq(schema.entries.userId, userId)))
    .get();
  if (!owned) return c.json({ error: "not_found" }, 404);

  await db.delete(schema.entries).where(eq(schema.entries.id, id));
  return c.json({ ok: true });
});

/** 내 기록 목록(최신순, 콘텐츠 조인). */
entriesRoute.get("/entries", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const { entries, content } = schema;
  const lang = pickLang(c.req.query("lang"));

  const rows = await db
    .select({
      id: entries.id,
      watchedOn: entries.watchedOn,
      reaction: entries.reaction,
      note: entries.note,
      platform: entries.platform,
      contentId: content.id,
      type: content.type,
      title: content.title,
      posterUrl: content.posterUrl,
      tmdbId: content.tmdbId,
      meta: content.meta,
    })
    .from(entries)
    .innerJoin(content, eq(entries.contentId, content.id))
    .where(eq(entries.userId, userId))
    .orderBy(desc(entries.watchedOn), desc(entries.createdAt))
    .all();

  const locByContent = await resolveLocalized(db, c.env, rows, lang);

  const result = rows.map((r) => {
    const loc = locByContent.get(r.contentId);
    return {
      id: r.id,
      contentId: r.contentId,
      watchedOn: r.watchedOn,
      reaction: r.reaction,
      note: r.note,
      platform: r.platform,
      type: r.type,
      title: loc?.title ?? r.title,
      posterUrl: loc?.posterUrl ?? r.posterUrl,
    };
  });

  return c.json({ entries: result });
});

/** 작품 페이지 하단: 로그인 유저의 이 작품 기록만. */
entriesRoute.get("/content/:id/mine", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const id = c.req.param("id");
  const rows = await db
    .select({
      id: schema.entries.id,
      watchedOn: schema.entries.watchedOn,
      reaction: schema.entries.reaction,
      note: schema.entries.note,
      platform: schema.entries.platform,
    })
    .from(schema.entries)
    .where(and(eq(schema.entries.userId, userId), eq(schema.entries.contentId, id)))
    .orderBy(desc(schema.entries.watchedOn), desc(schema.entries.createdAt))
    .all();
  return c.json({ entries: rows });
});

/** 잔디 데이터 — 날짜별 count 집계 후 level 버킷. */
entriesRoute.get("/heatmap", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const { entries } = schema;

  const rows = await db
    .select({
      date: entries.watchedOn,
      count: sql<number>`count(*)`,
    })
    .from(entries)
    .where(eq(entries.userId, userId))
    .groupBy(entries.watchedOn)
    .all();

  const cells: HeatmapCell[] = rows.map((r) => ({
    date: r.date,
    count: r.count,
    level: countToLevel(r.count),
  }));

  return c.json({ cells });
});
