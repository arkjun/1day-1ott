import type { ContentType, SearchResult } from "@1ott/shared";
import { Hono } from "hono";
import type { Env } from "../env";

type Vars = { userId: string };

export const searchRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

interface TmdbItem {
  id: number;
  title?: string; // movie
  name?: string; // tv
  poster_path?: string | null;
  release_date?: string; // movie
  first_air_date?: string; // tv
  media_type?: string;
}

function mapTmdb(item: TmdbItem, fallbackType: ContentType): SearchResult | null {
  const title = item.title ?? item.name;
  if (!title) return null;
  const date = item.release_date ?? item.first_air_date ?? "";
  const type: ContentType =
    fallbackType === "anime"
      ? "anime"
      : item.media_type === "tv" || item.name
        ? "tv"
        : "movie";
  return {
    type,
    title,
    tmdbId: item.id,
    posterUrl: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : undefined,
    year: date ? date.slice(0, 4) : undefined,
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
  const url = `https://api.themoviedb.org/3/search/${path}?query=${encodeURIComponent(q)}&language=ko-KR&include_adult=false&page=1`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${c.env.TMDB_API_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return c.json({ error: "tmdb_error", status: res.status }, 502);

  const data = (await res.json()) as { results?: TmdbItem[] };
  const results = (data.results ?? [])
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
