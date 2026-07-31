import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { resources } from "../i18n/locales";
import { ProfileHeader, PublicNotes, PublicProfileActions } from "./PublicProfile";

describe("ProfileHeader", () => {
  it("공개 아바타, 이름, 사용자명, 소개를 표시한다", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ProfileHeader
          profile={{
            username: "tester",
            name: "테스터",
            bio: "첫 줄\n둘째 줄",
            avatarUrl: "https://media.1day1ott.com/avatars/test.webp",
            followerCount: 0,
            followingCount: 0,
            total: 0,
            cells: [],
            posters: [],
            notes: [],
          }}
        />
      </I18nextProvider>,
    );

    expect(html).toContain("테스터");
    expect(html).toContain("@tester");
    expect(html).toContain("첫 줄\n둘째 줄");
    expect(html).toContain("https://media.1day1ott.com/avatars/test.webp");
  });
});

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

describe("PublicNotes", () => {
  it("공개 감상평에 작품, 날짜, 반응, 포스터를 표시한다", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "ko",
      fallbackLng: "ko",
      resources,
      interpolation: { escapeValue: false },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <PublicNotes
          notes={[
            {
              id: "entry-1",
              contentId: "content-1",
              title: "듄: 파트2",
              posterUrl: "https://example.com/dune.jpg",
              watchedOn: "2026-07-30",
              reaction: "love",
              note: "압도적인 영상미",
            },
          ]}
        />
      </I18nextProvider>,
    );

    expect(html).toContain("감상평");
    expect(html).toContain("듄: 파트2");
    expect(html).toContain("2026-07-30");
    expect(html).toContain("👍👍");
    expect(html).toContain("압도적인 영상미");
    expect(html).toContain("https://example.com/dune.jpg");
  });
});
