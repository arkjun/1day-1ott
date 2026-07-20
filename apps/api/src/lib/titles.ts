import { eq } from "drizzle-orm";
import type { createDb } from "../db";
import { schema } from "../db";
import type { Env } from "../env";
import { TMDB_IMG, tmdbLang } from "../routes/search";

// content.meta 는 { titles: {ko,en,ja}, posters: {ko,en,ja} } 형태의 언어별 캐시.
// posters 값은 TMDB poster_path, ""(빈 문자열)은 "해당 언어 포스터 없음"을 캐시해
// 매 요청마다 재조회하지 않기 위한 표식.
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

export function parsePosters(meta: string | null): Record<string, string> {
  if (!meta) return {};
  try {
    const m = JSON.parse(meta) as { posters?: Record<string, string> };
    return m?.posters ?? {};
  } catch {
    return {};
  }
}

export function withCache(
  meta: string | null,
  patch: { titles?: Record<string, string>; posters?: Record<string, string> },
): string {
  let base: Record<string, unknown> = {};
  if (meta) {
    try {
      base = (JSON.parse(meta) as Record<string, unknown>) ?? {};
    } catch {
      /* 손상된 meta 는 무시하고 새로 쓴다 */
    }
  }
  return JSON.stringify({ ...base, ...patch });
}

export function withTitles(meta: string | null, titles: Record<string, string>): string {
  return withCache(meta, { titles });
}

interface TmdbDetail {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  poster_path?: string | null;
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

/** tmdbId 로 해당 언어 상세를 조회. 토큰 없거나 실패면 null(원문 폴백). */
async function fetchTmdbDetail(
  env: Env,
  type: string,
  tmdbId: number,
  lang: string,
): Promise<TmdbDetail | null> {
  if (!env.TMDB_API_TOKEN) return null;
  const path = type === "movie" ? "movie" : "tv";
  const url = `https://api.themoviedb.org/3/${path}/${tmdbId}?language=${tmdbLang(lang)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.TMDB_API_TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as TmdbDetail;
}

interface TitleRow {
  contentId: string;
  type: string;
  title: string;
  tmdbId: number | null;
  meta: string | null;
}

export interface Localized {
  title: string;
  /** 해당 언어 포스터가 있을 때만. 없으면 호출부가 저장된 posterUrl 사용. */
  posterUrl?: string;
}

/**
 * 콘텐츠별 현재 언어의 제목·포스터를 해석해 { contentId → Localized } 반환.
 * 캐시(content.meta) 히트면 그대로, 미스면 TMDB 상세 1회 조회 후 캐시.
 * lang 미지정이면 빈 맵(호출부가 원문 사용).
 */
export async function resolveLocalized(
  db: Db,
  env: Env,
  rows: TitleRow[],
  lang: string | undefined,
): Promise<Map<string, Localized>> {
  const out = new Map<string, Localized>();
  if (!lang) return out;

  const uniq = new Map<string, TitleRow>();
  for (const r of rows) if (!uniq.has(r.contentId)) uniq.set(r.contentId, r);

  await Promise.all(
    [...uniq.values()].map(async (r) => {
      const titles = parseTitles(r.meta);
      const posters = parsePosters(r.meta);
      // 제목만 캐시된 기존 레코드는 포스터 캐시가 없으므로 한 번 더 조회한다.
      if (r.tmdbId != null && (!titles[lang] || posters[lang] === undefined)) {
        const d = await fetchTmdbDetail(env, r.type, r.tmdbId, lang);
        if (d) {
          const t = pickTmdbTitle(d, lang);
          if (t) titles[lang] = t;
          posters[lang] = d.poster_path ?? "";
          await db
            .update(schema.content)
            .set({ meta: withCache(r.meta, { titles, posters }) })
            .where(eq(schema.content.id, r.contentId));
        }
      }
      out.set(r.contentId, {
        title: titles[lang] ?? r.title,
        posterUrl: posters[lang] ? `${TMDB_IMG}${posters[lang]}` : undefined,
      });
    }),
  );
  return out;
}
