import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createAuth } from "../src/auth";
import { app } from "../src/index";

describe("인증 API rate limit", () => {
  it("같은 클라이언트의 네 번째 로그인 요청을 429로 제한한다", async () => {
    let verificationUrl = "";
    const auth = createAuth(env, {
      sendVerificationEmail: async (message) => {
        verificationUrl = message.verificationUrl;
      },
    });

    await auth.api.signUpEmail({
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        email: "rate-limit@example.com",
        name: "Rate Limit",
        password: "password1234",
      },
    });

    const token = new URL(verificationUrl).searchParams.get("token");
    expect(token).toBeTruthy();
    await auth.api.verifyEmail({ query: { token: token! } });

    const statuses: number[] = [];

    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: {
            "cf-connecting-ip": "203.0.113.10",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: "rate-limit@example.com",
            password: "password1234",
          }),
        },
        env,
      );
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 3)).not.toContain(429);
    expect(statuses[3]).toBe(429);
  });
});
