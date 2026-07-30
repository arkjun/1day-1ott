import { escapeHtml } from "./html";

interface ProfileHtmlMetadata {
  name: string;
  username: string;
  bio: string | null;
  canonicalUrl: string;
  imageUrl: string;
  imageType: string;
  largeImage: boolean;
  imageWidth?: number;
  imageHeight?: number;
}

const DESCRIPTION_MAX_LENGTH = 200;

export function renderProfileHtml(
  shell: string,
  metadata: ProfileHtmlMetadata,
): string {
  const name = compactWhitespace(metadata.name);
  const title = `${name} (@${metadata.username}) | 1일 1OTT`;
  const description = metadata.bio
    ? truncate(compactWhitespace(metadata.bio), DESCRIPTION_MAX_LENGTH)
    : `@${metadata.username}님의 OTT 감상 기록을 1일 1OTT에서 확인하세요.`;
  const imageAlt = `${name} (@${metadata.username}) 프로필 이미지`;

  let html = replaceTitle(shell, title);
  html = replaceCanonical(html, metadata.canonicalUrl);
  html = replaceMeta(html, "name", "description", description);
  html = replaceMeta(html, "property", "og:type", "profile");
  html = replaceMeta(html, "property", "og:title", title);
  html = replaceMeta(html, "property", "og:description", description);
  html = replaceMeta(html, "property", "og:url", metadata.canonicalUrl);
  html = replaceMeta(html, "property", "og:image", metadata.imageUrl);
  html = replaceMeta(
    html,
    "property",
    "og:image:secure_url",
    metadata.imageUrl,
  );
  html = replaceMeta(html, "property", "og:image:type", metadata.imageType);
  html = metadata.imageWidth
    ? replaceMeta(
        html,
        "property",
        "og:image:width",
        String(metadata.imageWidth),
      )
    : removeMeta(html, "property", "og:image:width");
  html = metadata.imageHeight
    ? replaceMeta(
        html,
        "property",
        "og:image:height",
        String(metadata.imageHeight),
      )
    : removeMeta(html, "property", "og:image:height");
  html = replaceMeta(html, "property", "og:image:alt", imageAlt);
  html = replaceMeta(
    html,
    "property",
    "profile:username",
    metadata.username,
  );
  html = replaceMeta(
    html,
    "name",
    "twitter:card",
    metadata.largeImage ? "summary_large_image" : "summary",
  );
  html = replaceMeta(html, "name", "twitter:title", title);
  html = replaceMeta(html, "name", "twitter:description", description);
  html = replaceMeta(html, "name", "twitter:image", metadata.imageUrl);
  html = replaceMeta(html, "name", "twitter:image:alt", imageAlt);
  return html;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  const characters = [...value];
  if (characters.length <= maxLength) return value;
  return `${characters.slice(0, maxLength - 1).join("")}…`;
}

function replaceTitle(html: string, title: string): string {
  const tag = `<title>${escapeHtml(title)}</title>`;
  const pattern = /<title\b[^>]*>[\s\S]*?<\/title>/i;
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : insertBeforeHeadEnd(html, tag);
}

function replaceCanonical(html: string, canonicalUrl: string): string {
  const tag = `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`;
  const pattern = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : insertBeforeHeadEnd(html, tag);
}

function replaceMeta(
  html: string,
  attribute: "name" | "property",
  key: string,
  content: string,
): string {
  const tag = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}" />`;
  const pattern = metaPattern(attribute, key);
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : insertBeforeHeadEnd(html, tag);
}

function removeMeta(
  html: string,
  attribute: "name" | "property",
  key: string,
): string {
  return html.replace(metaPattern(attribute, key), "");
}

function metaPattern(
  attribute: "name" | "property",
  key: string,
): RegExp {
  return new RegExp(
    `<meta\\s+[^>]*${attribute}=["']${escapeRegExp(key)}["'][^>]*>`,
    "i",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insertBeforeHeadEnd(html: string, tag: string): string {
  return html.replace(/<\/head>/i, `${tag}\n</head>`);
}
