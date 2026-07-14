import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import type { Env } from "./env";
import { entriesRoute } from "./routes/entries";
import { searchRoute } from "./routes/search";

type Vars = { userId: string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// CORS: 웹 origin 허용 + 쿠키 세션. (미래 확장 origin 은 여기에 추가 → C 준비)
app.use("/api/*", (c, next) =>
  cors({
    origin: c.env.WEB_ORIGIN,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  })(c, next),
);

app.get("/health", (c) => c.json({ ok: true }));

// Better Auth 핸들러 마운트.
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// 인증 게이트: /api/entries, /api/heatmap 등 도메인 라우트.
app.use("/api/*", async (c, next) => {
  // auth 경로는 위에서 이미 처리됨.
  if (c.req.path.startsWith("/api/auth/")) return next();
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.user.id);
  return next();
});

app.route("/api", entriesRoute);
app.route("/api", searchRoute);

export default app;
