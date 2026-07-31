import {
  createMessage,
  type Message,
  type Receipt,
} from "@upyo/core";
import { ResendTransport } from "@upyo/resend";
import { escapeHtml } from "./html";

const VERIFICATION_FROM = "1일 1OTT <noreply@1day1ott.com>";

export const VERIFICATION_EMAIL_LANGS = ["ko", "en", "ja"] as const;
export type VerificationEmailLang = (typeof VERIFICATION_EMAIL_LANGS)[number];

export interface VerificationEmail {
  to: string;
  verificationUrl: string;
  lang?: VerificationEmailLang;
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
  return async ({ to, verificationUrl, lang = "ko" }) => {
    const copy = VERIFICATION_EMAIL_COPY[lang];
    const receipt = await transport.send(
      createMessage({
        from: VERIFICATION_FROM,
        to,
        subject: copy.subject,
        content: {
          html: verificationEmailHtml(verificationUrl, lang),
          text: [
            copy.text,
            "",
            verificationUrl,
            "",
            copy.ignore,
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

export function normalizeVerificationEmailLang(
  value: unknown,
): VerificationEmailLang | undefined {
  if (typeof value !== "string") return undefined;
  const base = value.toLowerCase().split("-")[0];
  return VERIFICATION_EMAIL_LANGS.find((lang) => lang === base);
}

interface VerificationEmailCopy {
  serviceName: string;
  subject: string;
  title: string;
  description: string;
  action: string;
  fallback: string;
  ignore: string;
  text: string;
}

const VERIFICATION_EMAIL_COPY: Record<
  VerificationEmailLang,
  VerificationEmailCopy
> = {
  ko: {
    serviceName: "1일 1OTT",
    subject: "[1일 1OTT] 이메일 주소를 인증해 주세요",
    title: "이메일 주소를 인증해 주세요",
    description:
      "아래 버튼을 누르면 가입이 완료됩니다. 인증 링크는 1시간 동안 유효합니다.",
    action: "이메일 인증하기",
    fallback: "버튼이 열리지 않으면 아래 주소를 브라우저에 붙여 넣어 주세요.",
    ignore: "본인이 요청하지 않았다면 이 메일을 무시해 주세요.",
    text:
      "1일 1OTT 가입을 완료하려면 아래 링크에서 이메일 주소를 인증해 주세요.",
  },
  en: {
    serviceName: "1DAY 1OTT",
    subject: "[1DAY 1OTT] Verify your email address",
    title: "Verify your email address",
    description:
      "Click the button below to complete your sign-up. This verification link is valid for 1 hour.",
    action: "Verify email",
    fallback:
      "If the button does not open, copy and paste the address below into your browser.",
    ignore: "If you did not request this email, you can safely ignore it.",
    text:
      "Verify your email address using the link below to complete your 1DAY 1OTT sign-up.",
  },
  ja: {
    serviceName: "1日 1OTT",
    subject: "[1日 1OTT] メールアドレスを確認してください",
    title: "メールアドレスを確認してください",
    description:
      "下のボタンを押すと登録が完了します。確認リンクは1時間有効です。",
    action: "メールアドレスを確認",
    fallback:
      "ボタンが開かない場合は、下のアドレスをブラウザに貼り付けてください。",
    ignore: "このメールに心当たりがない場合は、そのまま無視してください。",
    text:
      "1日 1OTTへの登録を完了するには、下のリンクからメールアドレスを確認してください。",
  },
};

function verificationEmailHtml(
  verificationUrl: string,
  lang: VerificationEmailLang,
): string {
  const escapedUrl = escapeHtml(verificationUrl);
  const copy = VERIFICATION_EMAIL_COPY[lang];
  return `<!doctype html>
<html lang="${lang}">
  <body style="margin:0;background:#f6f8f6;color:#1f2a22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="background:#fff;border:1px solid #dce5dd;border-radius:16px;padding:32px">
        <p style="margin:0 0 24px;font-size:20px;font-weight:700">🌱 ${copy.serviceName}</p>
        <h1 style="margin:0 0 16px;font-size:24px">${copy.title}</h1>
        <p style="margin:0 0 24px;line-height:1.6">
          ${copy.description}
        </p>
        <a href="${escapedUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#287a45;color:#fff;text-decoration:none;font-weight:700">
          ${copy.action}
        </a>
        <p style="margin:28px 0 8px;color:#607066;font-size:13px">
          ${copy.fallback}
        </p>
        <p style="margin:0;word-break:break-all;font-size:12px">
          <a href="${escapedUrl}" style="color:#287a45">${escapedUrl}</a>
        </p>
        <p style="margin:28px 0 0;color:#607066;font-size:12px">
          ${copy.ignore}
        </p>
      </div>
    </div>
  </body>
</html>`;
}
