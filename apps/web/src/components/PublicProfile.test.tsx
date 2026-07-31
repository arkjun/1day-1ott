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
            canReact: false,
            federationEnabled: true,
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
    expect(html).toContain("연합우주 계정");
  });

  it("연합우주 옵션이 비활성화된 계정에는 배지를 표시하지 않는다", async () => {
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
            bio: null,
            avatarUrl: "https://media.1day1ott.com/avatars/test.webp",
            followerCount: 0,
            followingCount: 0,
            canReact: false,
            federationEnabled: false,
            total: 0,
            cells: [],
            posters: [],
            notes: [],
          }}
        />
      </I18nextProvider>,
    );

    expect(html).not.toContain("연합우주 계정");
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
  it("공개 감상평에는 집계된 반응과 반응 추가 버튼만 먼저 표시한다", async () => {
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
              channelName: "테스트 채널",
              posterUrl: "https://example.com/dune.jpg",
              watchedOn: "2026-07-30",
              reaction: "love",
              note: "압도적인 영상미",
              reactions: [
                {
                  emoji: "👍",
                  imageUrl: null,
                  count: 1,
                  remoteCount: 0,
                  reactedByMe: true,
                },
                {
                  emoji: "❤️",
                  imageUrl: null,
                  count: 3,
                  remoteCount: 2,
                  reactedByMe: true,
                },
                {
                  emoji: ":party:",
                  imageUrl: "https://remote.example/party.png",
                  count: 1,
                  remoteCount: 1,
                  reactedByMe: false,
                },
              ],
            },
          ]}
          canReact
          pendingEntryId={null}
          onReact={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(html).toContain("감상평");
    expect(html).toContain("듄: 파트2");
    expect(html).toContain("테스트 채널");
    expect(html).toContain("2026-07-30");
    expect(html).toContain("👍👍");
    expect(html).toContain("압도적인 영상미");
    expect(html).toContain("https://example.com/dune.jpg");
    expect(html).toContain("❤️");
    expect(html).toContain(">3<");
    expect(html).toContain("연합우주 반응 2개");
    expect(html).toContain("https://remote.example/party.png");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="👍 반응하기"');
    expect(html).toContain('aria-label="❤️ 반응하기"');
    expect(html).toContain('aria-label="반응 추가"');
    expect(html).toContain('aria-expanded="false"');
  });
});
