import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n/locales";
import { LandingPreview } from "./LandingPreview";

describe("LandingPreview", () => {
  it("샘플 대시보드와 두 가지 프리뷰 탭을 렌더링한다", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <LandingPreview />
      </I18nextProvider>,
    );

    expect(html).toContain("실제 사용 화면을 미리 만나보세요");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("나의 잔디");
    expect(html).toContain("기록하기");
    expect(html).toContain("연속 기록");
    expect(html).toContain("최근 본 콘텐츠");
  });
});
