import { noteReactionEmojiSchema } from "@1ott/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../env";
import { getEntryReactionSummaries } from "../lib/entry-reactions";

const reactionBodySchema = z.object({
  emoji: noteReactionEmojiSchema,
});

type Vars = { userId: string };

export const reactionsRoute = new Hono<{
  Bindings: Env;
  Variables: Vars;
}>();

reactionsRoute.put("/entries/:id/reaction", async (c) => {
  const parsed = reactionBodySchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }

  const db = createDb(c.env.DB);
  const entryId = c.req.param("id");
  const userId = c.get("userId");
  const target = await db
    .select({
      ownerId: schema.entries.userId,
      note: schema.entries.note,
      isNotePublic: schema.entries.isNotePublic,
      isProfilePublic: schema.user.isPublic,
    })
    .from(schema.entries)
    .innerJoin(schema.user, eq(schema.entries.userId, schema.user.id))
    .where(eq(schema.entries.id, entryId))
    .get();

  if (!target) return c.json({ error: "not_found" }, 404);
  if (target.ownerId === userId) {
    return c.json({ error: "self_reaction_not_allowed" }, 403);
  }
  if (
    !target.isProfilePublic ||
    !target.isNotePublic ||
    !target.note?.trim()
  ) {
    return c.json({ error: "not_found" }, 404);
  }

  await db
    .insert(schema.entryReactions)
    .values({
      id: nanoid(),
      entryId,
      emoji: parsed.data.emoji,
      localUserId: userId,
    })
    .onConflictDoUpdate({
      target: [
        schema.entryReactions.entryId,
        schema.entryReactions.localUserId,
        schema.entryReactions.emoji,
      ],
      set: {
        emojiImageUrl: null,
        createdAt: new Date(),
      },
    });

  return c.json({
    reactions: await getEntryReactionSummaries(db, entryId, userId),
  });
});

reactionsRoute.delete("/entries/:id/reaction", async (c) => {
  const parsed = reactionBodySchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }

  const db = createDb(c.env.DB);
  const entryId = c.req.param("id");
  const userId = c.get("userId");
  await db
    .delete(schema.entryReactions)
    .where(
      and(
        eq(schema.entryReactions.entryId, entryId),
        eq(schema.entryReactions.localUserId, userId),
        eq(schema.entryReactions.emoji, parsed.data.emoji),
      ),
    );
  return c.json({
    reactions: await getEntryReactionSummaries(db, entryId, userId),
  });
});
