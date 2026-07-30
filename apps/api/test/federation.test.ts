import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Endpoints, Follow, Person, Undo } from "@fedify/fedify/vocab";
import { app } from "../src/index";
import {
  handleFederationRequest,
  handleFollow,
  handleUndoFollow,
} from "../src/federation";

const JSON_HEADERS = { "content-type": "application/json" };
let seq = 0;

async function enableFederation(): Promise<{ cookie: string; userId: string; username: string }> {
  const username = `actor_user_${++seq}`;
  const email = `${username}@example.com`;
  const signup = await app.request(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email,
        password: "test-password-123",
        name: "Actor User",
      }),
    },
    env,
  );
  expect(signup.status).toBe(200);
  const cookie = signup.headers
    .getSetCookie()
    .map((value: string) => value.split(";")[0])
    .join("; ");

  const enabled = await app.request(
    "/api/me",
    {
      method: "PATCH",
      headers: { ...JSON_HEADERS, cookie },
      body: JSON.stringify({
        username,
        isPublic: true,
        federationEnabled: true,
      }),
    },
    env,
  );
  expect(enabled.status).toBe(200);
  const row = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  expect(row?.id).toBeTruthy();
  return { cookie, userId: row!.id, username };
}

describe("ActivityPub Actor와 WebFinger", () => {
  beforeEach(() => {
    seq++;
  });

  it("활성 사용자 핸들을 안정적인 user ID Actor URI로 해석한다", async () => {
    const { userId, username } = await enableFederation();
    const response = await handleFederationRequest(
      new Request(
        `http://localhost/.well-known/webfinger?resource=${encodeURIComponent(
          `acct:${username}@localhost`,
        )}`,
        { headers: { accept: "application/jrd+json" } },
      ),
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      subject: string;
      links: { rel: string; href: string; type?: string }[];
    };
    expect(body.subject).toBe(`acct:${username}@localhost`);
    expect(body.links).toContainEqual(
      expect.objectContaining({
        rel: "self",
        href: `http://localhost/ap/users/${userId}`,
      }),
    );
    expect(body.links).toContainEqual({
      rel: "http://webfinger.net/rel/avatar",
      href: "https://media.test/avatars/default.svg",
      type: "image/svg+xml",
    });
  });

  it("Actor endpoint는 공개 Person과 서명 공개키를 반환한다", async () => {
    const { cookie, userId, username } = await enableFederation();
    const updated = await app.request(
      "/api/me",
      {
        method: "PATCH",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({ bio: "<첫 줄>&\n둘째 줄" }),
      },
      env,
    );
    expect(await updated.json()).toMatchObject({
      federationStatus: "published",
    });

    const form = new FormData();
    form.set(
      "avatar",
      new File(
        [
          new Uint8Array([
            0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
          ]),
        ],
        "avatar.webp",
        { type: "image/webp" },
      ),
    );
    const uploaded = await app.request(
      "/api/me/avatar",
      { method: "POST", headers: { cookie }, body: form },
      env,
    );
    const { avatarUrl } = (await uploaded.json()) as { avatarUrl: string };
    const response = await handleFederationRequest(
      new Request(`http://localhost/ap/users/${userId}`, {
        headers: { accept: "application/activity+json" },
      }),
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: `http://localhost/ap/users/${userId}`,
      type: "Person",
      preferredUsername: username,
      summary: "&lt;첫 줄&gt;&amp;<br>둘째 줄",
      icon: {
        type: "Image",
        mediaType: "image/webp",
        url: avatarUrl,
      },
      inbox: `http://localhost/ap/users/${userId}/inbox`,
      followers: `http://localhost/ap/users/${userId}/followers`,
    });
    expect(body.publicKey).toBeTruthy();
    const publicKey = body.publicKey as { publicKeyPem: string };
    const der = Uint8Array.from(
      atob(
        publicKey.publicKeyPem
          .replace("-----BEGIN PUBLIC KEY-----", "")
          .replace("-----END PUBLIC KEY-----", "")
          .replaceAll(/\s/g, ""),
      ),
      (char) => char.charCodeAt(0),
    );
    const imported = await crypto.subtle.importKey(
      "spki",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    expect(imported.algorithm.name).toBe("RSASSA-PKCS1-v1_5");
  });

  it("Follow를 저장하고 Accept한 뒤 followers collection에 노출한다", async () => {
    const { userId } = await enableFederation();
    const actorUri = new URL("https://remote.example/users/alice");
    const follow = new Follow({
      id: new URL("https://remote.example/activities/follow-1"),
      actor: new Person({
        id: actorUri,
        preferredUsername: "alice",
        inbox: new URL("https://remote.example/users/alice/inbox"),
        endpoints: new Endpoints({
          sharedInbox: new URL("https://remote.example/inbox"),
        }),
      }),
      object: new URL(`http://localhost/ap/users/${userId}`),
    });
    const sent: unknown[] = [];
    const ctx = {
      data: env,
      parseUri: () => ({ type: "actor", identifier: userId }),
      getActorUri: () => new URL(`http://localhost/ap/users/${userId}`),
      sendActivity: async (...args: unknown[]) => {
        sent.push(args);
      },
    };

    await handleFollow(ctx as never, follow);

    const row = await env.DB.prepare(
      `SELECT remote_actor_uri, remote_inbox_uri, remote_shared_inbox_uri, status
         FROM federation_followers
        WHERE local_user_id = ?`,
    )
      .bind(userId)
      .first<Record<string, unknown>>();
    expect(row).toEqual({
      remote_actor_uri: actorUri.href,
      remote_inbox_uri: "https://remote.example/users/alice/inbox",
      remote_shared_inbox_uri: "https://remote.example/inbox",
      status: "active",
    });
    expect(sent).toHaveLength(1);

    const collection = await handleFederationRequest(
      new Request(`http://localhost/ap/users/${userId}/followers`, {
        headers: { accept: "application/activity+json" },
      }),
      env,
    );
    expect(collection.status).toBe(200);
    const body = (await collection.json()) as {
      totalItems: number;
      orderedItems: string[];
    };
    expect(body.totalItems).toBe(1);
    expect(body.orderedItems).toContain(actorUri.href);
  });

  it("Undo(Follow)는 같은 로컬 Actor에 대한 원격 팔로우를 제거한다", async () => {
    const { userId } = await enableFederation();
    const actorUri = new URL("https://remote.example/users/bob");
    await env.DB.prepare(
      `INSERT INTO federation_followers
        (id, local_user_id, remote_actor_uri, remote_inbox_uri,
         follow_activity_uri, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        actorUri.href,
        "https://remote.example/users/bob/inbox",
        "https://remote.example/activities/follow-2",
      )
      .run();
    const undo = new Undo({
      id: new URL("https://remote.example/activities/undo-2"),
      actor: actorUri,
      object: new Follow({
        id: new URL("https://remote.example/activities/follow-2"),
        actor: actorUri,
        object: new URL(`http://localhost/ap/users/${userId}`),
      }),
    });

    await handleUndoFollow(
      {
        data: env,
        parseUri: () => ({ type: "actor", identifier: userId }),
      } as never,
      undo,
    );

    const row = await env.DB.prepare(
      `SELECT status
         FROM federation_followers
        WHERE local_user_id = ? AND remote_actor_uri = ?`,
    )
      .bind(userId, actorUri.href)
      .first<{ status: string }>();
    expect(row?.status).toBe("removed");
  });

  it("활성 사용자의 새 한 줄 감상을 Create(Note)로 발행하고 역참조한다", async () => {
    const { cookie, userId } = await enableFederation();
    const created = await app.request(
      "/api/entries",
      {
        method: "POST",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({
          type: "movie",
          title: "<듄> 파트 2",
          watchedOn: "2026-07-30",
          reaction: "love",
          note: "압도적 & 아름답다",
          posterUrl: "https://image.tmdb.org/t/p/w500/dune-part-two.jpg",
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const result = (await created.json()) as {
      id: string;
      federationStatus?: string;
    };
    expect(result.federationStatus).toBe("published");

    const publication = await env.DB.prepare(
      "SELECT status FROM federation_publications WHERE entry_id = ?",
    )
      .bind(result.id)
      .first<{ status: string }>();
    expect(publication?.status).toBe("published");

    const noteResponse = await handleFederationRequest(
      new Request(`http://localhost/ap/entries/${result.id}`, {
        headers: { accept: "application/activity+json" },
      }),
      env,
    );
    expect(noteResponse.status).toBe(200);
    const note = (await noteResponse.json()) as Record<string, unknown>;
    expect(note).toMatchObject({
      id: `http://localhost/ap/entries/${result.id}`,
      type: "Note",
      attributedTo: `http://localhost/ap/users/${userId}`,
      to: "as:Public",
    });
    expect(note.content).toContain("&lt;듄&gt; 파트 2");
    expect(note.content).toContain("압도적 &amp; 아름답다");
    expect(note.attachment).toEqual(
      expect.objectContaining({
        type: "Image",
        url: "https://image.tmdb.org/t/p/w500/dune-part-two.jpg",
        name: "<듄> 파트 2",
        summary: "<듄> 파트 2 poster",
      }),
    );
  });

  it("연합우주 비활성 사용자와 감상 없는 기록은 발행하지 않는다", async () => {
    const { cookie } = await enableFederation();
    const disabled = await app.request(
      "/api/me",
      {
        method: "PATCH",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({ federationEnabled: false }),
      },
      env,
    );
    expect(disabled.status).toBe(200);

    const created = await app.request(
      "/api/entries",
      {
        method: "POST",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({
          type: "movie",
          title: "발행 안 함",
          watchedOn: "2026-07-30",
          note: "로컬 감상",
        }),
      },
      env,
    );
    const result = (await created.json()) as { id: string };
    const publication = await env.DB.prepare(
      "SELECT status FROM federation_publications WHERE entry_id = ?",
    )
      .bind(result.id)
      .first();
    expect(publication).toBeNull();
  });

  it("비공개 감상은 발행하지 않고 공개로 전환하면 발행한다", async () => {
    const { cookie } = await enableFederation();
    const created = await app.request(
      "/api/entries",
      {
        method: "POST",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({
          type: "movie",
          title: "처음엔 비공개",
          watchedOn: "2026-07-30",
          note: "나만 보는 감상",
          isNotePublic: false,
        }),
      },
      env,
    );
    const { id } = (await created.json()) as { id: string };
    expect(
      await env.DB.prepare(
        "SELECT status FROM federation_publications WHERE entry_id = ?",
      )
        .bind(id)
        .first(),
    ).toBeNull();

    const madePublic = await app.request(
      `/api/entries/${id}`,
      {
        method: "PATCH",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({ isNotePublic: true }),
      },
      env,
    );
    expect(madePublic.status).toBe(200);
    expect(await madePublic.json()).toMatchObject({
      ok: true,
      federationStatus: "published",
    });
  });

  it("발행된 감상을 비공개로 전환하면 연합우주에서도 삭제한다", async () => {
    const { cookie } = await enableFederation();
    const created = await app.request(
      "/api/entries",
      {
        method: "POST",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({
          type: "movie",
          title: "공개 후 비공개",
          watchedOn: "2026-07-30",
          note: "곧 숨길 감상",
        }),
      },
      env,
    );
    const { id } = (await created.json()) as { id: string };

    const madePrivate = await app.request(
      `/api/entries/${id}`,
      {
        method: "PATCH",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({ isNotePublic: false }),
      },
      env,
    );
    expect(madePrivate.status).toBe(200);
    expect(await madePrivate.json()).toMatchObject({
      ok: true,
      federationStatus: "deleted",
    });
  });

  it("발행된 감상 수정은 Note 역참조 결과를 갱신한다", async () => {
    const { cookie } = await enableFederation();
    const created = await app.request(
      "/api/entries",
      {
        method: "POST",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({
          type: "movie",
          title: "수정 테스트",
          watchedOn: "2026-07-30",
          note: "첫 감상",
        }),
      },
      env,
    );
    const { id } = (await created.json()) as { id: string };

    const updated = await app.request(
      `/api/entries/${id}`,
      {
        method: "PATCH",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({ note: "수정된 감상", reaction: "up" }),
      },
      env,
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      ok: true,
      federationStatus: "published",
    });

    const noteResponse = await handleFederationRequest(
      new Request(`http://localhost/ap/entries/${id}`, {
        headers: { accept: "application/activity+json" },
      }),
      env,
    );
    const note = (await noteResponse.json()) as { content: string };
    expect(note.content).toContain("수정된 감상");
    expect(note.content).toContain("👍");
    expect(note.content).not.toContain("첫 감상");
  });

  it("발행된 기록 삭제는 Delete 후 객체를 Tombstone으로 유지한다", async () => {
    const { cookie } = await enableFederation();
    const created = await app.request(
      "/api/entries",
      {
        method: "POST",
        headers: { ...JSON_HEADERS, cookie },
        body: JSON.stringify({
          type: "movie",
          title: "삭제 테스트",
          watchedOn: "2026-07-30",
          note: "삭제할 감상",
        }),
      },
      env,
    );
    const { id } = (await created.json()) as { id: string };

    const deleted = await app.request(
      `/api/entries/${id}`,
      {
        method: "DELETE",
        headers: { ...JSON_HEADERS, cookie },
      },
      env,
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({
      ok: true,
      federationStatus: "deleted",
    });

    const publication = await env.DB.prepare(
      "SELECT status, deleted_at FROM federation_publications WHERE entry_id = ?",
    )
      .bind(id)
      .first<{ status: string; deleted_at: number | null }>();
    expect(publication?.status).toBe("deleted");
    expect(publication?.deleted_at).toBeTypeOf("number");

    const tombstone = await handleFederationRequest(
      new Request(`http://localhost/ap/entries/${id}`, {
        headers: { accept: "application/activity+json" },
      }),
      env,
    );
    expect(tombstone.status).toBe(200);
    expect(await tombstone.json()).toMatchObject({
      id: `http://localhost/ap/entries/${id}`,
      type: "Tombstone",
      formerType: "as:Note",
    });
  });
});
