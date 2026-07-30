import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../env";
import { ensureActorKeys } from "../federation/keys";

type Vars = { userId: string };
export const meRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

const patchSchema = z.object({
  username: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/, "소문자/숫자/_ 3~20자")
    .optional(),
  isPublic: z.boolean().optional(),
  federationEnabled: z.boolean().optional(),
  lang: z.enum(["ko", "en", "ja"]).optional(),
});

/** 프로필 설정: username(공개용, 유일) + 공개 여부. */
meRoute.patch("/me", async (c) => {
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const current = await db
    .select({
      username: schema.user.username,
      isPublic: schema.user.isPublic,
      federationEnabled: schema.user.federationEnabled,
      federationHandle: schema.user.federationHandle,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .get();
  if (!current) return c.json({ error: "not_found" }, 404);

  if (
    parsed.data.username !== undefined &&
    current.federationHandle != null &&
    parsed.data.username !== current.federationHandle
  ) {
    return c.json({ error: "federation_handle_locked" }, 409);
  }

  const nextUsername = parsed.data.username ?? current.username;
  const nextIsPublic = parsed.data.isPublic ?? current.isPublic;
  const nextFederationEnabled =
    parsed.data.federationEnabled ?? current.federationEnabled;
  if (
    nextFederationEnabled &&
    (!nextUsername || !nextIsPublic)
  ) {
    return c.json({ error: "federation_requires_public_profile" }, 400);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.username !== undefined) patch.username = parsed.data.username;
  if (parsed.data.isPublic !== undefined) patch.isPublic = parsed.data.isPublic;
  if (parsed.data.federationEnabled !== undefined) {
    patch.federationEnabled = parsed.data.federationEnabled;
    if (parsed.data.federationEnabled && current.federationHandle == null) {
      patch.federationHandle = nextUsername;
    }
  }
  if (parsed.data.lang !== undefined) patch.lang = parsed.data.lang;

  if (parsed.data.federationEnabled === true) {
    await ensureActorKeys(c.env, userId);
  }
  try {
    await db.update(schema.user).set(patch).where(eq(schema.user.id, userId));
  } catch {
    return c.json({ error: "username_taken" }, 409);
  }
  return c.json({
    ok: true,
    ...parsed.data,
    federationEnabled:
      parsed.data.federationEnabled ?? current.federationEnabled,
    federationHandle:
      current.federationHandle ??
      (parsed.data.federationEnabled ? nextUsername : null),
  });
});
