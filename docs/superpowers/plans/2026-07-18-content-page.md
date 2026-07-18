# 작품별 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 작품마다 공개 페이지(`/c/:contentId`)를 만들어 익명 시청 집계를 보여주고, 로그인 사용자에게는 하단에 본인 기록을 표시한다.

**Architecture:** API는 무인증 집계(`GET /api/content/:id`, publicRoute)와 인증 필요 본인기록(`GET /api/content/:id/mine`, entriesRoute)으로 인증 경계를 분리한다. 웹은 `App.tsx` 의 기존 pathname 수동 분기에 `/c/` 를 추가하고, 로그인 여부에 따라 `/mine` 을 추가 호출한다.

**Tech Stack:** Hono + Drizzle(SQLite/D1), React + react-i18next, Better Auth, Vitest(cloudflare:test).

## Global Constraints

- 콘텐츠 유형: `tv | movie | variety | documentary | anime | youtube | other` (shared `contentTypes`).
- 반응: `down | up | love` (shared `reactions`). null 가능.
- 익명 집계는 `isPublic` 무관 전체 `entries` 대상(개인 식별 없음).
- 제목 현지화는 기존 `resolveTitles(db, env, rows, pickLang(lang))` 재사용. `lang` 미지정 시 원문.
- 라우터 라이브러리 도입 금지. `window.location.pathname` 수동 분기 유지.
- 패키지 매니저 pnpm. 테스트: `pnpm --filter @1ott/api test`, 타입: `pnpm typecheck`.

---

### Task 1: shared 타입 정의

**Files:**
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `ContentDetail`, `MyContentEntry` 인터페이스. `PublicProfile.posters[].contentId` 필드 추가.

- [ ] **Step 1: 타입 추가**

`packages/shared/src/index.ts` 의 `PublicProfile` 인터페이스 아래에 추가하고, `PublicProfile.posters` 항목에 `contentId` 를 넣는다.

```ts
/** 공개 프로필 응답. */
export interface PublicProfile {
  username: string;
  name: string;
  total: number;
  cells: HeatmapCell[];
  posters: { id: string; contentId: string; title: string; posterUrl: string | null }[];
}

/** 작품 공개 페이지: 작품 정보 + 익명 집계. */
export interface ContentDetail {
  id: string;
  type: ContentType;
  title: string;
  posterUrl: string | null;
  viewerCount: number;
  reactions: { down: number; up: number; love: number };
}

/** 작품 페이지 하단 '내 기록' 한 줄. */
export interface MyContentEntry {
  id: string;
  watchedOn: string;
  reaction: Reaction | null;
  note: string | null;
  platform: string | null;
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm typecheck`
Expected: PASS (아직 소비처 없음, 타입만 추가). `public.ts` 의 posters 매핑이 `contentId` 를 아직 안 넣어 에러가 날 수 있음 — 그렇다면 Task 4에서 고치므로 여기서는 shared 패키지만 확인: `pnpm --filter @1ott/shared typecheck`. Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add packages/shared/src/index.ts
git commit -m "feat: 작품 페이지용 shared 타입(ContentDetail·MyContentEntry) 추가"
```

---

### Task 2: API 공개 집계 엔드포인트

**Files:**
- Modify: `apps/api/src/routes/public.ts`
- Test: `apps/api/test/api.test.ts`

**Interfaces:**
- Consumes: `resolveTitles`, `pickLang` (`../lib/titles`), `schema.content`, `schema.entries`.
- Produces: `GET /api/content/:id` → `ContentDetail` JSON, 없으면 404 `{ error: "not_found" }`.

- [ ] **Step 1: 실패 테스트 작성**

`apps/api/test/api.test.ts` 끝에 추가. 같은 작품(tmdbId 동일)을 두 유저가 기록하면 viewerCount=2, 반응 분포가 집계되는지 검증한다.

```ts
describe("GET /api/content/:id (공개 집계)", () => {
  it("두 유저의 같은 작품을 익명 집계한다", async () => {
    const a = await signUp();
    const b = await signUp();
    // a: 같은 tmdbId 작품을 2회(up, love), b: 1회(up)
    const r1 = await createEntry(a, { tmdbId: 550, title: "파이트 클럽", reaction: "up" });
    const { contentId } = (await r1.json()) as { contentId: string };
    await createEntry(a, { tmdbId: 550, title: "파이트 클럽", reaction: "love", watchedOn: "2026-07-11" });
    await createEntry(b, { tmdbId: 550, title: "파이트 클럽", reaction: "up", watchedOn: "2026-07-12" });

    const res = await app.request(`/api/content/${contentId}`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      viewerCount: number;
      reactions: { down: number; up: number; love: number };
      type: string;
    };
    expect(body.viewerCount).toBe(2);
    expect(body.reactions).toEqual({ down: 0, up: 2, love: 1 });
    expect(body.type).toBe("movie");
  });

  it("없는 작품은 404", async () => {
    const res = await app.request("/api/content/nope", {}, env);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @1ott/api test -- api.test.ts`
Expected: FAIL — `/api/content/:id` 핸들러가 publicRoute 에 없어 요청이 인증 게이트로 넘어가 401 이 온다(집계 200 기대, 404 기대 모두 불일치).

- [ ] **Step 3: 엔드포인트 구현**

`apps/api/src/routes/public.ts` 에 import 를 보강하고(`and` 는 이미 있음, `entries` 는 `schema.entries` 로 접근) 핸들러를 추가한다. `renderJandiSvg` 정의 앞(라우트 핸들러 구역)에 둔다.

```ts
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

  const titleMap = await resolveTitles(
    db,
    c.env,
    [{ contentId: row.id, type: row.type, title: row.title, tmdbId: row.tmdbId, meta: row.meta }],
    pickLang(c.req.query("lang")),
  );

  return c.json({
    id: row.id,
    type: row.type,
    title: titleMap.get(row.id) ?? row.title,
    posterUrl: row.posterUrl,
    viewerCount: Number(vc?.n ?? 0),
    reactions,
  });
});
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @1ott/api test -- api.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/routes/public.ts apps/api/test/api.test.ts
git commit -m "feat: 작품 공개 집계 API(GET /api/content/:id)"
```

---

### Task 3: API 본인기록 엔드포인트 `/mine`

**Files:**
- Modify: `apps/api/src/routes/entries.ts`
- Test: `apps/api/test/api.test.ts`

**Interfaces:**
- Consumes: `schema.entries`, `and`, `eq`, `desc`(이미 import 됨), `c.get("userId")`.
- Produces: `GET /api/content/:id/mine` → `{ entries: MyContentEntry[] }`. 인증 필요(게이트 뒤).

- [ ] **Step 1: 실패 테스트 작성**

`apps/api/test/api.test.ts` 끝에 추가.

```ts
describe("GET /api/content/:id/mine (본인 기록)", () => {
  it("무인증이면 401", async () => {
    const res = await app.request("/api/content/whatever/mine", {}, env);
    expect(res.status).toBe(401);
  });

  it("해당 작품의 본인 기록만 최신순으로 준다", async () => {
    const a = await signUp();
    const b = await signUp();
    const r1 = await createEntry(a, { tmdbId: 603, title: "매트릭스", watchedOn: "2026-07-10", reaction: "up" });
    const { contentId } = (await r1.json()) as { contentId: string };
    await createEntry(a, { tmdbId: 603, title: "매트릭스", watchedOn: "2026-07-13", reaction: "love" });
    await createEntry(b, { tmdbId: 603, title: "매트릭스", watchedOn: "2026-07-12" }); // 남의 기록

    const res = await app.request(`/api/content/${contentId}/mine`, authed(a), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { watchedOn: string; reaction: string | null }[] };
    expect(body.entries.map((e) => e.watchedOn)).toEqual(["2026-07-13", "2026-07-10"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @1ott/api test -- api.test.ts`
Expected: FAIL — 401 테스트는 게이트가 이미 막아 통과할 수 있으나, 본문 테스트는 라우트 없어 실패.

- [ ] **Step 3: 엔드포인트 구현**

`apps/api/src/routes/entries.ts` 에 추가(`and` 는 이미 import 됨). 다른 `/entries/...` 핸들러 근처, export 후 아무 위치.

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @1ott/api test -- api.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/routes/entries.ts apps/api/test/api.test.ts
git commit -m "feat: 작품별 본인 기록 API(GET /api/content/:id/mine)"
```

---

### Task 4: 공개 프로필 posters 에 contentId 노출

**Files:**
- Modify: `apps/api/src/routes/public.ts`
- Test: `apps/api/test/api.test.ts`

**Interfaces:**
- Consumes: `GET /api/u/:username` 의 기존 posters 매핑.
- Produces: posters 각 항목에 `contentId` 포함(진입점 연결용).

- [ ] **Step 1: 실패 테스트 작성**

`apps/api/test/api.test.ts` 끝에 추가. 공개 프로필 응답 posters 에 contentId 가 있는지 검증한다. (username 설정 + isPublic 은 `PATCH /api/me` 로.)

```ts
describe("GET /api/u/:username posters", () => {
  it("posters 항목에 contentId 가 포함된다", async () => {
    const a = await signUp();
    await app.request("/api/me", authed(a, {
      method: "PATCH",
      body: JSON.stringify({ username: `poster${seq}`, isPublic: true }),
    }), env);
    await createEntry(a, {
      tmdbId: 27205, title: "인셉션",
      posterUrl: "https://image.tmdb.org/t/p/w500/x.jpg",
    });

    const res = await app.request(`/api/u/poster${seq}`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { posters: { contentId?: string }[] };
    expect(body.posters.length).toBeGreaterThan(0);
    expect(typeof body.posters[0].contentId).toBe("string");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @1ott/api test -- api.test.ts`
Expected: FAIL — posters[0].contentId 가 undefined.

- [ ] **Step 3: 매핑 수정**

`apps/api/src/routes/public.ts` 의 `/u/:username` 핸들러에서 posters 매핑에 contentId 추가. posterRows 는 이미 `contentId: schema.content.id` 를 select 하고 있으므로 매핑만 고친다.

```ts
  const posters = posterRows.map((p) => ({
    id: p.id,
    contentId: p.contentId,
    title: titleByContent.get(p.contentId) ?? p.title,
    posterUrl: p.posterUrl,
  }));
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @1ott/api test -- api.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/routes/public.ts apps/api/test/api.test.ts
git commit -m "feat: 공개 프로필 posters 에 contentId 노출(작품 페이지 링크용)"
```

---

### Task 5: 웹 API 클라이언트 메서드

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: shared `ContentDetail`, `MyContentEntry`.
- Produces: `api.content(id)`, `api.contentMine(id)`.

- [ ] **Step 1: import 보강**

`apps/web/src/lib/api.ts` 상단 shared import 에 `ContentDetail`, `MyContentEntry` 추가.

```ts
import type { ContentDetail, ContentType, EntryInput, HeatmapCell, MyContentEntry, Reaction, SearchResult } from "@1ott/shared";
```

- [ ] **Step 2: 메서드 추가**

`api` 객체 안(예: `publicProfile` 아래)에 추가.

```ts
  content: (id: string) =>
    req<ContentDetail>(`/api/content/${encodeURIComponent(id)}?lang=${i18n.language}`),
  contentMine: (id: string) =>
    req<{ entries: MyContentEntry[] }>(`/api/content/${encodeURIComponent(id)}/mine`),
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: 웹 api 클라이언트에 content/contentMine 추가"
```

---

### Task 6: RecentItem 컴포넌트 분리

App.tsx 내부 함수 `RecentItem` 을 ContentPage 에서도 재사용하기 위해 별도 파일로 이동한다. 동작 변경 없음(순수 이동 + export).

**Files:**
- Create: `apps/web/src/components/RecentItem.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces: `export function RecentItem({ entry, onChanged }: { entry: EntryRow; onChanged: () => void })`.

- [ ] **Step 1: 새 파일 생성**

`apps/web/src/components/RecentItem.tsx` 를 만들고, App.tsx 의 `RecentItem` 함수 본문을 그대로 옮긴다. 필요한 import 와 이 컴포넌트가 쓰는 스타일만 로컬로 정의한다.

```tsx
import type { Reaction } from "@1ott/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type EntryRow } from "../lib/api";
import { REACTION_META } from "../lib/reactions";
import { ReactionPicker } from "./RecordModal";

/** 최근 기록 한 줄: 인라인 수정(반응/감상/날짜) + 2단계 삭제. */
export function RecentItem({ entry, onChanged }: { entry: EntryRow; onChanged: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [watchedOn, setWatchedOn] = useState(entry.watchedOn);
  const [reaction, setReaction] = useState<Reaction | null>(entry.reaction);
  const [note, setNote] = useState(entry.note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.updateEntry(entry.id, {
        watchedOn,
        reaction: reaction ?? null,
        note: note.trim() || null,
      });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await api.deleteEntry(entry.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div style={st.entryEdit}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          {t(`type.${entry.type}`)} · {entry.title}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="date"
            style={{ ...st.input, width: 150 }}
            value={watchedOn}
            onChange={(e) => setWatchedOn(e.target.value)}
          />
          <ReactionPicker value={reaction} onChange={setReaction} />
        </div>
        <input
          style={{ ...st.input, width: "100%", marginTop: 8 }}
          placeholder={t("note.placeholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={st.primary} disabled={busy} onClick={save}>
            {t("common.save")}
          </button>
          <button style={st.ghost} onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={st.entryRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{entry.watchedOn}</b> · {t(`type.${entry.type}`)} · {entry.title}
        {entry.reaction ? ` · ${REACTION_META[entry.reaction].emoji}` : ""}
        {entry.note ? <span style={st.muted}> · {entry.note}</span> : null}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button style={st.smallBtn} onClick={() => setEditing(true)}>
          {t("common.edit")}
        </button>
        {confirmDel ? (
          <>
            <button style={{ ...st.smallBtn, color: "crimson" }} disabled={busy} onClick={del}>
              {t("common.confirmDelete")}
            </button>
            <button style={st.smallBtn} onClick={() => setConfirmDel(false)}>
              {t("common.cancel")}
            </button>
          </>
        ) : (
          <button style={st.smallBtn} onClick={() => setConfirmDel(true)}>
            {t("common.del")}
          </button>
        )}
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  muted: { color: "var(--muted)", fontSize: 12 },
  primary: {
    border: 0,
    borderRadius: 10,
    padding: "9px 16px",
    background: "linear-gradient(135deg,var(--accent),var(--accent-ink))",
    color: "#fff",
    fontWeight: 700,
    boxShadow: "0 4px 14px var(--accent-weak)",
  },
  ghost: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", background: "var(--surface)", color: "inherit" },
  entryRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  entryEdit: { padding: "12px", margin: "6px 0", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)" },
  smallBtn: { border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", background: "var(--surface)", color: "var(--muted)", fontSize: 12 },
  input: { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "inherit", fontSize: 14 },
};
```

- [ ] **Step 2: App.tsx 에서 제거 + import**

`apps/web/src/App.tsx` 에서 `RecentItem` 함수 정의 전체(약 39~137행)를 삭제한다. 상단 import 에 추가:

```ts
import { RecentItem } from "./components/RecentItem";
```

기존 `import { RecordModal, ReactionPicker } from "./components/RecordModal";` 에서 `ReactionPicker` 가 App.tsx 내 다른 곳에서 안 쓰이면(현재 RecentItem 만 사용) import 에서 뺀다. 사용처 확인: App.tsx 에서 `ReactionPicker` 검색 → RecentItem 외 사용 없으면 제거, 있으면 유지.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `pnpm typecheck && pnpm --filter @1ott/web build`
Expected: PASS. (미사용 import 경고 없어야 함.)

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/RecentItem.tsx apps/web/src/App.tsx
git commit -m "refactor: RecentItem 을 별도 컴포넌트로 분리(작품 페이지 재사용)"
```

---

### Task 7: ContentPage 컴포넌트 + 라우팅

**Files:**
- Create: `apps/web/src/components/ContentPage.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `api.content`, `api.contentMine`, `useSession`, `RecentItem`, `EntryRow`, shared `ContentDetail`/`MyContentEntry`, `REACTION_META`.
- Produces: `export function ContentPage({ contentId }: { contentId: string })`.

- [ ] **Step 1: ContentPage 작성**

`apps/web/src/components/ContentPage.tsx` 생성. 상단 작품 정보 + 익명 집계, 로그인 시 하단 내 기록(RecentItem 재사용). `/mine` 응답을 `EntryRow` 로 변환해 RecentItem 에 넘긴다(type/title 은 상단 detail 값 사용, posterUrl 은 null).

```tsx
import type { ContentDetail, MyContentEntry } from "@1ott/shared";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type EntryRow } from "../lib/api";
import { useSession } from "../lib/authClient";
import { LanguageSelect } from "./LanguageSelect";
import { RecentItem } from "./RecentItem";
import { REACTION_META } from "../lib/reactions";

export function ContentPage({ contentId }: { contentId: string }) {
  const { t, i18n } = useTranslation();
  const { data: session } = useSession();
  const [detail, setDetail] = useState<ContentDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [mine, setMine] = useState<MyContentEntry[]>([]);

  const loadDetail = useCallback(() => {
    api
      .content(contentId)
      .then((d) => {
        setDetail(d);
        setState("ok");
      })
      .catch(() => setState("notfound"));
  }, [contentId]);

  const loadMine = useCallback(() => {
    if (!session?.user) {
      setMine([]);
      return;
    }
    api.contentMine(contentId).then((r) => setMine(r.entries)).catch(() => setMine([]));
  }, [contentId, session?.user]);

  // 언어 바뀌면 제목 다시. 로그인/작품 바뀌면 내 기록 다시.
  useEffect(() => loadDetail(), [loadDetail, i18n.language]);
  useEffect(() => loadMine(), [loadMine]);

  function refresh() {
    loadDetail();
    loadMine();
  }

  if (state === "loading") return <p style={{ padding: 24 }}>{t("common.loading")}</p>;
  if (state === "notfound" || !detail)
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <h2>{t("content.notFoundTitle")}</h2>
        <a href="/">{t("profile.toHome")}</a>
      </div>
    );

  // /mine 응답을 RecentItem 이 기대하는 EntryRow 로 변환.
  const myRows: EntryRow[] = mine.map((m) => ({
    ...m,
    contentId,
    type: detail.type,
    title: detail.title,
    posterUrl: null,
  }));

  return (
    <div style={st.wrap}>
      <div style={st.top}>
        <a style={{ ...st.ghost, textDecoration: "none" }} href="/">
          ← {t("nav.home")}
        </a>
        <LanguageSelect />
      </div>

      <div style={st.hero}>
        {detail.posterUrl && (
          <img src={detail.posterUrl} alt={detail.title} style={st.poster} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={st.muted}>{t(`type.${detail.type}`)}</div>
          <h1 style={{ margin: "4px 0 12px", letterSpacing: "-0.02em" }}>{detail.title}</h1>
          <div style={st.aggRow}>
            <span>👥 {t("content.viewers", { count: detail.viewerCount })}</span>
            <span>{REACTION_META.up.emoji} {detail.reactions.up}</span>
            <span>{REACTION_META.love.emoji} {detail.reactions.love}</span>
            <span>{REACTION_META.down.emoji} {detail.reactions.down}</span>
          </div>
        </div>
      </div>

      {session?.user && (
        <div style={st.card}>
          <div style={{ marginBottom: 12 }}>
            <b>{t("content.myRecords")}</b>
          </div>
          {myRows.length > 0 ? (
            myRows.map((e) => <RecentItem key={e.id} entry={e} onChanged={refresh} />)
          ) : (
            <div style={st.muted}>{t("content.myEmpty")}</div>
          )}
        </div>
      )}
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 780, margin: "0 auto", padding: "28px 20px 60px" },
  top: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  hero: { display: "flex", gap: 16, marginBottom: 20 },
  poster: { width: 120, aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" },
  aggRow: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 15, color: "var(--muted)" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginBottom: 16, boxShadow: "var(--shadow)" },
  muted: { color: "var(--muted)", fontSize: 13 },
  ghost: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", background: "var(--surface)", color: "inherit" },
};
```

- [ ] **Step 2: i18n 키 추가**

locale 파일은 **중첩 객체** 구조다(예: `profile: { notFoundTitle: "...", toHome: "..." }`). 플랫 문자열 키가 아니다. 각 파일의 `profile: { ... }` 블록 근처에 `content:` 네임스페이스를 추가한다. `t()` 는 코드에서 점 표기(`t("content.viewers")`)로 접근하므로 ContentPage 코드는 그대로 둔다.

`apps/web/src/i18n/locales/ko.ts`:
```ts
  content: {
    notFoundTitle: "작품을 찾을 수 없어요",
    viewers: "{{count}}명이 봤어요",
    myRecords: "내 기록",
    myEmpty: "아직 이 작품 기록이 없어요",
  },
```

`apps/web/src/i18n/locales/en.ts`:
```ts
  content: {
    notFoundTitle: "Content not found",
    viewers: "{{count}} watched",
    myRecords: "My records",
    myEmpty: "No records for this yet",
  },
```

`apps/web/src/i18n/locales/ja.ts`:
```ts
  content: {
    notFoundTitle: "作品が見つかりません",
    viewers: "{{count}}人が視聴",
    myRecords: "自分の記録",
    myEmpty: "まだこの作品の記録がありません",
  },
```

`profile.toHome` 은 이미 있으므로 ContentPage 의 not-found 링크에서 재사용한다.

- [ ] **Step 3: App.tsx 라우팅 분기**

`apps/web/src/App.tsx` 의 `App()` 함수에서 `/u/` 분기 옆에 `/c/` 를 추가한다. 무인증 접근이므로 `AuthedApp` 밖(공개 프로필과 동일 레벨).

```tsx
import { ContentPage } from "./components/ContentPage";
// ...
export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/u/")) {
    const username = decodeURIComponent(path.slice(3).split("/")[0] ?? "");
    if (username) return <PublicProfile username={username} />;
  }
  if (path.startsWith("/c/")) {
    const id = decodeURIComponent(path.slice(3).split("/")[0] ?? "");
    if (id) return <ContentPage contentId={id} />;
  }
  return <AuthedApp />;
}
```

- [ ] **Step 4: 타입 체크 + 빌드**

Run: `pnpm typecheck && pnpm --filter @1ott/web build`
Expected: PASS.

- [ ] **Step 5: 수동 검증**

Run: `pnpm dev:api` (별 터미널) + `pnpm dev:web`. 로그인 후 기록 하나 만들고, 그 작품의 contentId 로 `/c/<id>` 접속.
Expected: 상단에 작품 정보·집계, 로그인 상태라 하단에 내 기록 표시. 로그아웃(또는 시크릿창)에서 같은 URL → 하단 내 기록 섹션 없이 집계만.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/ContentPage.tsx apps/web/src/App.tsx apps/web/src/i18n/locales/
git commit -m "feat: 작품 페이지(/c/:id) — 공개 집계 + 로그인 시 내 기록"
```

---

### Task 8: 진입점 연결(포스터·최근기록 클릭)

**Files:**
- Modify: `apps/web/src/App.tsx` (Dashboard)
- Modify: `apps/web/src/components/PublicProfile.tsx`

**Interfaces:**
- Consumes: `EntryRow.contentId`, `PublicProfile.posters[].contentId`.

- [ ] **Step 1: Dashboard 포스터 그리드 링크**

`apps/web/src/App.tsx` 의 Dashboard posters 렌더를 `<a href>` 로 감싼다.

```tsx
            {posters.map((e) => (
              <a key={e.id} href={`/c/${e.contentId}`} style={{ display: "block" }}>
                <img src={e.posterUrl!} alt={e.title} title={e.title} style={st.poster} />
              </a>
            ))}
```

- [ ] **Step 2: Dashboard 최근 기록 링크**

Dashboard 는 `RecentItem` 을 쓴다. RecentItem 은 편집/삭제 버튼이 있어 행 전체를 링크로 감싸면 클릭이 충돌한다. 대신 제목만 링크로 만든다 — RecentItem.tsx 의 표시 줄에서 `{entry.title}` 을 링크로 바꾼다.

`apps/web/src/components/RecentItem.tsx` 의 비편집 렌더에서:

```tsx
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{entry.watchedOn}</b> · {t(`type.${entry.type}`)} ·{" "}
        <a href={`/c/${entry.contentId}`} style={{ color: "inherit" }}>{entry.title}</a>
        {entry.reaction ? ` · ${REACTION_META[entry.reaction].emoji}` : ""}
        {entry.note ? <span style={st.muted}> · {entry.note}</span> : null}
      </div>
```

주의: ContentPage 하단의 내 기록에서도 이 링크가 보이지만 같은 페이지로의 링크라 무해하다.

- [ ] **Step 3: PublicProfile 포스터 링크**

`apps/web/src/components/PublicProfile.tsx` 의 posters 렌더는 `.filter((p) => p.posterUrl).map(...)` 형태다. `<img>` 를 `<a href>` 로 감싼다.

기존:
```tsx
            {profile.posters
              .filter((p) => p.posterUrl)
              .map((p) => (
                <img key={p.id} src={p.posterUrl!} alt={p.title} title={p.title} style={st.poster} />
              ))}
```

변경:
```tsx
            {profile.posters
              .filter((p) => p.posterUrl)
              .map((p) => (
                <a key={p.id} href={`/c/${p.contentId}`} style={{ display: "block" }}>
                  <img src={p.posterUrl!} alt={p.title} title={p.title} style={st.poster} />
                </a>
              ))}
```

- [ ] **Step 4: 타입 체크 + 빌드**

Run: `pnpm typecheck && pnpm --filter @1ott/web build`
Expected: PASS.

- [ ] **Step 5: 수동 검증**

`pnpm dev:web` 에서 대시보드 포스터/최근기록 제목 클릭 → `/c/:id` 이동. 공개 프로필(`/u/:username`) 포스터 클릭 → `/c/:id` 이동.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/App.tsx apps/web/src/components/RecentItem.tsx apps/web/src/components/PublicProfile.tsx
git commit -m "feat: 포스터·최근기록에서 작품 페이지로 진입점 연결"
```

---

## 완료 기준

- `/c/:contentId` 무인증 접근 시 작품 정보 + 익명 집계 표시.
- 로그인 시 하단에 본인 기록 + 인라인 수정/삭제 동작.
- 대시보드·공개 프로필 포스터, 대시보드 최근기록 제목에서 작품 페이지 진입.
- `pnpm --filter @1ott/api test` 전부 통과, `pnpm typecheck` 통과.
