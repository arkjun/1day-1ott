import {
  and,
  count,
  desc,
  eq,
  isNotNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { createDb, schema } from "../db";
import { avatarUrl } from "./avatar";

type Db = ReturnType<typeof createDb>;

interface FollowCursor {
  createdAt: Date;
  itemId: string;
}

export class InvalidFollowCursorError extends Error {}

export async function countFollowers(db: Db, userId: string): Promise<number> {
  const [local, federated] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.userFollows)
      .where(eq(schema.userFollows.followeeId, userId))
      .get(),
    db
      .select({ value: count() })
      .from(schema.federationFollowers)
      .where(
        and(
          eq(schema.federationFollowers.localUserId, userId),
          eq(schema.federationFollowers.status, "active"),
        ),
      )
      .get(),
  ]);
  return (local?.value ?? 0) + (federated?.value ?? 0);
}

export async function countPublicFollowing(
  db: Db,
  userId: string,
): Promise<number> {
  const row = await db
    .select({ value: count() })
    .from(schema.userFollows)
    .innerJoin(
      schema.user,
      eq(schema.userFollows.followeeId, schema.user.id),
    )
    .where(
      and(
        eq(schema.userFollows.followerId, userId),
        eq(schema.user.isPublic, true),
        isNotNull(schema.user.username),
      ),
    )
    .get();
  return row?.value ?? 0;
}

export async function listPublicFollowUsers(
  db: Db,
  mediaOrigin: string,
  userId: string,
  direction: "followers" | "following",
  limit: number,
  cursorValue?: string,
) {
  const cursor = cursorValue ? decodeFollowCursor(cursorValue) : null;
  const relationshipUserId =
    direction === "followers"
      ? schema.userFollows.followerId
      : schema.userFollows.followeeId;
  const ownerCondition =
    direction === "followers"
      ? eq(schema.userFollows.followeeId, userId)
      : eq(schema.userFollows.followerId, userId);
  const localItemId = sql<string>`'local:' || ${relationshipUserId}`;
  const cursorCondition: SQL | undefined = cursor
    ? or(
        lt(schema.userFollows.createdAt, cursor.createdAt),
        and(
          eq(schema.userFollows.createdAt, cursor.createdAt),
          lt(localItemId, cursor.itemId),
        ),
      )
    : undefined;

  const localRowsPromise = db
    .select({
      id: schema.user.id,
      username: schema.user.username,
      name: schema.user.name,
      bio: schema.user.bio,
      avatarKey: schema.user.avatarKey,
      createdAt: schema.userFollows.createdAt,
    })
    .from(schema.userFollows)
    .innerJoin(schema.user, eq(relationshipUserId, schema.user.id))
    .where(
      and(
        ownerCondition,
        eq(schema.user.isPublic, true),
        isNotNull(schema.user.username),
        cursorCondition,
      ),
    )
    .orderBy(desc(schema.userFollows.createdAt), desc(relationshipUserId))
    .limit(limit + 1)
    .all();

  const federatedRowsPromise = direction === "followers"
    ? db
        .select({
          id: schema.federationFollowers.id,
          handle: schema.federationFollowers.handle,
          actorUri: schema.federationFollowers.remoteActorUri,
          createdAt: schema.federationFollowers.createdAt,
        })
        .from(schema.federationFollowers)
        .where(
          and(
            eq(schema.federationFollowers.localUserId, userId),
            eq(schema.federationFollowers.status, "active"),
            cursor
              ? or(
                  lt(
                    schema.federationFollowers.createdAt,
                    cursor.createdAt,
                  ),
                  and(
                    eq(
                      schema.federationFollowers.createdAt,
                      cursor.createdAt,
                    ),
                    lt(
                      sql<string>`'federated:' || ${schema.federationFollowers.id}`,
                      cursor.itemId,
                    ),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(
          desc(schema.federationFollowers.createdAt),
          desc(schema.federationFollowers.id),
        )
        .limit(limit + 1)
        .all()
    : Promise.resolve([]);

  const [localRows, federatedRows] = await Promise.all([
    localRowsPromise,
    federatedRowsPromise,
  ]);
  const rows = [
    ...localRows.map((row) => ({
      createdAt: row.createdAt,
      itemId: `local:${row.id}`,
      user: {
        kind: "local" as const,
        username: row.username!,
        name: row.name,
        bio: row.bio,
        avatarUrl: avatarUrl(mediaOrigin, row.avatarKey),
      },
    })),
    ...federatedRows.map((row) => ({
      createdAt: row.createdAt,
      itemId: `federated:${row.id}`,
      user: {
        kind: "federated" as const,
        handle: row.handle,
        actorUrl: safeActorUrl(row.actorUri),
      },
    })),
  ].sort((a, b) => {
    const byDate = b.createdAt.getTime() - a.createdAt.getTime();
    if (byDate !== 0) return byDate;
    if (a.itemId === b.itemId) return 0;
    return a.itemId < b.itemId ? 1 : -1;
  });

  const hasNext = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = hasNext ? page.at(-1) : undefined;
  return {
    users: page.map((row) => row.user),
    nextCursor: last
      ? encodeFollowCursor(last.createdAt, last.itemId)
      : null,
  };
}

function safeActorUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function encodeFollowCursor(createdAt: Date, itemId: string): string {
  return btoa(
    JSON.stringify([Math.floor(createdAt.getTime() / 1000), itemId]),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeFollowCursor(value: string): FollowCursor {
  try {
    if (value.length < 2 || value.length > 500) {
      throw new InvalidFollowCursorError();
    }
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded: unknown = JSON.parse(atob(padded));
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      !Number.isInteger(decoded[0]) ||
      decoded[0] < 0 ||
      typeof decoded[1] !== "string" ||
      decoded[1].length < 1 ||
      decoded[1].length > 128
    ) {
      throw new InvalidFollowCursorError();
    }
    return {
      createdAt: new Date(decoded[0] * 1000),
      itemId: decoded[1],
    };
  } catch (error) {
    if (error instanceof InvalidFollowCursorError) throw error;
    throw new InvalidFollowCursorError();
  }
}
