import { usernameFromPublicProfilePath } from "./publicProfilePath";

const SITE_URL = "https://1day1ott.com";

type SupportedLanguage = "ko" | "en" | "ja";

interface PageMetadata {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
}

const homeMetadata: Record<
  SupportedLanguage,
  Pick<PageMetadata, "title" | "description">
> = {
  ko: {
    title: "1일 1OTT | 매일 하나씩, 나만의 감상 기록",
    description:
      "영화, 드라마, 예능, 애니, YouTube 등 매일 본 콘텐츠를 기록하고 잔디로 시각화하세요.",
  },
  en: {
    title: "1DAY 1OTT | Your daily watch journal",
    description:
      "Log movies, dramas, variety shows, anime, and YouTube videos, then visualize your watching habit.",
  },
  ja: {
    title: "1日 1OTT | 毎日の視聴記録",
    description:
      "映画、ドラマ、バラエティ、アニメ、YouTubeなど、毎日観たコンテンツを記録して可視化できます。",
  },
};

const pageNames: Record<
  SupportedLanguage,
  Record<"privacy" | "terms" | "profile" | "content" | "myPage", string>
> = {
  ko: {
    privacy: "개인정보 처리방침",
    terms: "이용약관",
    profile: "공개 프로필",
    content: "콘텐츠 기록",
    myPage: "마이페이지",
  },
  en: {
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    profile: "Public Profile",
    content: "Content Log",
    myPage: "My Page",
  },
  ja: {
    privacy: "プライバシーポリシー",
    terms: "利用規約",
    profile: "公開プロフィール",
    content: "コンテンツ記録",
    myPage: "マイページ",
  },
};

const localeMap: Record<SupportedLanguage, string> = {
  ko: "ko_KR",
  en: "en_US",
  ja: "ja_JP",
};

export function updatePageMetadata(
  pathname: string,
  language: string,
  overrides: Partial<PageMetadata> = {},
): void {
  const lang = normalizeLanguage(language);
  const metadata = { ...metadataForPath(pathname, lang), ...overrides };
  const canonicalUrl = new URL(metadata.canonicalPath, SITE_URL).href;

  document.documentElement.lang = lang;
  document.title = metadata.title;
  setMeta('meta[name="description"]', metadata.description);
  setMeta('meta[name="robots"]', metadata.robots);
  setMeta('meta[property="og:title"]', metadata.title);
  setMeta('meta[property="og:description"]', metadata.description);
  setMeta('meta[property="og:url"]', canonicalUrl);
  setMeta('meta[property="og:locale"]', localeMap[lang]);
  setMeta('meta[name="twitter:title"]', metadata.title);
  setMeta('meta[name="twitter:description"]', metadata.description);

  const canonical = document.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (canonical) canonical.href = canonicalUrl;
}

function metadataForPath(
  pathname: string,
  lang: SupportedLanguage,
): PageMetadata {
  const home = homeMetadata[lang];
  const names = pageNames[lang];
  const indexable = "index,follow,max-image-preview:large";
  let pageName: string | null = null;
  let robots = indexable;

  if (pathname === "/privacy") pageName = names.privacy;
  else if (pathname === "/terms") pageName = names.terms;
  else if (usernameFromPublicProfilePath(pathname)) pageName = names.profile;
  else if (pathname.startsWith("/c/")) pageName = names.content;
  else if (pathname === "/me") {
    pageName = names.myPage;
    robots = "noindex,nofollow";
  } else if (pathname !== "/") {
    robots = "noindex,nofollow";
  }

  return {
    title: pageName ? `${pageName} | ${serviceName(lang)}` : home.title,
    description: home.description,
    canonicalPath: pathname === "/" ? "/" : pathname,
    robots,
  };
}

function normalizeLanguage(language: string): SupportedLanguage {
  const base = language.split("-")[0]?.toLowerCase();
  return base === "en" || base === "ja" ? base : "ko";
}

function serviceName(lang: SupportedLanguage): string {
  if (lang === "en") return "1DAY 1OTT";
  if (lang === "ja") return "1日 1OTT";
  return "1일 1OTT";
}

function setMeta(selector: string, content: string): void {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute(
    "content",
    content,
  );
}
