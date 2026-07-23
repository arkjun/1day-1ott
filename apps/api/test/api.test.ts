import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

/**
 * 통합 테스트: 실제 workerd + 실제 D1(격리 스토리지) 위에서 HTTP 전 구간을 검증.
 * 목 없음 — better-auth 가입/세션, drizzle 쿼리 모두 프로덕션과 동일 경로.
 * 각 테스트는 스토리지가 격리되므로 자기 데이터를 스스로 만든다.
 */

const JSON_HEADERS = { "content-type": "application/json" };
let seq = 0;

/** 가입하고 세션 쿠키를 돌려준다. */
async function signUp(name = `user${++seq}`) {
  const res = await app.request(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email: `${name}@example.com`,
        password: "test-password-123",
        name,
      }),
    },
    env,
  );
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c: string) => c.split(";")[0])
    .join("; ");
  expect(cookie).toContain("better-auth");
  return cookie;
}

function authed(cookie: string, init: RequestInit = {}) {
  return {
    ...init,
    headers: { ...JSON_HEADERS, cookie, ...(init.headers ?? {}) },
  };
}

async function createEntry(
  cookie: string,
  overrides: Record<string, unknown> = {},
) {
  return app.request(
    "/api/entries",
    authed(cookie, {
      method: "POST",
      body: JSON.stringify({
        type: "movie",
        title: "듄: 파트2",
        watchedOn: "2026-07-10",
        ...overrides,
      }),
    }),
    env,
  );
}

async function listEntries(cookie: string) {
  const res = await app.request("/api/entries", authed(cookie), env);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { entries: Record<string, unknown>[] };
  return body.entries;
}

describe("인증 게이트", () => {
  it("세션 없이 보호 라우트는 401", async () => {
    for (const [path, init] of [
      ["/api/entries", undefined],
      ["/api/heatmap", undefined],
      ["/api/me", { method: "PATCH", headers: JSON_HEADERS, body: "{}" }],
      ["/api/search?q=dune", undefined],
    ] as const) {
      const res = await app.request(path, init, env);
      expect(res.status, path).toBe(401);
    }
  });

  it("health 와 공개 프로필 라우트는 인증 없이 접근 (없는 유저는 404)", async () => {
    const health = await app.request("/health", undefined, env);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const profile = await app.request("/api/u/nobody", undefined, env);
    expect(profile.status).toBe(404); // 401이 아니라 404 — 게이트를 우회함
  });

  it("가입하면 세션 쿠키로 보호 라우트 접근 가능", async () => {
    const cookie = await signUp();
    expect(await listEntries(cookie)).toEqual([]);
  });
});

describe("기록 생성 (POST /api/entries)", () => {
  it("최소 입력으로 201, 목록에 콘텐츠 조인되어 나타난다", async () => {
    const cookie = await signUp();
    const res = await createEntry(cookie, { reaction: "love", note: "최고" });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; contentId: string };
    expect(created.id).toBeTruthy();

    const entries = await listEntries(cookie);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: created.id,
      title: "듄: 파트2",
      type: "movie",
      watchedOn: "2026-07-10",
      reaction: "love",
      note: "최고",
    });
  });

  it("잘못된 입력은 400 (제목 없음/날짜 형식/모르는 reaction)", async () => {
    const cookie = await signUp();
    for (const bad of [
      { title: "" },
      { watchedOn: "2026-7-1" },
      { reaction: "meh" },
    ]) {
      const res = await createEntry(cookie, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("invalid_input");
    }
  });

  it("같은 tmdbId+type 은 콘텐츠를 재사용한다 (중복 제거)", async () => {
    const cookie = await signUp();
    const a = (await (await createEntry(cookie, { tmdbId: 693134 })).json()) as {
      id: string;
      contentId: string;
    };
    const b = (await (await createEntry(cookie, { tmdbId: 693134 })).json()) as {
      id: string;
      contentId: string;
    };
    expect(b.contentId).toBe(a.contentId);
    expect(b.id).not.toBe(a.id);

    const list = await app.request("/api/entries", authed(cookie), env);
    const body = (await list.json()) as { entries: { contentId: string }[] };
    expect(body.entries.map((entry) => entry.contentId)).toEqual([
      a.contentId,
      a.contentId,
    ]);
  });

  it("contentId로 기존 작품에 새 기록을 연결한다", async () => {
    const cookie = await signUp();
    const first = (await (await createEntry(cookie, { tmdbId: 693135 })).json()) as {
      id: string;
      contentId: string;
    };

    const res = await createEntry(cookie, {
      contentId: first.contentId,
      watchedOn: "2026-07-11",
    });
    expect(res.status).toBe(201);
    const second = (await res.json()) as { id: string; contentId: string };
    expect(second.contentId).toBe(first.contentId);
    expect(second.id).not.toBe(first.id);
  });

  it("없는 contentId와 외부 ID를 함께 보낸 contentId는 거부한다", async () => {
    const cookie = await signUp();

    const missing = await createEntry(cookie, { contentId: "missing-content" });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "invalid_content" });

    const conflicting = await createEntry(cookie, {
      contentId: "some-content",
      tmdbId: 693136,
    });
    expect(conflicting.status).toBe(400);
    expect((await conflicting.json()) as { error: string }).toMatchObject({
      error: "invalid_input",
    });
  });
});

describe("언어별 제목 (GET /api/entries?lang=)", () => {
  it("저장 언어별로 제목을 캐시하고, 목록은 요청 언어 제목을 돌려준다", async () => {
    const cookie = await signUp();
    const tmdbId = 555777; // 다른 테스트와 겹치지 않는 전역 id
    // 같은 작품(tmdbId)을 언어별로 저장 → content.meta.titles 에 언어별 캐시.
    await createEntry(cookie, { tmdbId, title: "기생충" }); // POST 기본은 lang 없음 → content.title
    await app.request(
      `/api/entries?lang=ko`,
      authed(cookie, {
        method: "POST",
        body: JSON.stringify({ type: "movie", title: "기생충", tmdbId, watchedOn: "2026-07-10" }),
      }),
      env,
    );
    await app.request(
      `/api/entries?lang=en`,
      authed(cookie, {
        method: "POST",
        body: JSON.stringify({ type: "movie", title: "Parasite", tmdbId, watchedOn: "2026-07-10" }),
      }),
      env,
    );

    const enRes = await app.request("/api/entries?lang=en", authed(cookie), env);
    const en = (await enRes.json()) as { entries: { tmdbId?: number; title: string }[] };
    expect(en.entries.every((e) => e.title === "Parasite")).toBe(true);

    const koRes = await app.request("/api/entries?lang=ko", authed(cookie), env);
    const ko = (await koRes.json()) as { entries: { title: string }[] };
    expect(ko.entries.every((e) => e.title === "기생충")).toBe(true);
  });

  it("캐시에 없는 언어는 TMDB 토큰 없으면 원문으로 폴백(에러 없음)", async () => {
    const cookie = await signUp();
    await createEntry(cookie, { tmdbId: 555778, title: "듄" }); // lang 없이 저장
    const jaRes = await app.request("/api/entries?lang=ja", authed(cookie), env);
    expect(jaRes.status).toBe(200);
    const ja = (await jaRes.json()) as { entries: { title: string }[] };
    expect(ja.entries[0]?.title).toBe("듄");
  });
});

describe("잔디 (GET /api/heatmap)", () => {
  it("날짜별 count 집계 + level 버킷", async () => {
    const cookie = await signUp();
    await createEntry(cookie, { watchedOn: "2026-07-10" });
    await createEntry(cookie, { title: "무빙", type: "tv", watchedOn: "2026-07-10" });
    await createEntry(cookie, { watchedOn: "2026-07-12" });

    const res = await app.request("/api/heatmap", authed(cookie), env);
    expect(res.status).toBe(200);
    const { cells } = (await res.json()) as {
      cells: { date: string; count: number; level: number }[];
    };
    const byDate = new Map(cells.map((c) => [c.date, c]));
    expect(byDate.get("2026-07-10")).toMatchObject({ count: 2, level: 2 });
    expect(byDate.get("2026-07-12")).toMatchObject({ count: 1, level: 1 });
  });
});

describe("기록 수정 (PATCH /api/entries/:id)", () => {
  it("reaction/note 수정이 반영되고, null 로 해제도 된다", async () => {
    const cookie = await signUp();
    const { id } = (await (await createEntry(cookie, { reaction: "up" })).json()) as {
      id: string;
    };

    const patch = await app.request(
      `/api/entries/${id}`,
      authed(cookie, {
        method: "PATCH",
        body: JSON.stringify({ reaction: "love", note: "다시 봐도 최고" }),
      }),
      env,
    );
    expect(patch.status).toBe(200);
    expect((await listEntries(cookie))[0]).toMatchObject({
      reaction: "love",
      note: "다시 봐도 최고",
    });

    await app.request(
      `/api/entries/${id}`,
      authed(cookie, { method: "PATCH", body: JSON.stringify({ reaction: null }) }),
      env,
    );
    expect((await listEntries(cookie))[0]).toMatchObject({ reaction: null });
  });

  it("남의 기록/없는 기록은 404, 잘못된 값은 400", async () => {
    const owner = await signUp();
    const { id } = (await (await createEntry(owner)).json()) as { id: string };

    const stranger = await signUp();
    const forbidden = await app.request(
      `/api/entries/${id}`,
      authed(stranger, { method: "PATCH", body: JSON.stringify({ note: "해킹" }) }),
      env,
    );
    expect(forbidden.status).toBe(404);

    const missing = await app.request(
      "/api/entries/no-such-id",
      authed(owner, { method: "PATCH", body: JSON.stringify({ note: "x" }) }),
      env,
    );
    expect(missing.status).toBe(404);

    const invalid = await app.request(
      `/api/entries/${id}`,
      authed(owner, { method: "PATCH", body: JSON.stringify({ reaction: "meh" }) }),
      env,
    );
    expect(invalid.status).toBe(400);
  });
});

describe("기록 삭제 (DELETE /api/entries/:id)", () => {
  it("삭제하면 목록에서 사라지고 재삭제는 404", async () => {
    const cookie = await signUp();
    const { id } = (await (await createEntry(cookie)).json()) as { id: string };

    const del = await app.request(
      `/api/entries/${id}`,
      authed(cookie, { method: "DELETE" }),
      env,
    );
    expect(del.status).toBe(200);
    expect(await listEntries(cookie)).toEqual([]);

    const again = await app.request(
      `/api/entries/${id}`,
      authed(cookie, { method: "DELETE" }),
      env,
    );
    expect(again.status).toBe(404);
  });

  it("남의 기록은 삭제할 수 없다 (404)", async () => {
    const owner = await signUp();
    const { id } = (await (await createEntry(owner)).json()) as { id: string };

    const stranger = await signUp();
    const res = await app.request(
      `/api/entries/${id}`,
      authed(stranger, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(404);
    expect(await listEntries(owner)).toHaveLength(1);
  });
});

describe("프로필/공개 (PATCH /api/me, GET /api/u/:username)", () => {
  async function setProfile(cookie: string, body: Record<string, unknown>) {
    return app.request(
      "/api/me",
      authed(cookie, { method: "PATCH", body: JSON.stringify(body) }),
      env,
    );
  }

  it("username 형식 검증 (소문자/숫자/_ 3~20자)", async () => {
    const cookie = await signUp();
    for (const bad of ["AB", "UpperCase", "한글이름", "a".repeat(21)]) {
      const res = await setProfile(cookie, { username: bad });
      expect(res.status, bad).toBe(400);
    }
    expect((await setProfile(cookie, { username: "valid_name1" })).status).toBe(200);
  });

  it("중복 username 은 409", async () => {
    const a = await signUp();
    expect((await setProfile(a, { username: "taken_name" })).status).toBe(200);

    const b = await signUp();
    expect((await setProfile(b, { username: "taken_name" })).status).toBe(409);
  });

  it("비공개면 404, 공개로 바꾸면 잔디/포스터 집계와 함께 200", async () => {
    const cookie = await signUp();
    // 주의: 스토리지는 테스트 간 공유된다(pool-workers 0.18에서 격리 제거).
    // content 는 tmdbId 로 전역 dedup 되므로 다른 테스트와 겹치지 않는 id 를 쓴다.
    await createEntry(cookie, {
      tmdbId: 777001,
      posterUrl: "https://image.tmdb.org/t/p/w342/dune2.jpg",
      watchedOn: "2026-07-10",
    });
    await createEntry(cookie, { title: "포스터 없는 기록", watchedOn: "2026-07-10" });
    await setProfile(cookie, { username: "jandi_user", isPublic: false });

    const hidden = await app.request("/api/u/jandi_user", undefined, env);
    expect(hidden.status).toBe(404);

    await setProfile(cookie, { isPublic: true });
    const res = await app.request("/api/u/jandi_user", undefined, env);
    expect(res.status).toBe(200);
    const profile = (await res.json()) as {
      username: string;
      total: number;
      cells: { date: string; count: number; level: number }[];
      posters: { posterUrl: string | null }[];
    };
    expect(profile.username).toBe("jandi_user");
    expect(profile.total).toBe(2);
    expect(profile.cells).toEqual([{ date: "2026-07-10", count: 2, level: 2 }]);
    // 포스터 그리드에는 posterUrl 있는 콘텐츠만
    expect(profile.posters).toHaveLength(1);
  });

  it("공개 프로필 포스터 제목도 요청 언어를 따른다", async () => {
    const cookie = await signUp();
    const tmdbId = 555779;
    const poster = "https://image.tmdb.org/t/p/w342/x.jpg";
    // ko/en 제목을 각각 캐시(같은 tmdbId, 다른 lang).
    await app.request(
      `/api/entries?lang=ko`,
      authed(cookie, {
        method: "POST",
        body: JSON.stringify({ type: "movie", title: "기생충", tmdbId, posterUrl: poster, watchedOn: "2026-07-10" }),
      }),
      env,
    );
    await app.request(
      `/api/entries?lang=en`,
      authed(cookie, {
        method: "POST",
        body: JSON.stringify({ type: "movie", title: "Parasite", tmdbId, posterUrl: poster, watchedOn: "2026-07-10" }),
      }),
      env,
    );
    await setProfile(cookie, { username: "poster_lang", isPublic: true });

    const en = (await (await app.request("/api/u/poster_lang?lang=en", undefined, env)).json()) as {
      posters: { title: string }[];
    };
    expect(en.posters.every((p) => p.title === "Parasite")).toBe(true);

    const ko = (await (await app.request("/api/u/poster_lang?lang=ko", undefined, env)).json()) as {
      posters: { title: string }[];
    };
    expect(ko.posters.every((p) => p.title === "기생충")).toBe(true);
  });

  it("공유 잔디 SVG: 공개면 image/svg+xml, 비공개면 404", async () => {
    const cookie = await signUp();
    await createEntry(cookie);
    await setProfile(cookie, { username: "svg_user", isPublic: true });

    const res = await app.request("/api/u/svg_user/jandi.svg", undefined, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    const svg = await res.text();
    expect(svg).toContain("@svg_user");
    expect(svg).toContain("1 entries");

    const missing = await app.request("/api/u/no_svg_user/jandi.svg", undefined, env);
    expect(missing.status).toBe(404);
  });
});

describe("Passkey 플러그인 (better-auth)", () => {
  it("로그인 사용자는 빈 passkey 목록을 받는다 (플러그인·테이블 배선 확인)", async () => {
    const cookie = await signUp();
    const res = await app.request(
      "/api/auth/passkey/list-user-passkeys",
      authed(cookie),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("등록 옵션 발급 라우트가 마운트되어 있다 (404 아님)", async () => {
    const cookie = await signUp();
    const res = await app.request(
      "/api/auth/passkey/generate-register-options",
      authed(cookie),
      env,
    );
    expect(res.status).not.toBe(404);
  });
});

describe("검색 (GET /api/search)", () => {
  it("TMDB 토큰이 없으면 503 graceful", async () => {
    const cookie = await signUp();
    const res = await app.request("/api/search?q=dune", authed(cookie), env);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "tmdb_not_configured" });
  });

  it("빈 질의는 빈 결과", async () => {
    const cookie = await signUp();
    const res = await app.request("/api/search?q=", authed(cookie), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });
});

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
    const body = (await res.json()) as {
      committed: boolean;
      okCount: number;
      errors: { row: number; message: string }[];
    };
    expect(body.committed).toBe(false);
    expect(body.okCount).toBe(2);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]?.row).toBe(3);

    // DB 불변 확인: 목록이 비어있어야 한다.
    const list = await app.request("/api/entries", authed(cookie), env);
    const listBody = (await list.json()) as { entries: unknown[] };
    expect(listBody.entries).toHaveLength(0);
  });

  it("commit은 유효 행만 insert하고 오류 행은 제외한다", async () => {
    const cookie = await signUp();
    const res = await importMd(cookie, TABLE, true);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { committed: boolean; inserted: number };
    expect(body.committed).toBe(true);
    expect(body.inserted).toBe(2);

    const list = await app.request("/api/entries", authed(cookie), env);
    const entries = ((await list.json()) as { entries: { title: string }[] }).entries;
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.title).sort()).toEqual(["무빙", "폭싹 속았수다"].sort());
  });

  it("이미 있는 (날짜+제목)은 두 행 모두 dupWarnings로 표시한다", async () => {
    const cookie = await signUp();
    await importMd(cookie, TABLE, true); // 무빙 + 폭싹 속았수다 등록
    const res = await importMd(cookie, TABLE, false);
    const body = (await res.json()) as { dupWarnings: { row: number; watchedOn: string; title: string }[] };
    expect(
      body.dupWarnings.map((d) => ({ row: d.row, title: d.title })).sort((a, b) => a.row - b.row),
    ).toEqual([
      { row: 1, title: "무빙" },
      { row: 2, title: "폭싹 속았수다" },
    ]);
  });

  it("501행이면 400 too_many_rows", async () => {
    const cookie = await signUp();
    const rows = Array.from({ length: 501 }, (_, i) => `| 2026-07-15 | 제목${i} |  |  |  |  |`).join("\n");
    const md = `| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 |\n|--|--|--|--|--|--|\n${rows}`;
    const res = await importMd(cookie, md, false);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("too_many_rows");
  });

  it("잘못된 요청 본문은 400 invalid_input", async () => {
    const cookie = await signUp();
    const res = await app.request(
      "/api/entries/import",
      authed(cookie, { method: "POST", body: JSON.stringify({ markdown: 123, commit: false }) }),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_input");
  });

  it("남의 기록과는 dupWarnings가 겹치지 않는다 (사용자 격리)", async () => {
    const owner = await signUp();
    await importMd(owner, TABLE, true); // owner가 무빙/폭싹 속았수다 등록

    const stranger = await signUp();
    const res = await importMd(stranger, TABLE, false);
    const body = (await res.json()) as { dupWarnings: unknown[] };
    expect(body.dupWarnings).toEqual([]);
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

  it("남의 기록은 export에 포함되지 않는다 (사용자 격리)", async () => {
    const owner = await signUp();
    await createEntry(owner, { title: "남의 기록", type: "movie", watchedOn: "2026-07-11" });

    const stranger = await signUp();
    await createEntry(stranger, { title: "내 기록", type: "movie", watchedOn: "2026-07-12" });
    const res = await app.request("/api/entries/export", authed(stranger), env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("내 기록");
    expect(text).not.toContain("남의 기록");
  });
});

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
    expect(typeof body.posters[0]?.contentId).toBe("string");
  });
});
