import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createEmailVerificationToken } from "better-auth/api";
import { createDb, schema } from "./db";
import type { Env } from "./env";
import {
  createResendVerificationEmailSender,
  normalizeVerificationEmailLang,
  type VerificationEmailSender,
} from "./lib/email";

interface CreateAuthOptions {
  sendVerificationEmail?: VerificationEmailSender;
  backgroundTaskHandler?: (promise: Promise<unknown>) => void;
}

/**
 * Better Auth 인스턴스는 요청당 1회 생성한다.
 * D1 write-lock 경합을 피하기 위한 Cloudflare 권장 패턴.
 */
export function createAuth(env: Env, options: CreateAuthOptions = {}) {
  const db = createDb(env.DB);
  const sendVerificationEmail =
    options.sendVerificationEmail ??
    createResendVerificationEmailSender(env.RESEND_API_KEY);
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
      requireEmailVerification: true,
      autoSignIn: false,
      onExistingUserSignUp: async ({ user }, request) => {
        if (user.emailVerified) return;
        const body = await readSignUpBody(request);
        const token = await createEmailVerificationToken(
          env.BETTER_AUTH_SECRET,
          user.email,
          undefined,
          60 * 60,
        );
        const verificationUrl = new URL(
          "/api/auth/verify-email",
          env.BETTER_AUTH_URL,
        );
        verificationUrl.searchParams.set("token", token);
        verificationUrl.searchParams.set(
          "callbackURL",
          body.callbackURL ?? "/",
        );
        await sendVerificationEmail({
          to: user.email,
          verificationUrl: verificationUrl.toString(),
          lang:
            normalizeVerificationEmailLang(body.lang) ??
            verificationEmailLangFromUser(user),
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: ({ user, url }) =>
        sendVerificationEmail({
          to: user.email,
          verificationUrl: url,
          lang: verificationEmailLangFromUser(user),
        }),
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
    },
    user: {
      additionalFields: {
        username: { type: "string", required: false, input: true },
        isPublic: { type: "boolean", required: false, input: false },
        federationEnabled: { type: "boolean", required: false, input: false },
        federationHandle: { type: "string", required: false, input: false },
        lang: { type: "string", required: false, input: true },
        bio: { type: "string", required: false, input: false },
        avatarKey: { type: "string", required: false, input: false },
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
    advanced: options.backgroundTaskHandler
      ? {
          backgroundTasks: {
            handler: options.backgroundTaskHandler,
          },
        }
      : undefined,
  });
}

export type Auth = ReturnType<typeof createAuth>;

interface SignUpBody {
  callbackURL?: string;
  lang?: string;
}

function verificationEmailLangFromUser(user: object) {
  const { lang } = user as { lang?: unknown };
  return normalizeVerificationEmailLang(lang);
}

async function readSignUpBody(request: Request | undefined): Promise<SignUpBody> {
  if (!request) return {};
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return {};
  const { callbackURL, lang } = body as Record<string, unknown>;
  return {
    callbackURL: typeof callbackURL === "string" ? callbackURL : undefined,
    lang: typeof lang === "string" ? lang : undefined,
  };
}
