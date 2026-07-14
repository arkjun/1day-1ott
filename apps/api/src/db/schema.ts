import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ *
 * Better Auth 코어 테이블 (모델명과 property key 를 그대로 맞춘다)
 * drizzle 어댑터는 JS property key(camelCase)로 필드를 매핑하므로
 * 컬럼명은 snake_case, key 는 camelCase 로 둔다.
 * username / isPublic 은 공개 프로필(M3)용 커스텀 필드.
 * ------------------------------------------------------------------ */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  username: text("username").unique(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
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
    type: text("type").notNull(), // movie|tv|anime|youtube|other
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
    rating: real("rating"),
    note: text("note"),
    platform: text("platform"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("entries_user_day_idx").on(t.userId, t.watchedOn)],
);

export const schema = {
  user,
  session,
  account,
  verification,
  content,
  entries,
};
