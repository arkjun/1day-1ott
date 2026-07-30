import {
  contentTypeSchema,
  entryInputSchema,
  countToLevel,
  reactionSchema,
  formatEntriesMarkdown,
  parseEntriesMarkdown,
} from "@1ott/shared";
import type {
  ContentType,
  EntryRowData,
  HeatmapCell,
  ParsedEntryRow,
} from "@1ott/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../env";
import {
  deletePublishedEntry,
  publishEntry,
  updatePublishedEntry,
} from "../federation";
import { parseTitles, pickLang, resolveLocalized, withTitles } from "../lib/titles";

const entryPatchSchema = z.object({
  watchedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reaction: reactionSchema.nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  isNotePublic: z.boolean().optional(),
  platform: z.string().max(60).nullable().optional(),
});

const importContentMappingSchema = z.object({
  type: contentTypeSchema,
  title: z.string().min(1).max(300),
  tmdbId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  posterUrl: z.string().url().max(1000).optional(),
});

const importBodySchema = z.object({
  markdown: z.string().max(500_000),
  commit: z.boolean(),
  contentMappings: z.array(importContentMappingSchema).max(500).optional(),
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

const TMDB_TYPES = new Set<ContentType>([
  "movie",
  "tv",
  "variety",
  "documentary",
  "anime",
]);

function contentMatchKey(type: ContentType, title: string): string {
  return `${type}\n${title}`;
}

/** 미리보기에서 한 번만 선택하도록 같은 유형+제목의 행을 묶는다. */
function buildContentMatches(
  rows: ParsedEntryRow[],
): { type: ContentType; title: string; rows: number[] }[] {
  const identified = new Set(
    rows
      .filter((row) => row.tmdbId != null)
      .map((row) => contentMatchKey(row.type, row.title)),
  );
  const grouped = new Map<
    string,
    { type: ContentType; title: string; rows: number[] }
  >();
  for (const row of rows) {
    const key = contentMatchKey(row.type, row.title);
    if (!TMDB_TYPES.has(row.type) || identified.has(key)) continue;
    const found = grouped.get(key);
    if (found) {
      found.rows.push(row.row);
    } else {
      grouped.set(key, { type: row.type, title: row.title, rows: [row.row] });
    }
  }
  return [...grouped.values()];
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
    isNotePublic: input.isNotePublic,
    platform: input.platform ?? null,
  });

  let federationStatus: "published" | "failed" | undefined;
  if (input.note?.trim() && input.isNotePublic) {
    const actor = await db
      .select({ enabled: schema.user.federationEnabled })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .get();
    if (actor?.enabled) {
      await db.insert(schema.federationPublications).values({
        entryId: id,
        userId,
        status: "pending",
      });
      federationStatus = await publishEntry(c.req.raw, c.env, id);
    }
  }

  return c.json({ id, contentId, federationStatus }, 201);
});

/** 대량 업로드 — dry-run(commit:false)은 파싱만, commit:true는 실제 등록. */
entriesRoute.post("/entries/import", async (c) => {
  const parsed = importBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { markdown, commit, contentMappings = [] } = parsed.data;
  const { ok, errors } = parseEntriesMarkdown(markdown);
  if (ok.length + errors.length > 500) {
    return c.json({ error: "too_many_rows" }, 400);
  }

  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  if (!commit) {
    const dupWarnings = await computeDupWarnings(db, userId, ok);
    return c.json({
      committed: false,
      okCount: ok.length,
      errors,
      dupWarnings,
      contentMatches: buildContentMatches(ok),
    });
  }

  const mappings = new Map(
    contentMappings.map((mapping) => [
      contentMatchKey(mapping.type, mapping.title),
      mapping,
    ]),
  );
  for (const row of ok) {
    if (row.tmdbId != null) {
      mappings.set(contentMatchKey(row.type, row.title), {
        type: row.type,
        title: row.title,
        tmdbId: row.tmdbId,
      });
    }
  }

  let inserted = 0;
  const commitErrors = [...errors];
  const importedContents = new Map<string, string>();
  for (const r of ok) {
    // 행 하나가 실패해도(D1 순간 장애 등) 나머지 행은 계속 진행 — 하나만 배치/트랜잭션이
    // 아니므로 여기서 멈추면 이미 커밋된 행을 응답에서 숨기는 셈이 되어 재업로드 시 중복
    // insert를 유발한다. 실패 행은 errors에 합류시켜 inserted가 실제 커밋 수와 맞도록 한다.
    try {
      const mapping = mappings.get(contentMatchKey(r.type, r.title));
      const importedKey = mapping
        ? `${r.type}:tmdb:${mapping.tmdbId}`
        : contentMatchKey(r.type, r.title);
      let contentId = importedContents.get(importedKey);
      if (!contentId) {
        contentId = await upsertContent(
          db,
          {
            type: r.type,
            title: r.title,
            tmdbId: mapping?.tmdbId,
            posterUrl: mapping?.posterUrl,
            watchedOn: r.watchedOn,
            reaction: r.reaction ?? undefined,
            note: r.note ?? undefined,
            isNotePublic: r.isNotePublic,
            platform: r.platform ?? undefined,
          },
          c.req.query("lang"),
        );
        importedContents.set(importedKey, contentId);
      }
      await db.insert(schema.entries).values({
        id: nanoid(),
        userId,
        contentId,
        watchedOn: r.watchedOn,
        reaction: r.reaction ?? null,
        note: r.note ?? null,
        isNotePublic: r.isNotePublic,
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
      isNotePublic: entries.isNotePublic,
      platform: entries.platform,
      tmdbId: content.tmdbId,
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
    isNotePublic: r.isNotePublic,
    platform: r.platform ?? null,
    tmdbId: r.tmdbId,
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
  let federationStatus: "published" | "failed" | "deleted" | undefined;
  const [publication, entry, actor] = await Promise.all([
    db
      .select({ status: schema.federationPublications.status })
      .from(schema.federationPublications)
      .where(eq(schema.federationPublications.entryId, id))
      .get(),
    db
      .select({
        note: schema.entries.note,
        isNotePublic: schema.entries.isNotePublic,
      })
      .from(schema.entries)
      .where(eq(schema.entries.id, id))
      .get(),
    db
      .select({ enabled: schema.user.federationEnabled })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .get(),
  ]);
  const shouldPublish = !!entry?.note?.trim() && entry.isNotePublic && actor?.enabled;

  if (!shouldPublish && publication && publication.status !== "deleted") {
    federationStatus = await deletePublishedEntry(c.req.raw, c.env, id);
  } else if (shouldPublish && publication?.status === "published") {
    if (
      parsed.data.note !== undefined ||
      parsed.data.reaction !== undefined ||
      parsed.data.watchedOn !== undefined
    ) {
      federationStatus = await updatePublishedEntry(c.req.raw, c.env, id);
    }
  } else if (shouldPublish) {
    await db
      .insert(schema.federationPublications)
      .values({
        entryId: id,
        userId,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: schema.federationPublications.entryId,
        set: {
          status: "pending",
          deletedAt: null,
          updatedAt: new Date(),
          lastError: null,
        },
      });
    federationStatus = await publishEntry(c.req.raw, c.env, id);
  }
  return c.json({ ok: true, federationStatus });
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

  const federationStatus = await deletePublishedEntry(c.req.raw, c.env, id);
  await db.delete(schema.entries).where(eq(schema.entries.id, id));
  return c.json({ ok: true, federationStatus });
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
      isNotePublic: entries.isNotePublic,
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
      isNotePublic: r.isNotePublic,
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
      isNotePublic: schema.entries.isNotePublic,
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
