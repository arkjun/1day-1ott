import { WorkersKvStore, WorkersMessageQueue } from "@fedify/cfworkers";
import {
  createFederationBuilder,
  type Context,
  type Federation,
  type Message,
} from "@fedify/fedify";
import {
  Endpoints,
  Delete,
  Follow,
  Image,
  Note,
  Person,
  PUBLIC_COLLECTION,
  type Recipient,
  Undo,
  Update,
} from "@fedify/fedify/vocab";
import { and, count, eq } from "drizzle-orm";
import { createDb, schema } from "../db";
import type { Env } from "../env";
import { avatarMediaType, avatarUrl } from "../lib/avatar";
import { escapeHtml } from "../lib/html";
import { loadActorKeyPairs } from "./keys";
import { handleFollow, handleUndoFollow } from "./followers";
import {
  buildCreate,
  dispatchEntryObject,
  loadPublishedEntry,
} from "./notes";

export { handleFollow, handleUndoFollow } from "./followers";

const builder = createFederationBuilder<Env>();

async function buildActor(ctx: Context<Env>, identifier: string) {
  const db = createDb(ctx.data.DB);
  const actor = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      handle: schema.user.federationHandle,
      bio: schema.user.bio,
      avatarKey: schema.user.avatarKey,
    })
    .from(schema.user)
    .where(
      and(
        eq(schema.user.id, identifier),
        eq(schema.user.isPublic, true),
        eq(schema.user.federationEnabled, true),
      ),
    )
    .get();
  if (!actor?.handle) return null;

  const keys = await ctx.getActorKeyPairs(identifier);
  const primaryKey = keys[0];
  if (!primaryKey) return null;

  return new Person({
    id: ctx.getActorUri(identifier),
    preferredUsername: actor.handle,
    name: actor.name,
    summary: actor.bio
      ? escapeHtml(actor.bio).replaceAll("\n", "<br>")
      : null,
    icon: new Image({
      url: new URL(avatarUrl(ctx.data.MEDIA_ORIGIN, actor.avatarKey)),
      mediaType: avatarMediaType(actor.avatarKey),
    }),
    url: new URL(`/u/${encodeURIComponent(actor.handle)}`, ctx.origin),
    inbox: ctx.getInboxUri(identifier),
    outbox: ctx.getOutboxUri(identifier),
    following: ctx.getFollowingUri(identifier),
    followers: ctx.getFollowersUri(identifier),
    endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
    publicKey: primaryKey.cryptographicKey,
    assertionMethods: keys.map((key) => key.multikey),
    manuallyApprovesFollowers: false,
    discoverable: true,
    indexable: true,
  });
}

const actorSetters = builder.setActorDispatcher(
  "/ap/users/{identifier}",
  buildActor,
);

actorSetters.setKeyPairsDispatcher(async (ctx, identifier) => {
  const db = createDb(ctx.data.DB);
  const actor = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(
      and(
        eq(schema.user.id, identifier),
        eq(schema.user.federationEnabled, true),
      ),
    )
    .get();
  if (!actor) return [];
  return loadActorKeyPairs(ctx.data, identifier);
});

actorSetters.mapHandle(async (ctx, username) => {
  const db = createDb(ctx.data.DB);
  const actor = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(
      and(
        eq(schema.user.federationHandle, username),
        eq(schema.user.isPublic, true),
        eq(schema.user.federationEnabled, true),
      ),
    )
    .get();
  return actor?.id ?? null;
});

builder
  .setInboxListeners("/ap/users/{identifier}/inbox", "/ap/inbox")
  .withIdempotency("per-inbox")
  .on(Follow, handleFollow)
  .on(Undo, handleUndoFollow);

builder
  .setFollowersDispatcher(
    "/ap/users/{identifier}/followers",
    async (ctx, identifier) => {
      const db = createDb(ctx.data.DB);
      const actor = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(
          and(
            eq(schema.user.id, identifier),
            eq(schema.user.federationEnabled, true),
          ),
        )
        .get();
      if (!actor) return null;
      const rows = await db
        .select({
          id: schema.federationFollowers.remoteActorUri,
          inboxId: schema.federationFollowers.remoteInboxUri,
          sharedInbox: schema.federationFollowers.remoteSharedInboxUri,
        })
        .from(schema.federationFollowers)
        .where(
          and(
            eq(schema.federationFollowers.localUserId, identifier),
            eq(schema.federationFollowers.status, "active"),
          ),
        )
        .all();
      const items: Recipient[] = rows.map((row) => ({
        id: new URL(row.id),
        inboxId: new URL(row.inboxId),
        endpoints: row.sharedInbox
          ? new Endpoints({ sharedInbox: new URL(row.sharedInbox) })
          : null,
      }));
      return { items };
    },
  )
  .setCounter(async (ctx, identifier) => {
    const db = createDb(ctx.data.DB);
    const row = await db
      .select({ value: count() })
      .from(schema.federationFollowers)
      .where(
        and(
          eq(schema.federationFollowers.localUserId, identifier),
          eq(schema.federationFollowers.status, "active"),
        ),
      )
      .get();
    return row?.value ?? 0;
  });

builder
  .setFollowingDispatcher(
    "/ap/users/{identifier}/following",
    async () => ({ items: [] }),
  )
  .setCounter(async () => 0);

builder.setOutboxDispatcher(
  "/ap/users/{identifier}/outbox",
  async (ctx, identifier) => {
    const db = createDb(ctx.data.DB);
    const rows = await db
      .select({ entryId: schema.federationPublications.entryId })
      .from(schema.federationPublications)
      .where(
        and(
          eq(schema.federationPublications.userId, identifier),
          eq(schema.federationPublications.status, "published"),
        ),
      )
      .all();
    const entries = await Promise.all(
      rows.map((row) => loadPublishedEntry(ctx.data, row.entryId)),
    );
    return {
      items: entries
        .filter((entry) => entry != null)
        .map((entry) => buildCreate(ctx, entry)),
    };
  },
);

builder.setObjectDispatcher(
  Note,
  "/ap/entries/{id}",
  (ctx, { id }) => dispatchEntryObject(ctx, id),
);

builder.setOutboxPermanentFailureHandler(async (ctx, values) => {
  if (values.actorIds.length === 0) return;
  const db = createDb(ctx.data.DB);
  for (const actorId of values.actorIds) {
    await db
      .update(schema.federationFollowers)
      .set({ status: "removed", updatedAt: new Date() })
      .where(eq(schema.federationFollowers.remoteActorUri, actorId.href));
  }
});

async function buildFederation(env: Env): Promise<{
  federation: Federation<Env>;
  queue: WorkersMessageQueue;
}> {
  const queue = new WorkersMessageQueue(env.FEDIFY_QUEUE, {
    orderingKv: env.FEDIFY_ORDERING_KV,
  });
  const federation = await builder.build({
    origin: env.BETTER_AUTH_URL,
    kv: new WorkersKvStore(env.FEDIFY_KV),
    queue,
    firstKnock: "draft-cavage-http-signatures-12",
    userAgent: {
      software: "1day-1ott/1.0",
      url: new URL(env.BETTER_AUTH_URL),
    },
  });
  return { federation, queue };
}

export function isFederationPath(url: URL): boolean {
  return (
    url.pathname.startsWith("/.well-known/") ||
    url.pathname === "/ap/inbox" ||
    url.pathname.startsWith("/ap/")
  );
}

export async function handleFederationRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const { federation } = await buildFederation(env);
  return federation.fetch(request, { contextData: env });
}

export async function publishEntry(
  request: Request,
  env: Env,
  entryId: string,
): Promise<"published" | "failed"> {
  const db = createDb(env.DB);
  try {
    const entry = await loadPublishedEntry(env, entryId, [
      "pending",
      "failed",
      "published",
    ]);
    if (!entry) throw new Error("publication_not_found");
    const { federation } = await buildFederation(env);
    const ctx = federation.createContext(request, env);
    await ctx.sendActivity(
      { identifier: entry.userId },
      "followers",
      buildCreate(ctx, entry),
      { preferSharedInbox: true },
    );
    await db
      .update(schema.federationPublications)
      .set({
        status: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
        lastError: null,
      })
      .where(eq(schema.federationPublications.entryId, entryId));
    return "published";
  } catch (error) {
    await db
      .update(schema.federationPublications)
      .set({
        status: "failed",
        updatedAt: new Date(),
        lastError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(schema.federationPublications.entryId, entryId));
    return "failed";
  }
}

export async function publishActorUpdate(
  request: Request,
  env: Env,
  userId: string,
): Promise<"published" | "failed"> {
  try {
    const { federation } = await buildFederation(env);
    const ctx = federation.createContext(request, env);
    const actor = await buildActor(ctx, userId);
    if (!actor) throw new Error("actor_not_found");
    await ctx.sendActivity(
      { identifier: userId },
      "followers",
      new Update({
        id: new URL(
          `#updates/${crypto.randomUUID()}`,
          ctx.getActorUri(userId),
        ),
        actor: ctx.getActorUri(userId),
        to: PUBLIC_COLLECTION,
        cc: ctx.getFollowersUri(userId),
        object: actor,
      }),
      { preferSharedInbox: true },
    );
    return "published";
  } catch (error) {
    console.error("Failed to publish Actor update", { userId, error });
    return "failed";
  }
}

export async function updatePublishedEntry(
  request: Request,
  env: Env,
  entryId: string,
): Promise<"published" | "failed"> {
  const db = createDb(env.DB);
  try {
    const entry = await loadPublishedEntry(env, entryId);
    if (!entry) throw new Error("published_entry_not_found");
    const { federation } = await buildFederation(env);
    const ctx = federation.createContext(request, env);
    const note = (await dispatchEntryObject(ctx, entryId)) as Note | null;
    if (!note) throw new Error("published_note_not_found");
    await ctx.sendActivity(
      { identifier: entry.userId },
      "followers",
      new Update({
        id: new URL(
          `#updates/${crypto.randomUUID()}`,
          ctx.getActorUri(entry.userId),
        ),
        actor: ctx.getActorUri(entry.userId),
        to: PUBLIC_COLLECTION,
        cc: ctx.getFollowersUri(entry.userId),
        object: note,
      }),
      { preferSharedInbox: true },
    );
    await db
      .update(schema.federationPublications)
      .set({ updatedAt: new Date(), lastError: null })
      .where(eq(schema.federationPublications.entryId, entryId));
    return "published";
  } catch (error) {
    await db
      .update(schema.federationPublications)
      .set({
        updatedAt: new Date(),
        lastError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(schema.federationPublications.entryId, entryId));
    return "failed";
  }
}

export async function deletePublishedEntry(
  request: Request,
  env: Env,
  entryId: string,
): Promise<"deleted" | "failed" | undefined> {
  const db = createDb(env.DB);
  const publication = await db
    .select({
      userId: schema.federationPublications.userId,
      status: schema.federationPublications.status,
    })
    .from(schema.federationPublications)
    .where(eq(schema.federationPublications.entryId, entryId))
    .get();
  if (!publication || publication.status === "deleted") return undefined;

  let result: "deleted" | "failed" = "deleted";
  let lastError: string | null = null;
  try {
    const { federation } = await buildFederation(env);
    const ctx = federation.createContext(request, env);
    const actorUri = ctx.getActorUri(publication.userId);
    await ctx.sendActivity(
      { identifier: publication.userId },
      "followers",
      new Delete({
        id: new URL(`#deletes/${crypto.randomUUID()}`, actorUri),
        actor: actorUri,
        to: PUBLIC_COLLECTION,
        cc: ctx.getFollowersUri(publication.userId),
        object: ctx.getObjectUri(Note, { id: entryId }),
      }),
      { preferSharedInbox: true },
    );
  } catch (error) {
    result = "failed";
    lastError = error instanceof Error ? error.message : String(error);
  }

  await db
    .update(schema.federationPublications)
    .set({
      status: "deleted",
      deletedAt: new Date(),
      updatedAt: new Date(),
      lastError,
    })
    .where(eq(schema.federationPublications.entryId, entryId));
  return result;
}

export async function processFederationQueue(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  const { federation, queue } = await buildFederation(env);
  for (const item of batch.messages) {
    const result = await queue.processMessage(item.body);
    if (!result.shouldProcess) {
      item.retry();
      continue;
    }
    try {
      await federation.processQueuedTask(env, result.message as Message);
      item.ack();
    } catch {
      item.retry();
    } finally {
      await result.release?.();
    }
  }
}

export async function retryFailedPublications(env: Env): Promise<void> {
  const db = createDb(env.DB);
  const rows = await db
    .select({ entryId: schema.federationPublications.entryId })
    .from(schema.federationPublications)
    .where(eq(schema.federationPublications.status, "failed"))
    .limit(20)
    .all();
  const request = new Request(env.BETTER_AUTH_URL);
  for (const row of rows) {
    await publishEntry(request, env, row.entryId);
  }
}
