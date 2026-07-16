import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb, schema } from "./db";
import type { Env } from "./env";

/**
 * Better Auth 인스턴스는 요청당 1회 생성한다.
 * D1 write-lock 경합을 피하기 위한 Cloudflare 권장 패턴.
 */
export function createAuth(env: Env) {
  const db = createDb(env.DB);
  // WebAuthn rpID 는 스킴/포트 없는 호스트명. origin 은 웹 앱이 뜨는 곳.
  const rpID = new URL(env.WEB_ORIGIN).hostname;
  return betterAuth({
    plugins: [
      passkey({ rpID, rpName: "1일 1OTT", origin: env.WEB_ORIGIN }),
    ],
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    // M0: 자체 완결 검증을 위해 이메일+비밀번호.
    emailAndPassword: {
      enabled: true,
      // M0 로컬 검증용. 실제 서비스 전 이메일 인증 켜기.
      requireEmailVerification: false,
    },
    user: {
      additionalFields: {
        username: { type: "string", required: false, input: true },
        isPublic: { type: "boolean", required: false, input: false },
        lang: { type: "string", required: false, input: true },
      },
    },
    // GitHub 소셜은 키가 있을 때만 활성화(M0에선 보통 undefined).
    socialProviders:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : undefined,
    trustedOrigins: [env.WEB_ORIGIN, env.BETTER_AUTH_URL],
  });
}

export type Auth = ReturnType<typeof createAuth>;
