import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createAuth } from "../src/auth";
import { app } from "../src/index";

const JSON_HEADERS = { "content-type": "application/json" };
let seq = 0;

async function signUp() {
  const name = `follow-user-${++seq}`;
  const email = `${name}@example.com`;
  let verificationUrl: string | undefined;
  const auth = createAuth(env, {
    sendVerificationEmail: async (message) => {
      verificationUrl = message.verificationUrl;
    },
  });
  await auth.api.signUpEmail({
    headers: new Headers(JSON_HEADERS),
    body: {
      email,
      password: "test-password-123",
      name,
      callbackURL: "/",
    },
  });
  const token = new URL(verificationUrl!).searchParams.get("token")!;
  await auth.api.verifyEmail({ query: { token } });

  const login = await app.request(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email,
        password: "test-password-123",
      }),
    },
    env,
  );
  const cookie = login.headers
    .getSetCookie()
    .map((value: string) => value.split(";")[0])
    .join("; ");
  const row = await env.DB.prepare(
    "SELECT id FROM user WHERE email = ?",
  )
    .bind(email)
    .first<{ id: string }>();
  return { cookie, userId: row!.id };
}

function authed(cookie: string, init: RequestInit = {}) {
  return {
    ...init,
    headers: { ...JSON_HEADERS, cookie, ...(init.headers ?? {}) },
  };
}

async function setProfile(
  cookie: string,
  username: string,
  isPublic = true,
) {
  const response = await app.request(
    "/api/me",
    authed(cookie, {
      method: "PATCH",
      body: JSON.stringify({ username, isPublic }),
    }),
    env,
  );
  expect(response.status, await response.clone().text()).toBe(200);
}

async function profile(username: string) {
  const response = await app.request(`/api/u/${username}`, undefined, env);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json() as Promise<{
    followerCount: number;
    followingCount: number;
  }>;
}

describe("사용자 팔로우", () => {
  it("상태와 변경 API는 인증이 필요하다", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await app.request(
        "/api/follows/nobody",
        { method },
        env,
      );
      expect(response.status, method).toBe(401);
    }
  });

  it("공개 사용자를 멱등하게 팔로우하고 해제한다", async () => {
    const follower = await signUp();
    const followee = await signUp();
    await setProfile(follower.cookie, "idempotent_follower");
    await setProfile(followee.cookie, "idempotent_followee");

    const before = await app.request(
      "/api/follows/idempotent_followee",
      authed(follower.cookie),
      env,
    );
    expect(await before.json()).toEqual({
      isSelf: false,
      following: false,
    });

    for (const expectedCount of [1, 1]) {
      const followed = await app.request(
        "/api/follows/idempotent_followee",
        authed(follower.cookie, { method: "PUT" }),
        env,
      );
      expect(followed.status).toBe(200);
      expect(await followed.json()).toEqual({
        following: true,
        followerCount: expectedCount,
      });
    }

    expect(await profile("idempotent_follower")).toMatchObject({
      followerCount: 0,
      followingCount: 1,
    });
    expect(await profile("idempotent_followee")).toMatchObject({
      followerCount: 1,
      followingCount: 0,
    });

    for (const expectedCount of [0, 0]) {
      const unfollowed = await app.request(
        "/api/follows/idempotent_followee",
        authed(follower.cookie, { method: "DELETE" }),
        env,
      );
      expect(unfollowed.status).toBe(200);
      expect(await unfollowed.json()).toEqual({
        following: false,
        followerCount: expectedCount,
      });
    }
  });

  it("자기 자신은 거부하고 없거나 비공개인 대상은 노출하지 않는다", async () => {
    const actor = await signUp();
    const hidden = await signUp();
    await setProfile(actor.cookie, "self_follow");
    await setProfile(hidden.cookie, "hidden_follow", false);

    const selfStatus = await app.request(
      "/api/follows/self_follow",
      authed(actor.cookie),
      env,
    );
    expect(await selfStatus.json()).toEqual({
      isSelf: true,
      following: false,
    });

    const selfFollow = await app.request(
      "/api/follows/self_follow",
      authed(actor.cookie, { method: "PUT" }),
      env,
    );
    expect(selfFollow.status).toBe(409);
    expect(await selfFollow.json()).toEqual({
      error: "cannot_follow_self",
    });
    await expect(
      env.DB.prepare(
        `INSERT INTO user_follows (follower_id, followee_id)
         VALUES (?, ?)`,
      )
        .bind(actor.userId, actor.userId)
        .run(),
    ).rejects.toThrow();

    for (const username of ["hidden_follow", "missing_follow"]) {
      const response = await app.request(
        `/api/follows/${username}`,
        authed(actor.cookie, { method: "PUT" }),
        env,
      );
      expect(response.status, username).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
  });

  it("사용자명 변경에는 관계를 유지하고 사용자 삭제에는 cascade한다", async () => {
    const follower = await signUp();
    const followee = await signUp();
    await setProfile(follower.cookie, "stable_follower");
    await setProfile(followee.cookie, "before_rename");
    await app.request(
      "/api/follows/before_rename",
      authed(follower.cookie, { method: "PUT" }),
      env,
    );

    await setProfile(followee.cookie, "after_rename");
    const status = await app.request(
      "/api/follows/after_rename",
      authed(follower.cookie),
      env,
    );
    expect(await status.json()).toEqual({
      isSelf: false,
      following: true,
    });

    await env.DB.prepare("DELETE FROM user WHERE id = ?")
      .bind(followee.userId)
      .run();
    const relation = await env.DB.prepare(
      `SELECT count(*) AS count
         FROM user_follows
        WHERE follower_id = ? OR followee_id = ?`,
    )
      .bind(followee.userId, followee.userId)
      .first<{ count: number }>();
    expect(relation?.count).toBe(0);
  });

  it("대상이 비공개로 전환돼도 관계를 보존하고 공개 시 복원한다", async () => {
    const follower = await signUp();
    const followee = await signUp();
    await setProfile(follower.cookie, "restore_follower");
    await setProfile(followee.cookie, "restore_followee");

    await app.request(
      "/api/follows/restore_followee",
      authed(follower.cookie, { method: "PUT" }),
      env,
    );
    expect(await profile("restore_follower")).toMatchObject({
      followingCount: 1,
    });

    await setProfile(followee.cookie, "restore_followee", false);
    expect(await profile("restore_follower")).toMatchObject({
      followingCount: 0,
    });
    const stored = await env.DB.prepare(
      `SELECT count(*) AS count
         FROM user_follows
        WHERE follower_id = ? AND followee_id = ?`,
    )
      .bind(follower.userId, followee.userId)
      .first<{ count: number }>();
    expect(stored?.count).toBe(1);

    await setProfile(followee.cookie, "restore_followee", true);
    expect(await profile("restore_follower")).toMatchObject({
      followingCount: 1,
    });
  });

  it("비공개 팔로워는 수치에는 포함하고 공개 목록에서는 숨긴다", async () => {
    const target = await signUp();
    const publicFollower = await signUp();
    const privateFollower = await signUp();
    await setProfile(target.cookie, "privacy_target");
    await setProfile(publicFollower.cookie, "public_follower");
    await setProfile(privateFollower.cookie, "private_follower", false);

    for (const cookie of [publicFollower.cookie, privateFollower.cookie]) {
      const response = await app.request(
        "/api/follows/privacy_target",
        authed(cookie, { method: "PUT" }),
        env,
      );
      expect(response.status).toBe(200);
    }

    expect(await profile("privacy_target")).toMatchObject({
      followerCount: 2,
    });
    const followers = await app.request(
      "/api/u/privacy_target/followers",
      undefined,
      env,
    );
    expect(followers.status).toBe(200);
    expect(await followers.json()).toEqual({
      users: [
        expect.objectContaining({ username: "public_follower" }),
      ],
      nextCursor: null,
    });
  });

  it("팔로워와 팔로잉 목록을 불투명 커서로 페이지 조회한다", async () => {
    const target = await signUp();
    const first = await signUp();
    const second = await signUp();
    await setProfile(target.cookie, "cursor_target");
    await setProfile(first.cookie, "cursor_first");
    await setProfile(second.cookie, "cursor_second");

    for (const cookie of [first.cookie, second.cookie]) {
      await app.request(
        "/api/follows/cursor_target",
        authed(cookie, { method: "PUT" }),
        env,
      );
    }

    const pageOne = await app.request(
      "/api/u/cursor_target/followers?limit=1",
      undefined,
      env,
    );
    expect(pageOne.status).toBe(200);
    const firstPage = (await pageOne.json()) as {
      users: { username: string }[];
      nextCursor: string | null;
    };
    expect(firstPage.users).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();

    const pageTwo = await app.request(
      `/api/u/cursor_target/followers?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
      undefined,
      env,
    );
    const secondPage = (await pageTwo.json()) as {
      users: { username: string }[];
      nextCursor: string | null;
    };
    expect(secondPage.users).toHaveLength(1);
    expect(secondPage.users[0]?.username).not.toBe(
      firstPage.users[0]?.username,
    );
    expect(secondPage.nextCursor).toBeNull();

    const following = await app.request(
      "/api/u/cursor_first/following",
      undefined,
      env,
    );
    expect(await following.json()).toEqual({
      users: [
        expect.objectContaining({ username: "cursor_target" }),
      ],
      nextCursor: null,
    });

    const invalid = await app.request(
      "/api/u/cursor_target/followers?cursor=not-a-cursor",
      undefined,
      env,
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "invalid_cursor" });
  });
});
