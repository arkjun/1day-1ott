import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { resources } from "../i18n/locales";
import { MyPage } from "./MyPage";

vi.mock("../lib/authClient", () => ({
  authClient: {
    changePassword: vi.fn(),
    passkey: { addPasskey: vi.fn() },
  },
  signIn: { email: vi.fn() },
}));

vi.mock("../lib/theme", () => ({
  useTheme: () => ({ resolved: "light", setTheme: vi.fn() }),
}));

describe("MyPage 연합우주 설정", () => {
  it("기본 비활성화된 옵트인과 공개 범위 경고를 렌더링한다", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <MyPage
          user={{
            id: "user-id",
            name: "테스터",
            email: "tester@example.com",
          }}
        />
      </I18nextProvider>,
    );

    expect(html).toContain("연합우주");
    expect(html).toContain("Mastodon");
    expect(html).toMatch(
      /<input type="checkbox" disabled=""\/><span><b>연합우주 활성화<\/b>/,
    );
  });
});
