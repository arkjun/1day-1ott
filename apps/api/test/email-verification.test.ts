import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createAuth } from "../src/auth";

const JSON_HEADERS = {
  "content-type": "application/json",
  origin: "http://localhost",
};

describe("이메일 인증", () => {
  it("인증하지 않은 이메일로 다시 가입하면 인증 메일을 재발송한다", async () => {
    const sentEmails: {
      to: string;
      verificationUrl: string;
      lang?: string;
    }[] = [];
    const auth = createAuth(env, {
      sendVerificationEmail: async (email) => {
        sentEmails.push(email);
      },
    });
    const body = {
      email: "retry-signup@example.com",
      password: "test-password-123",
      name: "retry-signup",
      callbackURL: "/",
      lang: "en",
    };

    const firstSignup = await auth.api.signUpEmail({
      headers: new Headers(JSON_HEADERS),
      body,
    });
    const secondSignup = await auth.api.signUpEmail({
      headers: new Headers(JSON_HEADERS),
      body,
    });

    expect(firstSignup.token).toBeNull();
    expect(secondSignup.token).toBeNull();
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails.map((email) => email.lang)).toEqual(["en", "en"]);

    const resentUrl = new URL(sentEmails[1]!.verificationUrl);
    expect(resentUrl.pathname).toBe("/api/auth/verify-email");
    const verification = await auth.api.verifyEmail({
      query: { token: resentUrl.searchParams.get("token")! },
    });
    expect(verification).toMatchObject({ status: true });
  });

  it("이미 인증한 이메일로 다시 가입하면 인증 메일을 발송하지 않는다", async () => {
    const sentEmails: { to: string; verificationUrl: string }[] = [];
    const auth = createAuth(env, {
      sendVerificationEmail: async (email) => {
        sentEmails.push(email);
      },
    });
    const body = {
      email: "verified-retry@example.com",
      password: "test-password-123",
      name: "verified-retry",
      callbackURL: "/",
    };

    await auth.api.signUpEmail({
      headers: new Headers(JSON_HEADERS),
      body,
    });
    const token = new URL(sentEmails[0]!.verificationUrl).searchParams.get(
      "token",
    );
    await auth.api.verifyEmail({ query: { token: token! } });

    await auth.api.signUpEmail({
      headers: new Headers(JSON_HEADERS),
      body,
    });

    expect(sentEmails).toHaveLength(1);
  });

  it("가입 메일의 링크를 확인하기 전에는 로그인할 수 없다", async () => {
    const sentEmails: { to: string; verificationUrl: string }[] = [];
    const auth = createAuth(env, {
      sendVerificationEmail: async (email) => {
        sentEmails.push(email);
      },
    });
    const credentials = {
      email: "verify-user@example.com",
      password: "test-password-123",
    };

    const signup = await auth.api.signUpEmail({
      headers: new Headers(JSON_HEADERS),
      body: {
          ...credentials,
          name: "verify-user",
          callbackURL: "/",
      },
    });

    expect(signup.token).toBeNull();
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toBe(credentials.email);
    expect(sentEmails[0]?.verificationUrl).toMatch(
      /^http:\/\/localhost\/api\/auth\/verify-email\?token=.+/,
    );

    const verificationToken = new URL(
      sentEmails[0]!.verificationUrl,
    ).searchParams.get("token");
    expect(verificationToken).toBeTruthy();
    const verification = await auth.api.verifyEmail({
      query: {
        token: verificationToken!,
      },
    });
    expect(verification).toMatchObject({ status: true });

    const verifiedLogin = await auth.api.signInEmail({
      headers: new Headers(JSON_HEADERS),
      body: credentials,
    });
    expect(verifiedLogin.token).toBeTruthy();
  });
});
