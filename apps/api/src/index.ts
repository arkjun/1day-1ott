import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import { createDb } from "./db";
import type { Env } from "./env";
import { avatarMediaType, avatarUrl } from "./lib/avatar";
import { renderProfileHtml } from "./lib/profile-html";
import { entriesRoute } from "./routes/entries";
import { meRoute } from "./routes/me";
import { loadPublicUser, publicRoute } from "./routes/public";
import { searchRoute } from "./routes/search";
import {
  handleFederationRequest,
  isFederationPath,
  processFederationQueue,
  retryFailedPublications,
} from "./federation";

type Vars = { userId: string };

export const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// CORS: 웹 origin 허용 + 쿠키 세션. (미래 확장 origin 은 여기에 추가 → C 준비)
app.use("/api/*", (c, next) =>
  cors({
    origin: c.env.WEB_ORIGIN,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })(c, next),
);

app.use("*", async (c, next) => {
  if (!c.req.path.startsWith("/@")) return next();
  const shellRequest = new Request(new URL("/", c.req.url), c.req.raw);
  shellRequest.headers.delete("if-modified-since");
  shellRequest.headers.delete("if-none-match");
  const username = profileUsername(c.req.path);
  if (!username) return c.env.ASSETS.fetch(shellRequest);

  const [shell, user] = await Promise.all([
    c.env.ASSETS.fetch(shellRequest),
    loadPublicUser(createDb(c.env.DB), username),
  ]);
  if (
    !user ||
    !shell.headers.get("content-type")?.includes("text/html")
  ) {
    return shell;
  }

  const hasCustomAvatar = user.avatarKey != null;
  const imageUrl = hasCustomAvatar
    ? avatarUrl(c.env.MEDIA_ORIGIN, user.avatarKey)
    : new URL("/og-image.png", c.env.WEB_ORIGIN).toString();
  const html = renderProfileHtml(await shell.text(), {
    name: user.name,
    username: user.username,
    bio: user.bio,
    canonicalUrl: new URL(
      `/@${encodeURIComponent(user.username)}`,
      c.env.WEB_ORIGIN,
    ).toString(),
    imageUrl,
    imageType: hasCustomAvatar
      ? avatarMediaType(user.avatarKey)
      : "image/png",
    largeImage: !hasCustomAvatar,
    imageWidth: hasCustomAvatar ? undefined : 1200,
    imageHeight: hasCustomAvatar ? undefined : 630,
  });
  const headers = new Headers(shell.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("etag");
  headers.delete("last-modified");
  headers.set("cache-control", "public, max-age=300");
  return new Response(html, {
    status: shell.status,
    statusText: shell.statusText,
    headers,
  });
});

function profileUsername(pathname: string): string | null {
  const match = /^\/@([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    const username = decodeURIComponent(match[1]);
    return /^[a-z0-9_]{3,20}$/.test(username) ? username : null;
  } catch {
    return null;
  }
}

app.get("/u/:username", (c) => {
  const target = new URL(c.req.url);
  target.pathname = `/@${encodeURIComponent(c.req.param("username"))}`;
  return c.redirect(target.toString(), 308);
});

app.get("/health", (c) => c.json({ ok: true }));

// Better Auth 핸들러 마운트.
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, {
    backgroundTaskHandler: (promise) => c.executionCtx.waitUntil(promise),
  });
  return auth.handler(c.req.raw);
});

// 공개 라우트(무인증): 공개 프로필 + 잔디 SVG. 인증 게이트보다 먼저.
app.route("/api", publicRoute);

// 인증 게이트: /api/entries, /api/heatmap, /api/me 등 도메인 라우트.
app.use("/api/*", async (c, next) => {
  // auth·public 경로는 인증 불필요.
  if (c.req.path.startsWith("/api/auth/")) return next();
  if (c.req.path.startsWith("/api/u/")) return next();
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.user.id);
  return next();
});

app.route("/api", entriesRoute);
app.route("/api", searchRoute);
app.route("/api", meRoute);

export default {
  async fetch(
    request: Request,
    env: Env,
    executionCtx: ExecutionContext,
  ): Promise<Response> {
    if (isFederationPath(new URL(request.url))) {
      return handleFederationRequest(request, env);
    }
    return app.fetch(request, env, executionCtx);
  },
  queue: processFederationQueue,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    executionCtx: ExecutionContext,
  ): Promise<void> {
    executionCtx.waitUntil(retryFailedPublications(env));
  },
} satisfies ExportedHandler<Env>;
