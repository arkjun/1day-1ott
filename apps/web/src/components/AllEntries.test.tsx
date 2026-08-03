import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n/locales";
import type { EntryRow } from "../lib/api";
import { AllEntries, PAGE_SIZE } from "./AllEntries";

function makeEntries(n: number): EntryRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    contentId: `c${i}`,
    watchedOn: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    reaction: null,
    note: null,
    isNotePublic: true,
    platform: null,
    type: "movie" as const,
    title: `작품 ${i}`,
    channelName: null,
    posterUrl: null,
  }));
}

async function render(entries: EntryRow[], initialQuery = "") {
  const i18n = createInstance();
  await i18n.init({ lng: "ko", fallbackLng: "ko", resources, interpolation: { escapeValue: false } });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <AllEntries entries={entries} initialQuery={initialQuery} onChanged={() => {}} />
    </I18nextProvider>,
  );
}

describe("AllEntries", () => {
  it("총 개수와 검색창을 보여준다", async () => {
    const html = await render(makeEntries(3));
    expect(html).toContain("전체 기록");
    expect(html).toContain("3편");
    expect(html).toContain("제목·감상·날짜 검색");
  });

  it("한 번에 PAGE_SIZE 개까지만 렌더하고 더 보기를 남긴다", async () => {
    const html = await render(makeEntries(PAGE_SIZE + 5));
    expect(html).toContain(`작품 ${PAGE_SIZE - 1}`);
    expect(html).not.toContain(`작품 ${PAGE_SIZE}<`);
    expect(html).toContain("더 보기");
  });

  it("전부 보이면 더 보기 버튼이 없다", async () => {
    const html = await render(makeEntries(3));
    expect(html).not.toContain("더 보기");
  });

  it("유튜브 기록에 채널명을 함께 보여준다", async () => {
    const [entry] = makeEntries(1);
    const html = await render([
      {
        ...entry!,
        type: "youtube",
        title: "테스트 영상",
        channelName: "테스트 채널",
      },
    ]);

    expect(html).toContain("테스트 영상");
    expect(html).toContain("테스트 채널");
  });

  it("기록이 없으면 안내 문구", async () => {
    const html = await render([]);
    expect(html).toContain("아직 기록이 없어요");
  });

  it("초기 검색 날짜에 해당하는 기록만 렌더링한다", async () => {
    const entries = makeEntries(2).map((entry, index) => ({
      ...entry,
      watchedOn: index === 0 ? "2026-08-02" : "2026-08-03",
    }));

    const html = await render(entries, "2026-08-02");

    expect(html).toContain('value="2026-08-02"');
    expect(html).toContain("작품 0");
    expect(html).not.toContain("작품 1");
  });
});
