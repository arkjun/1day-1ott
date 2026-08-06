import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Auth } from "./App";
import { resources } from "./i18n/locales";

afterEach(() => vi.unstubAllGlobals());

describe("Auth", () => {
  it("게스트 시작을 로그인 카드와 별도 영역으로 안내한다", async () => {
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => null },
    });
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <Auth onGuestStart={vi.fn()} />
      </I18nextProvider>,
    );

    expect(html).toContain(
      '</div><aside class="landing-guest-card"',
    );
    expect(html).toContain("가입 없이 먼저 둘러보기");
    expect(html).toContain("기록은 이 브라우저에만 저장됩니다");
  });
});
