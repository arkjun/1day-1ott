import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import robots from "../../public/robots.txt?raw";
import sitemap from "../../public/sitemap.xml?raw";

describe("SEO 정적 메타데이터", () => {
  it("홈 canonical, 검색 로봇, 영문 OG 정보를 선언한다", () => {
    expect(indexHtml).toContain(
      '<link rel="canonical" href="https://1day1ott.com/"',
    );
    expect(indexHtml).toContain(
      '<meta name="robots" content="index,follow,max-image-preview:large"',
    );
    expect(indexHtml).toContain(
      '<meta property="og:locale" content="en_US"',
    );
    expect(indexHtml).toContain(
      '<meta property="og:title" content="1DAY 1OTT | One a Day, Your Watch Journal"',
    );
    expect(indexHtml).toContain(
      'content="Log what you watch every day and watch your activity grow."',
    );
    expect(indexHtml).toContain(
      'content="https://1day1ott.com/og-image-en.png"',
    );
  });

  it("유효한 WebApplication JSON-LD를 제공한다", () => {
    const jsonLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
      indexHtml,
    )?.[1];
    expect(jsonLd).toBeTruthy();
    expect(JSON.parse(jsonLd ?? "{}")).toMatchObject({
      "@type": "WebApplication",
      url: "https://1day1ott.com/",
      applicationCategory: "EntertainmentApplication",
    });
  });

  it("robots.txt에서 sitemap을 알리고 API 경로를 제외한다", () => {
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Sitemap: https://1day1ott.com/sitemap.xml");
  });

  it("sitemap에 공개 정적 페이지 canonical URL만 포함한다", () => {
    expect(sitemap).toContain("<loc>https://1day1ott.com/</loc>");
    expect(sitemap).toContain("<loc>https://1day1ott.com/privacy</loc>");
    expect(sitemap).toContain("<loc>https://1day1ott.com/terms</loc>");
    expect(sitemap).not.toContain("/me");
  });
});
