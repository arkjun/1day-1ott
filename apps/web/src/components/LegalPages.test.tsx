import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n/locales";
import { LegalPage } from "./LegalPage";
import { SiteFooter } from "./SiteFooter";
import privacyMd from "../../../../PRIVACY.md?raw";
import termsMd from "../../../../TERMS.md?raw";

async function render(ui: React.ReactNode, lng = "ko") {
  const i18n = createInstance();
  await i18n.init({
    lng,
    fallbackLng: "ko",
    resources,
    interpolation: { escapeValue: false },
  });

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>,
  );
}

// 줄바꿈·들여쓰기 차이를 무시하고 문장만 비교한다.
const squash = (text: string) => text.replace(/\s+/g, "");

describe("법적 고지", () => {
  it("개인정보 처리방침에 실제 처리 항목과 문의처를 표시한다", async () => {
    const html = await render(<LegalPage kind="privacy" />);

    expect(html).toContain("개인정보 처리방침");
    expect(html).toContain("IP 주소");
    expect(html).toContain("Passkey");
    expect(html).toContain("Cloudflare");
    expect(html).toContain("Google Analytics");
    expect(html).toContain("support@1day1ott.com");
  });

  it("이용약관에 서비스와 사용자 콘텐츠 조건을 표시한다", async () => {
    const html = await render(<LegalPage kind="terms" />);

    expect(html).toContain("이용약관");
    expect(html).toContain("사용자 콘텐츠");
    expect(html).toContain("만 14세");
  });

  it.each([
    ["en", "Privacy Policy", "Effective date: July 30, 2026", "Personal Information Protection Act"],
    ["ja", "プライバシーポリシー", "施行日：2026年7月30日", "個人情報保護法"],
  ])(
    "개인정보 처리방침을 %s로 표시한다",
    async (lng, title, effectiveDate, privacyAct) => {
      const html = await render(<LegalPage kind="privacy" />, lng);

      expect(html).toContain(title);
      expect(html).toContain(effectiveDate);
      expect(html).toContain(privacyAct);
      expect(html).toContain("Cloudflare");
      expect(html).toContain("support@1day1ott.com");
    },
  );

  it("영문 개인정보 처리방침에 공식 법률 용어를 사용한다", async () => {
    const html = await render(<LegalPage kind="privacy" />, "en");

    expect(html).toContain("data subjects");
    expect(html).toContain(
      "Entrusted Processing and Cross-Border Transfers",
    );
    expect(html).toContain("Entrusted processor");
    expect(html).toContain("Provision to Third Parties");
    expect(html).toContain("Destruction Procedures and Methods");
    expect(html).toContain("Safety Measures");
    expect(html).toContain("Personal Information Infringement Report Center");
    expect(html).toContain("Korean National Police Agency");
    expect(html).toContain("independent ActivityPub servers");
  });

  it("일문 개인정보 처리방침에 자연스러운 법률 용어를 사용한다", async () => {
    const html = await render(<LegalPage kind="privacy" />, "ja");

    expect(html).toContain("取扱いの委託および国外移転");
    expect(html).toContain("本人は");
    expect(html).toContain("廃棄の手続および方法");
    expect(html).toContain("安全管理措置");
    expect(html).toContain("個人情報侵害申告センター");
    expect(html).toContain("大韓民国警察庁");
    expect(html).toContain("独立したActivityPubサーバー");
  });

  // JSX 는 텍스트 중간의 줄바꿈을 공백으로 바꾼다. 일본어는 공백을 단어 구분에
  // 쓰지 않으므로 「バックアップ 状態」 같은 잉여 공백이 그대로 렌더링된다.
  it.each(["privacy", "terms"] as const)(
    "일문 %s 문서에 잉여 공백이 없다",
    async (kind) => {
      const html = await render(<LegalPage kind={kind} />, "ja");
      // 제목의 조번호 뒤 공백(第10条 本規約の変更)은 의도된 표기라 제외한다.
      const text = html
        .replace(/<h[12][^>]*>.*?<\/h[12]>/g, "")
        .replace(/<[^>]+>/g, "");

      expect(text.match(/[ぁ-んァ-ヶ一-龥、。][ ][ぁ-んァ-ヶ一-龥、。]/g)).toBe(
        null,
      );
    },
  );

  // PRIVACY.md / TERMS.md 가 원본이다. 웹 3개 언어가 원본과 같은 조항 구성을
  // 유지하는지 절 개수로 확인한다.
  it.each([
    ["privacy", 10],
    ["terms", 12],
  ] as const)("%s 문서가 3개 언어에서 %i개 절을 유지한다", async (kind, count) => {
    for (const lng of ["ko", "en", "ja"]) {
      const html = await render(<LegalPage kind={kind} />, lng);

      expect(html.match(/<h2>/g)).toHaveLength(count);
    }
  });

  // 저장소 원본과 웹 페이지가 같은 시행일로 다른 내용을 공개하면 안 된다.
  it.each([
    ["privacy", privacyMd],
    ["terms", termsMd],
  ] as const)("%s 웹 페이지가 저장소 원본의 모든 문장을 담는다", async (kind, md) => {
    const rendered = squash(
      (await render(<LegalPage kind={kind} />)).replace(/<[^>]+>/g, ""),
    );

    const sentences = md
      .replace(/^#.*$/gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`/g, "")
      .split(/\n|\|/)
      .map((line: string) => squash(line.replace(/^-/, "")))
      .filter((line: string) => line.length >= 20);

    expect(sentences.length).toBeGreaterThan(25);
    expect(sentences.filter((s) => !rendered.includes(s))).toEqual([]);
  });

  it("면책 범위가 언어별로 달라지지 않는다", async () => {
    const en = await render(<LegalPage kind="terms" />, "en");
    const ja = await render(<LegalPage kind="terms" />, "ja");

    // 원문은 천재지변만 열거한다. 포괄적 불가항력 면책으로 넓히지 않는다.
    expect(en).not.toContain("force majeure");
    expect(ja).not.toContain("不可抗力");
  });

  it.each([
    ["en", "Terms of Service", "User Content", "Republic of Korea"],
    ["ja", "利用規約", "ユーザーコンテンツ", "大韓民国"],
  ])(
    "이용약관을 %s로 표시한다",
    async (lng, title, userContent, governingLaw) => {
      const html = await render(<LegalPage kind="terms" />, lng);

      expect(html).toContain(title);
      expect(html).toContain(userContent);
      expect(html).toContain(governingLaw);
    },
  );

  it("법적 고지에서 언어를 선택할 수 있다", async () => {
    const html = await render(<LegalPage kind="privacy" />, "en");

    expect(html).toContain('aria-label="Language"');
    expect(html).toContain('<option value="ko">한국어</option>');
    expect(html).toContain('<option value="en" selected="">English</option>');
    expect(html).toContain('<option value="ja">日本語</option>');
  });

  it("footer에서 정책 페이지와 소스 코드로 이동할 수 있다", async () => {
    const html = await render(<SiteFooter />);

    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="https://github.com/arkjun/1day-1ott"');
  });
});
