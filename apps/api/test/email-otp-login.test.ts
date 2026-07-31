import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createAuth } from "../src/auth";

const JSON_HEADERS = {
  "content-type": "application/json",
  origin: "http://localhost",
};

describe("이메일 인증 로그인", () => {
  it("기존 사용자가 이메일로 받은 OTP로 로그인한다", async () => {
    const verificationEmails: { verificationUrl: string }[] = [];
    const otpEmails: { to: string; otp: string; lang?: string }[] = [];
    const auth = createAuth(env, {
      sendVerificationEmail: async (email) => {
        verificationEmails.push(email);
      },
      sendSignInOtpEmail: async (email) => {
        otpEmails.push(email);
      },
    });
    const email = "otp-login@example.com";

    await auth.api.signUpEmail({
      headers: new Headers(JSON_HEADERS),
      body: {
        email,
        password: "test-password-123",
        name: "otp-login",
        callbackURL: "/",
        lang: "ja",
      },
    });
    const verificationToken = new URL(
      verificationEmails[0]!.verificationUrl,
    ).searchParams.get("token");
    await auth.api.verifyEmail({
      query: { token: verificationToken! },
    });

    const requested = await auth.api.sendVerificationOTP({
      headers: new Headers(JSON_HEADERS),
      body: { email, type: "sign-in" },
    });

    expect(requested).toEqual({ success: true });
    expect(otpEmails).toEqual([
      {
        to: email,
        otp: expect.stringMatching(/^\d{6}$/),
        lang: "ja",
      },
    ]);

    const login = await auth.api.signInEmailOTP({
      headers: new Headers(JSON_HEADERS),
      body: { email, otp: otpEmails[0]!.otp },
    });

    expect(login.token).toBeTruthy();
    expect(login.user.email).toBe(email);
  });

  it("등록되지 않은 이메일에도 성공으로 응답하지만 OTP는 발송하지 않는다", async () => {
    const otpEmails: { to: string; otp: string }[] = [];
    const auth = createAuth(env, {
      sendVerificationEmail: async () => {},
      sendSignInOtpEmail: async (email) => {
        otpEmails.push(email);
      },
    });

    const requested = await auth.api.sendVerificationOTP({
      headers: new Headers(JSON_HEADERS),
      body: {
        email: "unknown-otp-user@example.com",
        type: "sign-in",
      },
    });

    expect(requested).toEqual({ success: true });
    expect(otpEmails).toEqual([]);
  });
});
