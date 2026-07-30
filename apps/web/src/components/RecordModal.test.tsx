import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n/locales";
import { RecordModal } from "./RecordModal";

describe("RecordModal", () => {
  it("전체를 기본 선택하고 최근 기록을 렌더링한다", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <RecordModal
          recentContents={Array.from({ length: 5 }, (_, index) => ({
            contentId: `tv-${index}`,
            type: "tv",
            title: `드라마 ${index}`,
            posterUrl: null,
          }))}
          onClose={() => {}}
          onSaved={() => {}}
        />
      </I18nextProvider>,
    );
    expect(html).toContain('class="record-modal"');
    expect(html).toMatch(
      /<button style="[^"]*background:var\(--accent\)[^"]*">전체<\/button>/,
    );
    expect(html).toContain("드라마 4");
    expect(html).toContain("감상평 공개");
    expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
  });
});
