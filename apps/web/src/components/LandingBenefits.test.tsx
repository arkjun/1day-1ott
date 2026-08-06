import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n/locales";
import { LandingBenefits } from "./LandingBenefits";

describe("LandingBenefits", () => {
  it("서비스 장점과 연합우주 연결 방식을 소개한다", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <LandingBenefits />
      </I18nextProvider>,
    );

    expect(html).toContain("기록은 나답게, 연결은 가볍게");
    expect(html).toContain("영화부터 유튜브까지");
    expect(html).toContain("공개 범위는 직접 선택");
    expect(html).toContain("연합우주로 이어지는 감상");
    expect(html).toContain("Mastodon");
    expect(html).toContain("@myname@1day1ott.com");
  });
});
