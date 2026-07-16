import type { ContentType, SearchResult } from "@1ott/shared";
import { Hono } from "hono";
import type { Env } from "../env";

type Vars = { userId: string };

export const searchRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

// 앱 언어 → TMDB language 코드. 미지원/미지정은 ko-KR.
const TMDB_LANG: Record<string, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP" };
export function tmdbLang(lang?: string): string {
  return TMDB_LANG[lang ?? ""] ?? "ko-KR";
}

interface TmdbItem {
  id: number;
  title?: string; // movie
  name?: string; // tv
  poster_path?: string | null;
  release_date?: string; // movie
  first_air_date?: string; // tv
  media_type?: string;
  genre_ids?: number[];
  overview?: string;
  vote_average?: number;
}

// TMDB TV 장르 id
const GENRE_ANIMATION = 16;
const GENRE_REALITY = 10764;
const GENRE_TALK = 10767;
const GENRE_DOCUMENTARY = 99;
const GENRE_NEWS = 10763;

/**
 * search/tv 는 장르 구분 없이 모든 TV 프로그램을 반환하므로 genre_ids 로 거른다.
 * anime(16)·variety(10764/10767)는 포함식(확실한 것만), tv 는 예능·토크·애니 제외식
 * (포함식은 장르 태그가 부실한 드라마를 놓칠 수 있음).
 */
export function matchesTypeGenre(
  genreIds: number[] | undefined,
  type: ContentType,
): boolean {
  if (type === "anime") return genreIds?.includes(GENRE_ANIMATION) ?? false;
  if (type === "variety") {
    return (genreIds ?? []).some((g) => g === GENRE_REALITY || g === GENRE_TALK);
  }
  if (type === "documentary") {
    return (genreIds ?? []).some((g) => g === GENRE_DOCUMENTARY || g === GENRE_NEWS);
  }
  if (type === "tv") {
    const excluded = [
      GENRE_ANIMATION,
      GENRE_REALITY,
      GENRE_TALK,
      GENRE_DOCUMENTARY,
      GENRE_NEWS,
    ];
    return !(genreIds ?? []).some((g) => excluded.includes(g));
  }
  return true;
}

export function mapTmdb(item: TmdbItem, fallbackType: ContentType): SearchResult | null {
  const title = item.title ?? item.name;
  if (!title) return null;
  const date = item.release_date ?? item.first_air_date ?? "";
  // anime/variety/documentary 는 tv 검색 결과라도 탭 의도를 유지한다.
  const type: ContentType =
    fallbackType === "anime" ||
    fallbackType === "variety" ||
    fallbackType === "documentary"
      ? fallbackType
      : item.media_type === "tv" || item.name
        ? "tv"
        : "movie";
  return {
    type,
    title,
    tmdbId: item.id,
    posterUrl: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : undefined,
    year: date ? date.slice(0, 4) : undefined,
    overview: item.overview || undefined,
    rating: item.vote_average || undefined, // 0(미평점)은 undefined
    genreIds: item.genre_ids?.length ? item.genre_ids : undefined,
  };
}

/** TMDB 검색 프록시. 키는 서버에만. type=movie|tv|anime 로 엔드포인트 선택. */
searchRoute.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  const type = (c.req.query("type") ?? "movie") as ContentType;
  if (!q) return c.json({ results: [] });
  if (!c.env.TMDB_API_TOKEN) {
    return c.json({ error: "tmdb_not_configured" }, 503);
  }

  // anime 는 TMDB 상 tv 로 검색(장르 필터는 후속). movie 외 나머지는 tv.
  const path = type === "movie" ? "movie" : "tv";
  const url = `https://api.themoviedb.org/3/search/${path}?query=${encodeURIComponent(q)}&language=${tmdbLang(c.req.query("lang"))}&include_adult=false&page=1`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${c.env.TMDB_API_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return c.json({ error: "tmdb_error", status: res.status }, 502);

  const data = (await res.json()) as { results?: TmdbItem[] };
  const results = (data.results ?? [])
    // slice 전에 걸러야 필터된 항목이 8칸을 잡아먹지 않는다.
    .filter((it) => matchesTypeGenre(it.genre_ids, type))
    .slice(0, 8)
    .map((it) => mapTmdb(it, type))
    .filter((r): r is SearchResult => r !== null);

  return c.json({ results });
});

/** YouTube oEmbed — 키 불필요. URL → 제목/썸네일 자동. */
searchRoute.get("/yt", async (c) => {
  const raw = c.req.query("url")?.trim();
  if (!raw) return c.json({ error: "missing_url" }, 400);

  const ytId = parseYouTubeId(raw);
  if (!ytId) return c.json({ error: "invalid_youtube_url" }, 400);

  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${ytId}`,
  )}&format=json`;
  const res = await fetch(oembed);
  if (!res.ok) return c.json({ error: "oembed_error", status: res.status }, 502);

  const data = (await res.json()) as {
    title?: string;
    thumbnail_url?: string;
    author_name?: string;
  };
  const result: SearchResult = {
    type: "youtube",
    title: data.title ?? "YouTube",
    ytId,
    posterUrl: data.thumbnail_url,
    subtitle: data.author_name,
  };
  return c.json({ result });
});

function parseYouTubeId(input: string): string | null {
  // youtu.be/ID, watch?v=ID, /shorts/ID, /embed/ID, 혹은 순수 ID
  try {
    const u = new URL(input);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/);
    if (m) return m[2] ?? null;
    return null;
  } catch {
    return /^[\w-]{11}$/.test(input) ? input : null;
  }
}
