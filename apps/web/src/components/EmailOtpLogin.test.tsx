import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { resources } from "../i18n/locales";
import { EmailOtpLogin } from "./EmailOtpLogin";

async function render(codeSent: boolean) {
  const i18n = createInstance();
  await i18n.init({
    lng: "ko",
    fallbackLng: "ko",
    resources,
    interpolation: { escapeValue: false },
  });

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <EmailOtpLogin
        email="existing-user@example.com"
        otp=""
        codeSent={codeSent}
        isSubmitting={false}
        onEmailChange={vi.fn()}
        onOtpChange={vi.fn()}
        onRequestCode={vi.fn()}
        onSignIn={vi.fn()}
        onBack={vi.fn()}
      />
    </I18nextProvider>,
  );
}

describe("EmailOtpLogin", () => {
  it("이메일로 로그인 코드를 요청하는 화면을 렌더링한다", async () => {
    const html = await render(false);

    expect(html).toContain("비밀번호나 Passkey를 분실했나요?");
    expect(html).toContain('type="email"');
    expect(html).toContain("인증 코드 받기");
  });

  it("코드 발송 후 OTP 입력 화면을 렌더링한다", async () => {
    const html = await render(true);

    expect(html).toContain("existing-user@example.com");
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toContain("인증 코드로 로그인");
    expect(html).toContain("인증 코드 다시 받기");
  });
});
