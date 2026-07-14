import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../env";

type Vars = { userId: string };
export const meRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

const patchSchema = z.object({
  username: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/, "소문자/숫자/_ 3~20자")
    .optional(),
  isPublic: z.boolean().optional(),
});

/** 프로필 설정: username(공개용, 유일) + 공개 여부. */
meRoute.patch("/me", async (c) => {
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const db = createDb(c.env.DB);
  const userId = c.get("userId");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.username !== undefined) patch.username = parsed.data.username;
  if (parsed.data.isPublic !== undefined) patch.isPublic = parsed.data.isPublic;

  try {
    await db.update(schema.user).set(patch).where(eq(schema.user.id, userId));
  } catch {
    return c.json({ error: "username_taken" }, 409);
  }
  return c.json({ ok: true, ...parsed.data });
});
