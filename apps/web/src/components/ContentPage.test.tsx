import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n/locales";
import { ContentSourceLink, ViewingStatusSelect } from "./ContentPage";

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

describe("ViewingStatusSelect", () => {
  it("네 가지 작품 상태와 현재 선택을 표시한다", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ViewingStatusSelect
          value="completed"
          onChange={() => undefined}
          disabled
        />
      </I18nextProvider>,
    );

    expect(html).toContain("보는 중");
    expect(html).toContain("다 봤음");
    expect(html).toContain("보다 말았음");
    expect(html).toContain("관심 있음");
    expect(html).toContain("내 상태");
    expect(html).toContain("<select disabled=\"\"");
    expect(html).toContain('<option value="completed" selected="">다 봤음</option>');
  });
});
