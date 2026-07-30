import type { Context } from "@fedify/fedify";
import {
  Create,
  Note,
  PUBLIC_COLLECTION,
  Tombstone,
} from "@fedify/fedify/vocab";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, schema } from "../db";
import type { Env } from "../env";

export interface PublishedEntry {
  entryId: string;
  userId: string;
  contentId: string;
  handle: string;
  title: string;
  watchedOn: string;
  reaction: string | null;
  note: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reactionEmoji(reaction: string | null): string {
  if (reaction === "love") return " ❤️";
  if (reaction === "up") return " 👍";
  if (reaction === "down") return " 👎";
  return "";
}

export async function loadPublishedEntry(
  env: Env,
  entryId: string,
  statuses: readonly ("pending" | "published" | "failed")[] = ["published"],
): Promise<PublishedEntry | null> {
  const db = createDb(env.DB);
  const row = await db
    .select({
      entryId: schema.entries.id,
      userId: schema.entries.userId,
      contentId: schema.entries.contentId,
      handle: schema.user.federationHandle,
      title: schema.content.title,
      watchedOn: schema.entries.watchedOn,
      reaction: schema.entries.reaction,
      note: schema.entries.note,
    })
    .from(schema.federationPublications)
    .innerJoin(
      schema.entries,
      eq(schema.federationPublications.entryId, schema.entries.id),
    )
    .innerJoin(schema.user, eq(schema.entries.userId, schema.user.id))
    .innerJoin(schema.content, eq(schema.entries.contentId, schema.content.id))
    .where(
      and(
        eq(schema.federationPublications.entryId, entryId),
        inArray(schema.federationPublications.status, [...statuses]),
      ),
    )
    .get();
  if (!row?.handle || !row.note) return null;
  return { ...row, handle: row.handle, note: row.note };
}

export function buildNote(
  ctx: Context<Env>,
  entry: PublishedEntry,
): Note {
  const objectUri = ctx.getObjectUri(Note, { id: entry.entryId });
  const title = escapeHtml(entry.title);
  const note = escapeHtml(entry.note).replaceAll("\n", "<br>");
  return new Note({
    id: objectUri,
    attribution: ctx.getActorUri(entry.userId),
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(entry.userId),
    content: `<p><strong>${title}</strong>${reactionEmoji(entry.reaction)}</p><p>${note}</p><p><small>${entry.watchedOn}</small></p>`,
    mediaType: "text/html",
    url: new URL(`/c/${encodeURIComponent(entry.contentId)}`, ctx.origin),
  });
}

export function buildCreate(
  ctx: Context<Env>,
  entry: PublishedEntry,
): Create {
  const note = buildNote(ctx, entry);
  return new Create({
    id: new URL("#create", note.id ?? ctx.origin),
    actor: ctx.getActorUri(entry.userId),
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(entry.userId),
    object: note,
  });
}

export async function dispatchEntryObject(
  ctx: Context<Env>,
  entryId: string,
): Promise<Note | Tombstone | null> {
  const db = createDb(ctx.data.DB);
  const publication = await db
    .select({
      status: schema.federationPublications.status,
    })
    .from(schema.federationPublications)
    .where(eq(schema.federationPublications.entryId, entryId))
    .get();
  if (!publication) return null;
  if (publication.status === "deleted") {
    return new Tombstone({
      id: ctx.getObjectUri(Note, { id: entryId }),
      formerType: Note,
    });
  }
  const entry = await loadPublishedEntry(ctx.data, entryId);
  return entry ? buildNote(ctx, entry) : null;
}
