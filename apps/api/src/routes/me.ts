import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
} from "@1ott/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../env";
import { publishActorUpdate } from "../federation";
import { ensureActorKeys } from "../federation/keys";
import {
  avatarUrl,
  parseAvatarFile,
  ProfileImageError,
} from "../lib/avatar";

type Vars = { userId: string };
export const meRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

const patchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(PROFILE_NAME_MAX_LENGTH)
    .optional(),
  username: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/, "소문자/숫자/_ 3~20자")
    .optional(),
  isPublic: z.boolean().optional(),
  federationEnabled: z.boolean().optional(),
  lang: z.enum(["ko", "en", "ja"]).optional(),
  bio: z
    .string()
    .max(PROFILE_BIO_MAX_LENGTH)
    .nullable()
    .transform((value) => value?.trim() || null)
    .optional(),
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
      name: schema.user.name,
      username: schema.user.username,
      isPublic: schema.user.isPublic,
      federationEnabled: schema.user.federationEnabled,
      federationHandle: schema.user.federationHandle,
      bio: schema.user.bio,
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
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.username !== undefined) patch.username = parsed.data.username;
  if (parsed.data.isPublic !== undefined) patch.isPublic = parsed.data.isPublic;
  if (parsed.data.federationEnabled !== undefined) {
    patch.federationEnabled = parsed.data.federationEnabled;
    if (parsed.data.federationEnabled && current.federationHandle == null) {
      patch.federationHandle = nextUsername;
    }
  }
  if (parsed.data.lang !== undefined) patch.lang = parsed.data.lang;
  if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio;

  if (parsed.data.federationEnabled === true) {
    await ensureActorKeys(c.env, userId);
  }
  try {
    await db.update(schema.user).set(patch).where(eq(schema.user.id, userId));
  } catch (error) {
    if (parsed.data.username !== undefined) {
      return c.json({ error: "username_taken" }, 409);
    }
    throw error;
  }
  const federationInactive = !nextIsPublic || !nextFederationEnabled;
  if (federationInactive) {
    const now = new Date();
    await db
      .update(schema.federationPublications)
      .set({
        status: "deleted",
        deletedAt: now,
        updatedAt: now,
        lastError: null,
      })
      .where(
        and(
          eq(schema.federationPublications.userId, userId),
          inArray(schema.federationPublications.status, ["pending", "failed"]),
        ),
      );
  }
  const profileChanged =
    (parsed.data.name !== undefined && parsed.data.name !== current.name) ||
    (parsed.data.bio !== undefined && parsed.data.bio !== current.bio);
  const federationStatus =
    nextIsPublic && nextFederationEnabled &&
    (profileChanged || parsed.data.federationEnabled === true)
      ? await publishActorUpdate(c.req.raw, c.env, userId)
      : undefined;
  return c.json({
    ok: true,
    ...parsed.data,
    federationEnabled:
      parsed.data.federationEnabled ?? current.federationEnabled,
    federationHandle:
      current.federationHandle ??
      (parsed.data.federationEnabled ? nextUsername : null),
    federationStatus,
  });
});

/** R2 아바타 등록 및 교체. */
meRoute.post("/me/avatar", async (c) => {
  const form = await c.req.raw.formData().catch(() => null);
  const avatars = form?.getAll("avatar") ?? [];
  const value = avatars[0];
  if (avatars.length !== 1) {
    return c.json({ error: "invalid_image_type" }, 400);
  }
  if (!(value instanceof File)) {
    return c.json({ error: "invalid_image_type" }, 400);
  }

  let avatar: Awaited<ReturnType<typeof parseAvatarFile>>;
  try {
    avatar = await parseAvatarFile(value);
  } catch (error) {
    if (error instanceof ProfileImageError) {
      return c.json(
        { error: error.code },
        error.code === "image_too_large" ? 413 : 400,
      );
    }
    throw error;
  }

  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const current = await db
    .select({
      avatarKey: schema.user.avatarKey,
      isPublic: schema.user.isPublic,
      federationEnabled: schema.user.federationEnabled,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .get();
  if (!current) return c.json({ error: "not_found" }, 404);

  const key = `avatars/${crypto.randomUUID()}.${avatar.extension}`;
  await c.env.MEDIA.put(key, avatar.bytes, {
    httpMetadata: {
      contentType: avatar.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: { ownerId: userId },
  });
  try {
    const updated = await db
      .update(schema.user)
      .set({ avatarKey: key, updatedAt: new Date() })
      .where(
        and(
          eq(schema.user.id, userId),
          current.avatarKey == null
            ? isNull(schema.user.avatarKey)
            : eq(schema.user.avatarKey, current.avatarKey),
        ),
      );
    if (updated.meta.changes !== 1) {
      await c.env.MEDIA.delete(key);
      return c.json({ error: "avatar_changed" }, 409);
    }
  } catch (error) {
    await c.env.MEDIA.delete(key);
    throw error;
  }

  if (current.avatarKey) {
    try {
      await c.env.MEDIA.delete(current.avatarKey);
    } catch (error) {
      console.error("Failed to delete previous avatar", {
        key: current.avatarKey,
        error,
      });
    }
  }
  const federationStatus =
    current.isPublic && current.federationEnabled
      ? await publishActorUpdate(c.req.raw, c.env, userId)
      : undefined;
  return c.json({
    avatarUrl: avatarUrl(c.env.MEDIA_ORIGIN, key),
    federationStatus,
  });
});

/** 커스텀 아바타를 제거하고 공용 기본 이미지로 되돌린다. */
meRoute.delete("/me/avatar", async (c) => {
  const db = createDb(c.env.DB);
  const userId = c.get("userId");
  const current = await db
    .select({
      avatarKey: schema.user.avatarKey,
      isPublic: schema.user.isPublic,
      federationEnabled: schema.user.federationEnabled,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .get();
  if (!current) return c.json({ error: "not_found" }, 404);

  if (current.avatarKey) {
    const updated = await db
      .update(schema.user)
      .set({ avatarKey: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.user.id, userId),
          eq(schema.user.avatarKey, current.avatarKey),
        ),
      );
    if (updated.meta.changes !== 1) {
      return c.json({ error: "avatar_changed" }, 409);
    }
    try {
      await c.env.MEDIA.delete(current.avatarKey);
    } catch (error) {
      console.error("Failed to delete avatar", {
        key: current.avatarKey,
        error,
      });
    }
  }
  const federationStatus =
    current.avatarKey && current.isPublic && current.federationEnabled
      ? await publishActorUpdate(c.req.raw, c.env, userId)
      : undefined;
  return c.json({
    avatarUrl: avatarUrl(c.env.MEDIA_ORIGIN, null),
    federationStatus,
  });
});
