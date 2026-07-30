import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import type { Env } from "./env";
import { entriesRoute } from "./routes/entries";
import { meRoute } from "./routes/me";
import { publicRoute } from "./routes/public";
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

app.get("/health", (c) => c.json({ ok: true }));

// Better Auth 핸들러 마운트.
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env);
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
