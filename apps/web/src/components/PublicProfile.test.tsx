import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { resources } from "../i18n/locales";
import { PublicProfileActions } from "./PublicProfile";

describe("PublicProfileActions", () => {
  it("링크 복사와 테마 전환만 제공하고 잔디 이미지 다운로드는 제공하지 않는다", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <PublicProfileActions
          scheme="light"
          copied={false}
          onToggle={vi.fn()}
          onCopyLink={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(html).toContain("링크 복사");
    expect(html).toContain('aria-label="테마 전환"');
    expect(html).not.toContain("잔디 이미지");
    expect(html).not.toContain("download");
  });
});
