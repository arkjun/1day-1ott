import type { ContentFacts } from "@1ott/shared";
import { eq } from "drizzle-orm";
import type { createDb } from "../db";
import { schema } from "../db";
import type { Env } from "../env";
import { TMDB_BACKDROP, TMDB_IMG, tmdbLang } from "../routes/search";

// content.meta 는 언어별 TMDB 캐시:
//   { titles: {ko,..}, posters: {ko,..}, facts: {ko,..}, fetchedAt: {ko,..} }
// posters 값은 poster_path, ""(빈 문자열)은 "해당 언어 포스터 없음"을 캐시해
// 매 요청마다 재조회하지 않기 위한 표식.
export const LANGS = new Set(["ko", "en", "ja"]);

// TMDB API 이용약관 1.C: TMDB 에서 얻은 정보는 6개월 넘게 캐시 금지.
// 상한보다 넉넉히 짧게 잡아 만료되면 상세를 다시 조회한다.
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Db = ReturnType<typeof createDb>;

interface MetaCache {
  titles: Record<string, string>;
  posters: Record<string, string>;
  facts: Record<string, ContentFacts>;
  fetchedAt: Record<string, number>;
}

/**
 * 쿼리스트링 lang 을 지원 언어로만 통과. 아니면 undefined(원문 유지).
 * 브라우저 로케일은 en-US/ja-JP 처럼 지역까지 붙어 오므로 앞 서브태그만 본다.
 */
export function pickLang(raw?: string): string | undefined {
  const base = raw?.split("-")[0]?.toLowerCase();
  return base && LANGS.has(base) ? base : undefined;
}

export function parseMeta(meta: string | null): MetaCache {
  const empty: MetaCache = { titles: {}, posters: {}, facts: {}, fetchedAt: {} };
  if (!meta) return empty;
  try {
    const m = JSON.parse(meta) as Partial<MetaCache>;
    return {
      titles: m?.titles ?? {},
      posters: m?.posters ?? {},
      facts: m?.facts ?? {},
      fetchedAt: m?.fetchedAt ?? {},
    };
  } catch {
    return empty;
  }
}

export function parseTitles(meta: string | null): Record<string, string> {
  return parseMeta(meta).titles;
}

export function withCache(meta: string | null, patch: Partial<MetaCache>): string {
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

/** TTL 안쪽에 조회된 캐시인가. fetchedAt 없는 옛 레코드는 만료로 본다. */
export function isFresh(cache: MetaCache, lang: string, now: number): boolean {
  const at = cache.fetchedAt[lang];
  return at != null && now - at < CACHE_TTL_MS;
}

interface TmdbDetail {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  tagline?: string;
  genres?: { id: number; name: string }[];
  release_date?: string;
  first_air_date?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  vote_average?: number;
  vote_count?: number;
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

/** 상세 응답 → 화면에 쓰는 부가 정보. 빈 값은 넣지 않는다. */
export function buildFacts(d: TmdbDetail): ContentFacts {
  const date = d.release_date ?? d.first_air_date ?? "";
  const runtime = d.runtime ?? d.episode_run_time?.[0];
  const facts: ContentFacts = {};
  if (d.overview) facts.overview = d.overview;
  if (d.tagline) facts.tagline = d.tagline;
  if (d.genres?.length) facts.genres = d.genres.map((g) => g.name);
  if (date) facts.year = date.slice(0, 4);
  if (runtime) facts.runtime = runtime;
  if (d.number_of_seasons) facts.seasons = d.number_of_seasons;
  if (d.number_of_episodes) facts.episodes = d.number_of_episodes;
  if (d.status) facts.status = d.status;
  if (d.backdrop_path) facts.backdropUrl = `${TMDB_BACKDROP}${d.backdrop_path}`;
  if (d.vote_average) facts.voteAverage = d.vote_average;
  if (d.vote_count) facts.voteCount = d.vote_count;
  return facts;
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
  facts: ContentFacts;
}

/**
 * 콘텐츠별 현재 언어의 제목·포스터·부가정보를 해석해 { contentId → Localized } 반환.
 * 캐시(content.meta)가 TTL 안이면 그대로, 만료/미스면 TMDB 상세 1회 조회 후 캐시.
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
  const now = Date.now();

  const uniq = new Map<string, TitleRow>();
  for (const r of rows) if (!uniq.has(r.contentId)) uniq.set(r.contentId, r);

  await Promise.all(
    [...uniq.values()].map(async (r) => {
      const cache = parseMeta(r.meta);
      if (r.tmdbId != null && !isFresh(cache, lang, now)) {
        const d = await fetchTmdbDetail(env, r.type, r.tmdbId, lang);
        if (d) {
          const t = pickTmdbTitle(d, lang);
          if (t) cache.titles[lang] = t;
          cache.posters[lang] = d.poster_path ?? "";
          cache.facts[lang] = buildFacts(d);
          cache.fetchedAt[lang] = now;
          await db
            .update(schema.content)
            .set({ meta: withCache(r.meta, cache) })
            .where(eq(schema.content.id, r.contentId));
        }
      }
      out.set(r.contentId, {
        title: cache.titles[lang] ?? r.title,
        posterUrl: cache.posters[lang] ? `${TMDB_IMG}${cache.posters[lang]}` : undefined,
        facts: cache.facts[lang] ?? {},
      });
    }),
  );
  return out;
}
