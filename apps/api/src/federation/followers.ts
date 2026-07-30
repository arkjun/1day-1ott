import type { InboxContext } from "@fedify/fedify";
import {
  Accept,
  Follow,
  getActorHandle,
  Undo,
} from "@fedify/fedify/vocab";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createDb, schema } from "../db";
import type { Env } from "../env";

export async function handleFollow(
  ctx: InboxContext<Env>,
  follow: Follow,
): Promise<void> {
  if (!follow.id || !follow.objectId || !follow.actorId) return;
  const target = ctx.parseUri(follow.objectId);
  if (target?.type !== "actor") return;

  const follower = await follow.getActor();
  if (!follower?.id || !follower.inboxId) return;

  const db = createDb(ctx.data.DB);
  const localActor = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(
      and(
        eq(schema.user.id, target.identifier),
        eq(schema.user.isPublic, true),
        eq(schema.user.federationEnabled, true),
      ),
    )
    .get();
  if (!localActor) return;

  const values = {
    remoteInboxUri: follower.inboxId.href,
    remoteSharedInboxUri: follower.endpoints?.sharedInbox?.href ?? null,
    followActivityUri: follow.id.href,
    handle: await getActorHandle(follower),
    status: "active" as const,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.federationFollowers)
    .values({
      id: nanoid(),
      localUserId: localActor.id,
      remoteActorUri: follower.id.href,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        schema.federationFollowers.localUserId,
        schema.federationFollowers.remoteActorUri,
      ],
      set: values,
    });

  await ctx.sendActivity(
    target,
    follower,
    new Accept({
      id: new URL(
        `#accepts/${crypto.randomUUID()}`,
        ctx.getActorUri(target.identifier),
      ),
      actor: follow.objectId,
      to: follow.actorId,
      object: new Follow({
        id: follow.id,
        actor: follow.actorId,
        object: follow.objectId,
      }),
    }),
  );
}

export async function handleUndoFollow(
  ctx: InboxContext<Env>,
  undo: Undo,
): Promise<void> {
  const object = await undo.getObject();
  if (!(object instanceof Follow)) return;
  if (!undo.actorId || !object.objectId) return;
  const target = ctx.parseUri(object.objectId);
  if (target?.type !== "actor") return;

  const db = createDb(ctx.data.DB);
  await db
    .update(schema.federationFollowers)
    .set({ status: "removed", updatedAt: new Date() })
    .where(
      and(
        eq(schema.federationFollowers.localUserId, target.identifier),
        eq(schema.federationFollowers.remoteActorUri, undo.actorId.href),
      ),
    );
}
