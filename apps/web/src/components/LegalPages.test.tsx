import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n/locales";
import { LegalPage } from "./LegalPage";
import { SiteFooter } from "./SiteFooter";

async function render(ui: React.ReactNode) {
  const i18n = createInstance();
  await i18n.init({
    lng: "ko",
    fallbackLng: "ko",
    resources,
    interpolation: { escapeValue: false },
  });

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>,
  );
}

describe("법적 고지", () => {
  it("개인정보 처리방침에 실제 처리 항목과 문의처를 표시한다", async () => {
    const html = await render(<LegalPage kind="privacy" />);

    expect(html).toContain("개인정보 처리방침");
    expect(html).toContain("IP 주소");
    expect(html).toContain("Passkey");
    expect(html).toContain("Cloudflare");
    expect(html).toContain("support@1day1ott.com");
  });

  it("이용약관에 서비스와 사용자 콘텐츠 조건을 표시한다", async () => {
    const html = await render(<LegalPage kind="terms" />);

    expect(html).toContain("이용약관");
    expect(html).toContain("사용자 콘텐츠");
    expect(html).toContain("만 14세");
  });

  it("footer에서 정책 페이지로 이동할 수 있다", async () => {
    const html = await render(<SiteFooter />);

    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).not.toContain("github.com");
  });
});
