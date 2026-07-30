import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createAuth } from "../src/auth";

const JSON_HEADERS = {
  "content-type": "application/json",
  origin: "http://localhost",
};

describe("이메일 인증", () => {
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
