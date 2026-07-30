import {
  createMessage,
  type Message,
  type Receipt,
} from "@upyo/core";
import { ResendTransport } from "@upyo/resend";
import { escapeHtml } from "./html";

const VERIFICATION_FROM = "1일 1OTT <noreply@1day1ott.com>";

export interface VerificationEmail {
  to: string;
  verificationUrl: string;
}

export type VerificationEmailSender = (
  email: VerificationEmail,
) => Promise<void>;

interface EmailTransport {
  send(message: Message): Promise<Receipt>;
}

export function createVerificationEmailSender(
  transport: EmailTransport,
): VerificationEmailSender {
  return async ({ to, verificationUrl }) => {
    const receipt = await transport.send(
      createMessage({
        from: VERIFICATION_FROM,
        to,
        subject: "[1일 1OTT] 이메일 주소를 인증해 주세요",
        content: {
          html: verificationEmailHtml(verificationUrl),
          text: [
            "1일 1OTT 가입을 완료하려면 아래 링크에서 이메일 주소를 인증해 주세요.",
            "",
            verificationUrl,
            "",
            "본인이 요청하지 않았다면 이 메일을 무시해 주세요.",
          ].join("\n"),
        },
        tags: ["email-verification"],
      }),
    );

    if (!receipt.successful) {
      throw new Error(
        `Failed to send verification email: ${receipt.errorMessages.join(", ")}`,
      );
    }
  };
}

export function createResendVerificationEmailSender(
  apiKey: string,
): VerificationEmailSender {
  return createVerificationEmailSender(
    new ResendTransport({
      apiKey,
      retries: 3,
      timeout: 15_000,
    }),
  );
}

function verificationEmailHtml(verificationUrl: string): string {
  const escapedUrl = escapeHtml(verificationUrl);
  return `<!doctype html>
<html lang="ko">
  <body style="margin:0;background:#f6f8f6;color:#1f2a22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="background:#fff;border:1px solid #dce5dd;border-radius:16px;padding:32px">
        <p style="margin:0 0 24px;font-size:20px;font-weight:700">🌱 1일 1OTT</p>
        <h1 style="margin:0 0 16px;font-size:24px">이메일 주소를 인증해 주세요</h1>
        <p style="margin:0 0 24px;line-height:1.6">
          아래 버튼을 누르면 가입이 완료됩니다. 인증 링크는 1시간 동안 유효합니다.
        </p>
        <a href="${escapedUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#287a45;color:#fff;text-decoration:none;font-weight:700">
          이메일 인증하기
        </a>
        <p style="margin:28px 0 8px;color:#607066;font-size:13px">
          버튼이 열리지 않으면 아래 주소를 브라우저에 붙여 넣어 주세요.
        </p>
        <p style="margin:0;word-break:break-all;font-size:12px">
          <a href="${escapedUrl}" style="color:#287a45">${escapedUrl}</a>
        </p>
        <p style="margin:28px 0 0;color:#607066;font-size:12px">
          본인이 요청하지 않았다면 이 메일을 무시해 주세요.
        </p>
      </div>
    </div>
  </body>
</html>`;
}
