import {
  noteReactionEmojis,
  type NoteReactionSummary,
} from "@1ott/shared";
import { inArray } from "drizzle-orm";
import { createDb, schema } from "../db";

type Db = ReturnType<typeof createDb>;

const localOrder = new Map(
  noteReactionEmojis.map((emoji, index) => [emoji, index]),
);

export async function listEntryReactionSummaries(
  db: Db,
  entryIds: string[],
  viewerId?: string,
): Promise<Map<string, NoteReactionSummary[]>> {
  const result = new Map<string, NoteReactionSummary[]>();
  if (entryIds.length === 0) return result;

  const rows = await db
    .select({
      entryId: schema.entryReactions.entryId,
      emoji: schema.entryReactions.emoji,
      imageUrl: schema.entryReactions.emojiImageUrl,
      localUserId: schema.entryReactions.localUserId,
    })
    .from(schema.entryReactions)
    .where(inArray(schema.entryReactions.entryId, entryIds))
    .all();

  const grouped = new Map<string, Map<string, NoteReactionSummary>>();
  for (const row of rows) {
    let entry = grouped.get(row.entryId);
    if (!entry) {
      entry = new Map();
      grouped.set(row.entryId, entry);
    }
    const key = `${row.emoji}\n${row.imageUrl ?? ""}`;
    const summary = entry.get(key);
    if (summary) {
      summary.count++;
      if (row.localUserId == null) summary.remoteCount++;
      if (row.localUserId === viewerId) summary.reactedByMe = true;
    } else {
      entry.set(key, {
        emoji: row.emoji,
        imageUrl: row.imageUrl,
        count: 1,
        remoteCount: row.localUserId == null ? 1 : 0,
        reactedByMe: row.localUserId === viewerId,
      });
    }
  }

  for (const [entryId, summaries] of grouped) {
    result.set(
      entryId,
      [...summaries.values()].sort((a, b) => {
        const aOrder = localOrder.get(
          a.emoji as (typeof noteReactionEmojis)[number],
        );
        const bOrder = localOrder.get(
          b.emoji as (typeof noteReactionEmojis)[number],
        );
        if (aOrder != null || bOrder != null) {
          return (
            (aOrder ?? Number.MAX_SAFE_INTEGER) -
            (bOrder ?? Number.MAX_SAFE_INTEGER)
          );
        }
        return a.emoji.localeCompare(b.emoji);
      }),
    );
  }
  return result;
}

export async function getEntryReactionSummaries(
  db: Db,
  entryId: string,
  viewerId?: string,
): Promise<NoteReactionSummary[]> {
  const summaries = await listEntryReactionSummaries(
    db,
    [entryId],
    viewerId,
  );
  return summaries.get(entryId) ?? [];
}
