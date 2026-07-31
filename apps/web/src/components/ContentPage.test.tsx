import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n/locales";
import { ContentSourceLink } from "./ContentPage";

describe("ContentSourceLink", () => {
  it("YouTube 채널명과 원본 영상 링크를 표시한다", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ContentSourceLink
          source={{
            name: "Rick Astley",
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          }}
        />
      </I18nextProvider>,
    );

    expect(html).toContain("채널");
    expect(html).toContain("Rick Astley");
    expect(html).toContain("YouTube에서 보기");
    expect(html).toContain(
      'href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });
});
