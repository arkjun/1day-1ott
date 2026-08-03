import type { InboxContext } from "@fedify/fedify";
import { EmojiReact, Like, Undo } from "@fedify/fedify/vocab";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createDb, schema } from "../db";
import type { Env } from "../env";

const customEmojiPattern = /^:[A-Za-z0-9_+-]{1,80}:$/;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function normalizeEmoji(activity: Like | EmojiReact): string | null {
  const content =
    typeof activity.content === "string" ? activity.content.trim() : "";
  if (content === "") {
    return activity instanceof Like ? "❤️" : null;
  }
  if (customEmojiPattern.test(content)) return content;
  if (content.length > 32 || /\s/u.test(content)) return null;
  return [...segmenter.segment(content)].length === 1 ? content : null;
}

function entryIdFromObject(
  ctx: InboxContext<Env>,
  objectId: URL,
): string | null {
  const target = ctx.parseUri(objectId);
  if (target?.type !== "object") return null;
  const id = target.values.id;
  return typeof id === "string" && id !== "" ? id : null;
}

export async function handleReaction(
  ctx: InboxContext<Env>,
  activity: Like | EmojiReact,
): Promise<void> {
  if (!activity.id || !activity.actorId || !activity.objectId) return;
  const entryId = entryIdFromObject(ctx, activity.objectId);
  if (!entryId) return;
  const emoji = normalizeEmoji(activity);
  if (!emoji) return;

  const db = createDb(ctx.data.DB);
  const target = await db
    .select({ id: schema.entries.id })
    .from(schema.federationPublications)
    .innerJoin(
      schema.entries,
      eq(schema.federationPublications.entryId, schema.entries.id),
    )
    .innerJoin(schema.user, eq(schema.entries.userId, schema.user.id))
    .where(
      and(
        eq(schema.federationPublications.entryId, entryId),
        eq(schema.federationPublications.status, "published"),
        eq(schema.entries.isNotePublic, true),
        eq(schema.user.isPublic, true),
        eq(schema.user.federationEnabled, true),
      ),
    )
    .get();
  if (!target) return;

  await db
    .insert(schema.entryReactions)
    .values({
      id: nanoid(),
      entryId,
      emoji,
      emojiImageUrl: null,
      remoteActorUri: activity.actorId.href,
      remoteActivityUri: activity.id.href,
    })
    .onConflictDoUpdate({
      target: [
        schema.entryReactions.entryId,
        schema.entryReactions.remoteActorUri,
        schema.entryReactions.emoji,
      ],
      set: {
        emojiImageUrl: null,
        remoteActivityUri: activity.id.href,
        createdAt: new Date(),
      },
    });
}

export async function handleUndoReaction(
  ctx: InboxContext<Env>,
  undo: Undo,
): Promise<void> {
  if (!undo.actorId) return;
  const object = await undo.getObject();
  if (!(object instanceof Like) && !(object instanceof EmojiReact)) return;
  if (!object.id || object.actorId?.href !== undo.actorId.href) return;

  const db = createDb(ctx.data.DB);
  await db
    .delete(schema.entryReactions)
    .where(
      and(
        eq(schema.entryReactions.remoteActorUri, undo.actorId.href),
        eq(schema.entryReactions.remoteActivityUri, object.id.href),
      ),
    );
}
