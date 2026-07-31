import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ *
 * Better Auth 코어 테이블 (모델명과 property key 를 그대로 맞춘다)
 * drizzle 어댑터는 JS property key(camelCase)로 필드를 매핑하므로
 * 컬럼명은 snake_case, key 는 camelCase 로 둔다.
 * username / isPublic / bio / avatarKey 는 공개 프로필용 커스텀 필드.
 * ------------------------------------------------------------------ */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  bio: text("bio"),
  avatarKey: text("avatar_key"),
  username: text("username").unique(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  federationEnabled: integer("federation_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  federationHandle: text("federation_handle").unique(),
  lang: text("lang"), // UI 언어(ko|en|ja). null 이면 클라이언트가 감지.
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** WebAuthn 자격증명. @better-auth/passkey 플러그인 스키마. */
export const passkey = sqliteTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
  transports: text("transports"),
  aaguid: text("aaguid"),
  createdAt: integer("created_at", { mode: "timestamp" }),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

/* ------------------------------------------------------------------ *
 * 도메인 테이블
 * ------------------------------------------------------------------ */

/** 정규화된 콘텐츠. 같은 작품은 (type,tmdbId)/(type,ytId)로 재사용. */
export const content = sqliteTable(
  "content",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(), // movie|tv|variety|anime|youtube|other
    tmdbId: integer("tmdb_id"),
    ytId: text("yt_id"),
    title: text("title").notNull(),
    posterUrl: text("poster_url"),
    meta: text("meta"), // JSON 문자열(선택)
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("content_tmdb_uq").on(t.type, t.tmdbId),
    uniqueIndex("content_yt_uq").on(t.type, t.ytId),
  ],
);

/** 하루 여러 개 허용. 잔디는 watchedOn 으로 count 집계. */
export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contentId: text("content_id")
      .notNull()
      .references(() => content.id, { onDelete: "restrict" }),
    watchedOn: text("watched_on").notNull(), // 'YYYY-MM-DD'
    reaction: text("reaction"), // 'down' | 'up' | 'love' (넷플릭스식 따봉)
    note: text("note"),
    isNotePublic: integer("is_note_public", { mode: "boolean" })
      .notNull()
      .default(true),
    platform: text("platform"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("entries_user_day_idx").on(t.userId, t.watchedOn),
    index("entries_content_idx").on(t.contentId),
  ],
);

/** 서비스 내부 사용자의 단방향 팔로우 관계. */
export const userFollows = sqliteTable(
  "user_follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    check(
      "user_follows_not_self_ck",
      sql`${t.followerId} <> ${t.followeeId}`,
    ),
    index("user_follows_followee_created_idx").on(
      t.followeeId,
      t.createdAt,
      t.followerId,
    ),
    index("user_follows_follower_created_idx").on(
      t.followerId,
      t.createdAt,
      t.followeeId,
    ),
  ],
);

/** 로컬 ActivityPub Actor의 서명 키. privateKey는 애플리케이션 키로 암호화한다. */
export const federationActorKeys = sqliteTable(
  "federation_actor_keys",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["RSASSA-PKCS1-v1_5", "Ed25519"] })
      .notNull(),
    publicKey: text("public_key").notNull(),
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

/** 외부 Actor가 로컬 Actor를 팔로우한 상태. */
export const federationFollowers = sqliteTable(
  "federation_followers",
  {
    id: text("id").primaryKey(),
    localUserId: text("local_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    remoteActorUri: text("remote_actor_uri").notNull(),
    remoteInboxUri: text("remote_inbox_uri").notNull(),
    remoteSharedInboxUri: text("remote_shared_inbox_uri"),
    followActivityUri: text("follow_activity_uri").notNull(),
    handle: text("handle"),
    status: text("status", { enum: ["active", "removed"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("federation_follower_actor_uq").on(
      t.localUserId,
      t.remoteActorUri,
    ),
    index("federation_follower_local_status_idx").on(
      t.localUserId,
      t.status,
    ),
  ],
);

/**
 * 로컬 기록과 연합우주 객체의 발행 상태.
 * 기록 삭제 뒤에도 Tombstone을 제공해야 하므로 entries FK를 의도적으로 두지 않는다.
 */
export const federationPublications = sqliteTable(
  "federation_publications",
  {
    entryId: text("entry_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "published", "failed", "deleted"],
    })
      .notNull()
      .default("pending"),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    lastError: text("last_error"),
  },
  (t) => [index("federation_publication_status_idx").on(t.status)],
);

export const schema = {
  user,
  session,
  account,
  verification,
  passkey,
  content,
  entries,
  userFollows,
  federationActorKeys,
  federationFollowers,
  federationPublications,
};
