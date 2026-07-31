import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "../db";
import type { Env } from "../env";
import { countFollowers } from "../lib/follows";

type Vars = { userId: string };
export const followsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

type Db = ReturnType<typeof createDb>;

async function loadTarget(db: Db, username: string) {
  return db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(
      and(
        eq(schema.user.username, username),
        eq(schema.user.isPublic, true),
      ),
    )
    .get();
}

followsRoute.get("/follows/:username", async (c) => {
  const db = createDb(c.env.DB);
  const followerId = c.get("userId");
  const target = await loadTarget(db, c.req.param("username"));
  if (!target) return c.json({ error: "not_found" }, 404);
  if (target.id === followerId) {
    return c.json({ isSelf: true, following: false });
  }

  const relation = await db
    .select({ followerId: schema.userFollows.followerId })
    .from(schema.userFollows)
    .where(
      and(
        eq(schema.userFollows.followerId, followerId),
        eq(schema.userFollows.followeeId, target.id),
      ),
    )
    .get();
  return c.json({ isSelf: false, following: relation != null });
});

followsRoute.put("/follows/:username", async (c) => {
  const db = createDb(c.env.DB);
  const followerId = c.get("userId");
  const target = await loadTarget(db, c.req.param("username"));
  if (!target) return c.json({ error: "not_found" }, 404);
  if (target.id === followerId) {
    return c.json({ error: "cannot_follow_self" }, 409);
  }

  await db
    .insert(schema.userFollows)
    .values({ followerId, followeeId: target.id })
    .onConflictDoNothing()
    .run();
  return c.json({
    following: true,
    followerCount: await countFollowers(db, target.id),
  });
});

followsRoute.delete("/follows/:username", async (c) => {
  const db = createDb(c.env.DB);
  const followerId = c.get("userId");
  const target = await loadTarget(db, c.req.param("username"));
  if (!target) return c.json({ error: "not_found" }, 404);
  if (target.id === followerId) {
    return c.json({ error: "cannot_follow_self" }, 409);
  }

  await db
    .delete(schema.userFollows)
    .where(
      and(
        eq(schema.userFollows.followerId, followerId),
        eq(schema.userFollows.followeeId, target.id),
      ),
    )
    .run();
  return c.json({
    following: false,
    followerCount: await countFollowers(db, target.id),
  });
});
