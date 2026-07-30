import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { resources } from "../i18n/locales";
import { AuthVerificationNotice } from "./AuthVerificationNotice";

async function render(resent: boolean, isResending = false) {
  const i18n = createInstance();
  await i18n.init({
    lng: "ko",
    fallbackLng: "ko",
    resources,
    interpolation: { escapeValue: false },
  });

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <AuthVerificationNotice
        email="new-user@example.com"
        resent={resent}
        isResending={isResending}
        onResend={vi.fn()}
      />
    </I18nextProvider>,
  );
}

describe("AuthVerificationNotice", () => {
  it("인증 대상 이메일과 재발송 버튼을 안내한다", async () => {
    const html = await render(false);

    expect(html).toContain("new-user@example.com");
    expect(html).toContain("받은편지함");
    expect(html).toContain("인증 메일 다시 보내기");
    expect(html).toContain('role="status"');
  });

  it("재발송 중과 완료 상태를 구분한다", async () => {
    expect(await render(false, true)).toContain("보내는 중…");
    expect(await render(true)).toContain("인증 메일을 다시 보냈습니다");
  });
});
