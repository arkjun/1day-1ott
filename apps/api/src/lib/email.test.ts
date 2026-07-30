import type { Message, Receipt } from "@upyo/core";
import { describe, expect, it } from "vitest";
import { createVerificationEmailSender } from "./email";

function transportWith(receipt: Receipt) {
  const messages: Message[] = [];
  return {
    messages,
    transport: {
      async send(message: Message) {
        messages.push(message);
        return receipt;
      },
    },
  };
}

describe("createVerificationEmailSender", () => {
  it("인증 링크를 한국어 HTML과 텍스트로 발송한다", async () => {
    const { messages, transport } = transportWith({
      successful: true,
      messageId: "email-1",
    });
    const sendVerificationEmail = createVerificationEmailSender(transport);
    const verificationUrl =
      "https://1day1ott.com/api/auth/verify-email?token=abc&callbackURL=%2F";

    await sendVerificationEmail({
      to: "new-user@example.com",
      verificationUrl,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      sender: {
        name: "1일 1OTT",
        address: "noreply@1day1ott.com",
      },
      recipients: [{ address: "new-user@example.com" }],
      subject: "[1일 1OTT] 이메일 주소를 인증해 주세요",
      tags: ["email-verification"],
    });
    const content = messages[0]!.content;
    expect(content.text).toContain(verificationUrl);
    expect("html" in content ? content.html : "").toContain(
      "https://1day1ott.com/api/auth/verify-email?token=abc&amp;callbackURL=%2F",
    );
  });

  it("Upyo 전송 실패 영수증을 예외로 전환한다", async () => {
    const { transport } = transportWith({
      successful: false,
      errorMessages: ["domain is not verified"],
    });
    const sendVerificationEmail = createVerificationEmailSender(transport);

    await expect(
      sendVerificationEmail({
        to: "new-user@example.com",
        verificationUrl: "https://1day1ott.com/verify",
      }),
    ).rejects.toThrow("domain is not verified");
  });
});
