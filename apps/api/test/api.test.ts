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
