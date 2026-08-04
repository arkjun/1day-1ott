import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { resources } from "../i18n/locales";
import { FollowButtonView, FollowListView } from "./ProfileFollows";

async function render(node: React.ReactNode) {
  const i18n = createInstance();
  await i18n.init({
    lng: "ko",
    fallbackLng: "ko",
    resources,
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{node}</I18nextProvider>,
  );
}

describe("FollowButtonView", () => {
  it("로그아웃, 로딩, 팔로우, 팔로잉 상태를 구분한다", async () => {
    expect(
      await render(
        <FollowButtonView
          mode="loggedOut"
          following={false}
          changing={false}
          changeError={false}
          onToggle={vi.fn()}
        />,
      ),
    ).toContain("로그인 후 팔로우");

    const loading = await render(
      <FollowButtonView
        mode="loading"
        following={false}
        changing={false}
        changeError={false}
        onToggle={vi.fn()}
      />,
    );
    expect(loading).toContain("로딩");
    expect(loading).toContain("disabled");

    const follow = await render(
      <FollowButtonView
        mode="ready"
        following={false}
        changing={false}
        changeError={false}
        onToggle={vi.fn()}
      />,
    );
    expect(follow).toContain(">팔로우<");
    expect(follow).toContain('aria-pressed="false"');

    const following = await render(
      <FollowButtonView
        mode="ready"
        following
        changing={false}
        changeError={false}
        onToggle={vi.fn()}
      />,
    );
    expect(following).toContain(">팔로잉<");
    expect(following).toContain('title="팔로우 해제"');
    expect(following).toContain('aria-pressed="true"');
  });

  it("자기 프로필은 버튼이 없고 변경 실패는 접근 가능한 상태로 표시한다", async () => {
    expect(
      await render(
        <FollowButtonView
          mode="self"
          following={false}
          changing={false}
          changeError={false}
          onToggle={vi.fn()}
        />,
      ),
    ).toBe("");

    const failed = await render(
      <FollowButtonView
        mode="ready"
        following={false}
        changing={false}
        changeError
        onToggle={vi.fn()}
      />,
    );
    expect(failed).toContain('role="status"');
    expect(failed).toContain("변경하지 못했습니다");
  });
});

describe("FollowListView", () => {
  it("공개 사용자 목록과 비공개 사용자 생략 정책을 표시한다", async () => {
    const html = await render(
      <FollowListView
        direction="followers"
        users={[
          {
            kind: "local",
            username: "tester",
            name: "테스터",
            bio: "영화와 드라마",
            avatarUrl: "https://media.test/avatars/test.webp",
          },
        ]}
        state="ready"
        hasMore
        onClose={vi.fn()}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain("<dialog");
    expect(html).toContain("테스터");
    expect(html).toContain("@tester");
    expect(html).toContain("/@tester");
    expect(html).toContain("비공개 사용자는 목록에 표시되지 않습니다.");
    expect(html).toContain("더 보기");
    expect(html).toContain('aria-label="닫기"');
  });

  it("연합 팔로워를 외부 프로필 링크로 표시한다", async () => {
    const html = await render(
      <FollowListView
        direction="followers"
        users={[
          {
            kind: "federated",
            handle: "@alice@remote.example",
            actorUrl: "https://remote.example/users/alice",
          },
        ]}
        state="ready"
        hasMore={false}
        onClose={vi.fn()}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain("@alice@remote.example");
    expect(html).toContain("연합우주 계정");
    expect(html).toContain('href="https://remote.example/users/alice"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("빈 팔로잉 목록과 오류 상태를 구분한다", async () => {
    const empty = await render(
      <FollowListView
        direction="following"
        users={[]}
        state="ready"
        hasMore={false}
        onClose={vi.fn()}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(empty).toContain("아직 팔로우한 사용자가 없습니다.");

    const failed = await render(
      <FollowListView
        direction="following"
        users={[]}
        state="error"
        hasMore={false}
        onClose={vi.fn()}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(failed).toContain('role="status"');
    expect(failed).toContain("목록을 불러오지 못했습니다.");
    expect(failed).toContain("다시 시도");
  });
});
