import { entryInputSchema, countToLevel } from "@1ott/shared";
import type { HeatmapCell } from "@1ott/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { createDb, schema } from "../db";
import type { Env } from "../env";

type Vars = { userId: string };

export const entriesRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

/** 콘텐츠를 찾거나 생성. tmdbId/ytId 로 중복 제거, 없으면 자유입력 신규. */
async function upsertContent(
  db: ReturnType<typeof createDb>,
  input: ReturnType<typeof entryInputSchema.parse>,
): Promise<string> {
  const { content } = schema;

  if (input.tmdbId != null) {
    const found = await db
      .select({ id: content.id })
      .from(content)
      .where(and(eq(content.type, input.type), eq(content.tmdbId, input.tmdbId)))
      .get();
    if (found) return found.id;
  } else if (input.ytId != null) {
    const found = await db
      .select({ id: content.id })
      .from(content)
      .where(and(eq(content.type, input.type), eq(content.ytId, input.ytId)))
      .get();
    if (found) return found.id;
  }

  const id = nanoid();
  await db.insert(content).values({
    id,
    type: input.type,
    tmdbId: input.tmdbId ?? null,
    ytId: input.ytId ?? null,
    title: input.title,
    posterUrl: input.posterUrl ?? null,
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

  const contentId = await upsertContent(db, input);
  const id = nanoid();
  await db.insert(schema.entries).values({
    id,
    userId,
    contentId,
    watchedOn: input.watchedOn,
    rating: input.rating ?? null,
    note: input.note ?? null,
    platform: input.platform ?? null,
  });

  return c.json({ id, contentId }, 201);
});

/** 내 기록 목록(최신순, 콘텐츠 조인). */
entriesRoute.get("/entries", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const { entries, content } = schema;

  const rows = await db
    .select({
      id: entries.id,
      watchedOn: entries.watchedOn,
      rating: entries.rating,
      note: entries.note,
      platform: entries.platform,
      type: content.type,
      title: content.title,
      posterUrl: content.posterUrl,
    })
    .from(entries)
    .innerJoin(content, eq(entries.contentId, content.id))
    .where(eq(entries.userId, userId))
    .orderBy(desc(entries.watchedOn), desc(entries.createdAt))
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
