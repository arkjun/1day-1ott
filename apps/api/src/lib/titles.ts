import { eq } from "drizzle-orm";
import type { createDb } from "../db";
import { schema } from "../db";
import type { Env } from "../env";
import { tmdbLang } from "../routes/search";

// content.meta 는 { titles: { ko, en, ja } } 형태의 언어별 제목 캐시.
export const LANGS = new Set(["ko", "en", "ja"]);

type Db = ReturnType<typeof createDb>;

/** 쿼리스트링 lang 을 지원 언어로만 통과. 아니면 undefined(원문 유지). */
export function pickLang(raw?: string): string | undefined {
  return raw && LANGS.has(raw) ? raw : undefined;
}

export function parseTitles(meta: string | null): Record<string, string> {
  if (!meta) return {};
  try {
    const m = JSON.parse(meta) as { titles?: Record<string, string> };
    return m?.titles ?? {};
  } catch {
    return {};
  }
}

export function withTitles(meta: string | null, titles: Record<string, string>): string {
  let base: Record<string, unknown> = {};
  if (meta) {
    try {
      base = (JSON.parse(meta) as Record<string, unknown>) ?? {};
    } catch {
      /* 손상된 meta 는 무시하고 새로 쓴다 */
    }
  }
  return JSON.stringify({ ...base, titles });
}

interface TmdbDetail {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
}

/**
 * TMDB 상세 응답에서 요청 언어의 실제 번역만 뽑는다.
 * 요청 언어 번역이 없으면 TMDB 는 name/title 에 원어 제목을 그대로 준다.
 * 그 원어 폴백(예: 베트남어)을 한국어 제목인 척 캐시하지 않도록 걸러 null 을 반환한다.
 * 단, 요청 언어가 원어와 같으면 원어 제목이 곧 정답이므로 통과시킨다.
 */
export function pickTmdbTitle(d: TmdbDetail, lang: string): string | null {
  const localized = d.title ?? d.name;
  if (!localized) return null;
  const original = d.original_title ?? d.original_name;
  if (d.original_language !== lang && original && localized === original) {
    return null;
  }
  return localized;
}

/** tmdbId 로 해당 언어 제목을 조회. 토큰 없거나 실패/번역없음이면 null(원문 폴백). */
async function fetchTmdbTitle(
  env: Env,
  type: string,
  tmdbId: number,
  lang: string,
): Promise<string | null> {
  if (!env.TMDB_API_TOKEN) return null;
  const path = type === "movie" ? "movie" : "tv";
  const url = `https://api.themoviedb.org/3/${path}/${tmdbId}?language=${tmdbLang(lang)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.TMDB_API_TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return pickTmdbTitle((await res.json()) as TmdbDetail, lang);
}

interface TitleRow {
  contentId: string;
  type: string;
  title: string;
  tmdbId: number | null;
  meta: string | null;
}

/**
 * 콘텐츠별 현재 언어 제목을 해석해 { contentId → title } 반환.
 * 캐시(content.meta.titles) 히트면 그대로, 미스면 TMDB 1회 조회 후 캐시.
 * lang 미지정이면 빈 맵(호출부가 원문 사용).
 */
export async function resolveTitles(
  db: Db,
  env: Env,
  rows: TitleRow[],
  lang: string | undefined,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!lang) return out;

  const uniq = new Map<string, TitleRow>();
  for (const r of rows) if (!uniq.has(r.contentId)) uniq.set(r.contentId, r);

  await Promise.all(
    [...uniq.values()].map(async (r) => {
      let show = r.title;
      if (r.tmdbId != null) {
        const titles = parseTitles(r.meta);
        if (titles[lang]) {
          show = titles[lang];
        } else {
          const fetched = await fetchTmdbTitle(env, r.type, r.tmdbId, lang);
          if (fetched) {
            titles[lang] = fetched;
            await db
              .update(schema.content)
              .set({ meta: withTitles(r.meta, titles) })
              .where(eq(schema.content.id, r.contentId));
            show = fetched;
          }
        }
      }
      out.set(r.contentId, show);
    }),
  );
  return out;
}
