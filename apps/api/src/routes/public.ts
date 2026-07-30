import { countToLevel } from "@1ott/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "../db";
import type { Env } from "../env";
import { pickLang, resolveLocalized } from "../lib/titles";

export const publicRoute = new Hono<{ Bindings: Env }>();

type Db = ReturnType<typeof createDb>;

async function loadPublicUser(db: Db, username: string) {
  const u = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      username: schema.user.username,
      isPublic: schema.user.isPublic,
    })
    .from(schema.user)
    .where(eq(schema.user.username, username))
    .get();
  if (!u || !u.isPublic || !u.username) return null;
  return u as { id: string; name: string; username: string; isPublic: boolean };
}

async function dayCounts(db: Db, userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ date: schema.entries.watchedOn, count: sql<number>`count(*)` })
    .from(schema.entries)
    .where(eq(schema.entries.userId, userId))
    .groupBy(schema.entries.watchedOn)
    .all();
  return new Map(rows.map((r) => [r.date, Number(r.count)]));
}

/** 공개 프로필 JSON (무인증). 비공개/없음 → 404. */
publicRoute.get("/u/:username", async (c) => {
  const db = createDb(c.env.DB);
  const u = await loadPublicUser(db, c.req.param("username"));
  if (!u) return c.json({ error: "not_found" }, 404);

  const counts = await dayCounts(db, u.id);
  const cells = [...counts.entries()].map(([date, count]) => ({
    date,
    count,
    level: countToLevel(count),
  }));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  const posterRows = await db
    .select({
      id: schema.entries.id,
      contentId: schema.content.id,
      type: schema.content.type,
      title: schema.content.title,
      posterUrl: schema.content.posterUrl,
      tmdbId: schema.content.tmdbId,
      meta: schema.content.meta,
    })
    .from(schema.entries)
    .innerJoin(schema.content, eq(schema.entries.contentId, schema.content.id))
    .where(
      and(eq(schema.entries.userId, u.id), sql`${schema.content.posterUrl} is not null`),
    )
    .orderBy(desc(schema.entries.watchedOn))
    .limit(12)
    .all();

  const noteRows = await db
    .select({
      id: schema.entries.id,
      contentId: schema.content.id,
      type: schema.content.type,
      title: schema.content.title,
      posterUrl: schema.content.posterUrl,
      tmdbId: schema.content.tmdbId,
      meta: schema.content.meta,
      watchedOn: schema.entries.watchedOn,
      reaction: schema.entries.reaction,
      note: schema.entries.note,
    })
    .from(schema.entries)
    .innerJoin(schema.content, eq(schema.entries.contentId, schema.content.id))
    .where(
      and(
        eq(schema.entries.userId, u.id),
        eq(schema.entries.isNotePublic, true),
        sql`${schema.entries.note} is not null`,
        sql`trim(${schema.entries.note}) <> ''`,
      ),
    )
    .orderBy(desc(schema.entries.watchedOn), desc(schema.entries.createdAt))
    .all();

  const locByContent = await resolveLocalized(
    db,
    c.env,
    [...posterRows, ...noteRows],
    pickLang(c.req.query("lang")),
  );
  const posters = posterRows.map((p) => {
    const loc = locByContent.get(p.contentId);
    return {
      id: p.id,
      contentId: p.contentId,
      title: loc?.title ?? p.title,
      posterUrl: loc?.posterUrl ?? p.posterUrl,
    };
  });
  const notes = noteRows.map((entry) => {
    const loc = locByContent.get(entry.contentId);
    return {
      id: entry.id,
      contentId: entry.contentId,
      title: loc?.title ?? entry.title,
      posterUrl: loc?.posterUrl ?? entry.posterUrl,
      watchedOn: entry.watchedOn,
      reaction: entry.reaction,
      note: entry.note!,
    };
  });

  return c.json({
    username: u.username,
    name: u.name,
    total,
    cells,
    posters,
    notes,
  });
});

/** 공유용 잔디 SVG (무인증). 폰트 의존 없음(rect + latin 텍스트). */
publicRoute.get("/u/:username/jandi.svg", async (c) => {
  const db = createDb(c.env.DB);
  const u = await loadPublicUser(db, c.req.param("username"));
  if (!u) return c.text("not found", 404);

  const counts = await dayCounts(db, u.id);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const svg = renderJandiSvg(u.username, counts, total);

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
});

/** 작품 공개 페이지 집계(무인증). 없으면 404. */
publicRoute.get("/content/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");

  const row = await db
    .select({
      id: schema.content.id,
      type: schema.content.type,
      title: schema.content.title,
      posterUrl: schema.content.posterUrl,
      tmdbId: schema.content.tmdbId,
      meta: schema.content.meta,
    })
    .from(schema.content)
    .where(eq(schema.content.id, id))
    .get();
  if (!row) return c.json({ error: "not_found" }, 404);

  const vc = await db
    .select({ n: sql<number>`count(distinct ${schema.entries.userId})` })
    .from(schema.entries)
    .where(eq(schema.entries.contentId, id))
    .get();

  const rx = await db
    .select({ reaction: schema.entries.reaction, n: sql<number>`count(*)` })
    .from(schema.entries)
    .where(eq(schema.entries.contentId, id))
    .groupBy(schema.entries.reaction)
    .all();
  const reactions = { down: 0, up: 0, love: 0 };
  for (const r of rx) {
    if (r.reaction === "down" || r.reaction === "up" || r.reaction === "love") {
      reactions[r.reaction] = Number(r.n);
    }
  }

  const locMap = await resolveLocalized(
    db,
    c.env,
    [{ contentId: row.id, type: row.type, title: row.title, tmdbId: row.tmdbId, meta: row.meta }],
    pickLang(c.req.query("lang")),
  );
  const loc = locMap.get(row.id);

  c.header("cache-control", "public, max-age=300");
  return c.json({
    id: row.id,
    type: row.type,
    title: loc?.title ?? row.title,
    posterUrl: loc?.posterUrl ?? row.posterUrl,
    facts: loc?.facts ?? {},
    viewerCount: Number(vc?.n ?? 0),
    reactions,
  });
});

const RAMP = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

function renderJandiSvg(
  username: string,
  counts: Map<string, number>,
  total: number,
): string {
  const CELL = 11;
  const GAP = 3;
  const PAD = 20;
  const HEADER = 54;

  // 지난 53주(주 시작=일요일 정렬)
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay());

  const rects: string[] = [];
  let col = 0;
  const iso = (d: Date) => {
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const row = d.getDay();
    if (row === 0 && d.getTime() !== start.getTime()) col++;
    const lvl = countToLevel(counts.get(iso(d)) ?? 0);
    const x = PAD + col * (CELL + GAP);
    const y = HEADER + row * (CELL + GAP);
    rects.push(
      `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${RAMP[lvl]}"/>`,
    );
  }

  const width = PAD * 2 + (col + 1) * (CELL + GAP);
  const height = HEADER + 7 * (CELL + GAP) + PAD;
  const safeName = username.replace(/[<&>]/g, "");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
<text x="${PAD}" y="30" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#161a22">1OTT · @${safeName}</text>
<text x="${width - PAD}" y="30" text-anchor="end" font-family="Arial, sans-serif" font-size="14" fill="#626b7b">${total} entries</text>
${rects.join("\n")}
</svg>`;
}
