import { entryInputSchema, countToLevel, reactionSchema } from "@1ott/shared";
import type { HeatmapCell } from "@1ott/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../env";
import { LANGS, parseTitles, pickLang, resolveTitles, withTitles } from "../lib/titles";

const entryPatchSchema = z.object({
  watchedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reaction: reactionSchema.nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  platform: z.string().max(60).nullable().optional(),
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
  const cache = lang && LANGS.has(lang) ? lang : undefined;

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

/** 기록 생성 — 웹/북마클릿/확장이 공유하는 단일 엔드포인트. */
entriesRoute.post("/entries", async (c) => {
  const parsed = entryInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;
  const db = createDb(c.env.DB);
  const userId = c.get("userId");

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

  const titleByContent = await resolveTitles(db, c.env, rows, lang);

  const result = rows.map((r) => ({
    id: r.id,
    watchedOn: r.watchedOn,
    reaction: r.reaction,
    note: r.note,
    platform: r.platform,
    type: r.type,
    title: titleByContent.get(r.contentId) ?? r.title,
    posterUrl: r.posterUrl,
  }));

  return c.json({ entries: result });
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
