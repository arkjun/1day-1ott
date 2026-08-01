import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_FEDERATION_INBOX_BODY_BYTES,
  prepareFederationInboxRequest,
} from "../src/federation/inbox-policy";
import { handleFederationRequest } from "../src/federation";

const INBOX_URL = "http://localhost/ap/inbox";

function activityRequest(body: unknown, contentType = "application/activity+json") {
  return new Request(INBOX_URL, {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function rateLimiter(results: boolean[] = [true, true]) {
  const limit = vi.fn(async () => ({ success: results.shift() ?? true }));
  return { binding: { limit } as unknown as RateLimit, limit };
}

async function insertFederatedActor() {
  await env.DB.prepare(
    `INSERT INTO user
      (id, name, email, email_verified, username, is_public,
       federation_enabled, federation_handle, created_at, updated_at)
     VALUES ('actor-local', 'Local Actor', 'actor-local@example.com', true,
             'actor_local', true, true, 'actor_local', unixepoch(), unixepoch())`,
  ).run();
}

async function insertPublishedEntry() {
  await insertFederatedActor();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO content (id, type, title, created_at)
       VALUES ('content-local', 'movie', 'Local Content', unixepoch())`,
    ),
    env.DB.prepare(
      `INSERT INTO entries
        (id, user_id, content_id, watched_on, note, is_note_public, created_at)
       VALUES ('entry-local', 'actor-local', 'content-local', '2026-08-01',
               'Local Note', true, unixepoch())`,
    ),
    env.DB.prepare(
      `INSERT INTO federation_publications
        (entry_id, user_id, status, published_at, updated_at)
       VALUES ('entry-local', 'actor-local', 'published', unixepoch(), unixepoch())`,
    ),
  ]);
}

describe("ActivityPub inbox 진입 정책", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM user").run();
  });

  it("본문 제한을 초과하면 Fedify로 전달하지 않는다", async () => {
    const limiter = rateLimiter();
    const request = activityRequest(
      "x".repeat(MAX_FEDERATION_INBOX_BODY_BYTES + 1),
    );

    const result = await prepareFederationInboxRequest(request, {
      db: env.DB,
      rateLimiter: limiter.binding,
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it("Activity JSON이 아니거나 잘못된 JSON이면 거부한다", async () => {
    const limiter = rateLimiter();

    const wrongType = await prepareFederationInboxRequest(
      activityRequest({}, "text/plain"),
      { db: env.DB, rateLimiter: limiter.binding },
    );
    const malformed = await prepareFederationInboxRequest(
      activityRequest("{"),
      { db: env.DB, rateLimiter: limiter.binding },
    );

    expect((wrongType as Response).status).toBe(415);
    expect((malformed as Response).status).toBe(400);
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it("지원하지 않는 Activity와 외부 대상을 조용히 폐기한다", async () => {
    const limiter = rateLimiter();
    const unsupported = await prepareFederationInboxRequest(
      activityRequest({
        type: "Create",
        actor: "https://remote.example/users/alice",
        object: { type: "Note", content: "spam" },
      }),
      { db: env.DB, rateLimiter: limiter.binding },
    );
    const foreignTarget = await prepareFederationInboxRequest(
      activityRequest({
        type: "Follow",
        actor: "https://remote.example/users/alice",
        object: "https://elsewhere.example/ap/users/someone",
      }),
      { db: env.DB, rateLimiter: limiter.binding },
    );

    expect((unsupported as Response).status).toBe(202);
    expect((foreignTarget as Response).status).toBe(202);
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it("실제 federation 진입점에서도 미지원 Activity는 KV를 쓰지 않는다", async () => {
    const result = await handleFederationRequest(
      activityRequest({
        type: "Create",
        actor: "https://remote.example/users/alice",
        object: { type: "Note", content: "spam" },
      }),
      env,
    );

    expect(result.status).toBe(202);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM federation_kv",
    ).first<{ count: number }>();
    expect(row?.count).toBe(0);
  });

  it("공개된 로컬 Actor 대상 Follow만 원문을 복원해 전달한다", async () => {
    await insertFederatedActor();
    const limiter = rateLimiter();
    const body = {
      type: "Follow",
      actor: "https://remote.example/users/alice",
      object: "http://localhost/ap/users/actor-local",
    };

    const result = await prepareFederationInboxRequest(activityRequest(body), {
      db: env.DB,
      rateLimiter: limiter.binding,
    });

    expect(result).toBeInstanceOf(Request);
    await expect((result as Request).json()).resolves.toEqual(body);
    expect(limiter.limit).toHaveBeenNthCalledWith(1, {
      key: "federation-inbox:global",
    });
    expect(limiter.limit).toHaveBeenNthCalledWith(2, {
      key: "federation-inbox:origin:https://remote.example",
    });
  });

  it("미등록 로컬 대상은 서명 검증 전에 폐기한다", async () => {
    const limiter = rateLimiter();
    const result = await prepareFederationInboxRequest(
      activityRequest({
        type: "Follow",
        actor: "https://remote.example/users/alice",
        object: "http://localhost/ap/users/missing",
      }),
      { db: env.DB, rateLimiter: limiter.binding },
    );

    expect((result as Response).status).toBe(202);
    expect(limiter.limit).toHaveBeenCalledTimes(2);
  });

  it("발행된 Note의 반응과 embedded Undo만 전달한다", async () => {
    await insertPublishedEntry();
    const limiter = rateLimiter([true, true, true, true]);
    const like = {
      type: "Like",
      actor: "https://remote.example/users/alice",
      object: "http://localhost/ap/entries/entry-local",
    };
    const undo = {
      type: "Undo",
      actor: "https://remote.example/users/alice",
      object: like,
    };

    const likeResult = await prepareFederationInboxRequest(
      activityRequest(like),
      { db: env.DB, rateLimiter: limiter.binding },
    );
    const undoResult = await prepareFederationInboxRequest(
      activityRequest(undo),
      { db: env.DB, rateLimiter: limiter.binding },
    );

    expect(likeResult).toBeInstanceOf(Request);
    expect(undoResult).toBeInstanceOf(Request);
  });

  it("문자열 참조 Undo는 대상 확인이 불가능하므로 폐기한다", async () => {
    const limiter = rateLimiter();
    const result = await prepareFederationInboxRequest(
      activityRequest({
        type: "Undo",
        actor: "https://remote.example/users/alice",
        object: "https://remote.example/activities/like-1",
      }),
      { db: env.DB, rateLimiter: limiter.binding },
    );

    expect((result as Response).status).toBe(202);
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it("전역 또는 Actor origin 한도를 초과하면 429를 반환한다", async () => {
    await insertFederatedActor();
    const globalLimited = rateLimiter([false]);
    const originLimited = rateLimiter([true, false]);
    const requestBody = {
      type: "Follow",
      actor: "https://remote.example/users/alice",
      object: "http://localhost/ap/users/actor-local",
    };

    const globalResult = await prepareFederationInboxRequest(
      activityRequest(requestBody),
      { db: env.DB, rateLimiter: globalLimited.binding },
    );
    const originResult = await prepareFederationInboxRequest(
      activityRequest(requestBody),
      { db: env.DB, rateLimiter: originLimited.binding },
    );

    expect((globalResult as Response).status).toBe(429);
    expect((originResult as Response).status).toBe(429);
    expect((originResult as Response).headers.get("retry-after")).toBe("60");
  });
});
