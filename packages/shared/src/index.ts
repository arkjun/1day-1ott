import { z } from "zod";

/** 콘텐츠 유형. TMDB(movie/tv/variety/anime) · YouTube · 기타 자유입력. */
export const contentTypes = ["tv", "movie", "variety", "documentary", "anime", "youtube", "other"] as const;
export const contentTypeSchema = z.enum(contentTypes);
export type ContentType = (typeof contentTypes)[number];

/** 넷플릭스식 반응. love=매우 좋아요(따봉2), up=좋아요, down=싫어요. */
export const reactions = ["down", "up", "love"] as const;
export const reactionSchema = z.enum(reactions);
export type Reaction = (typeof reactions)[number];

/** 다른 사용자의 공개 감상평에 남길 수 있는 이모티콘 반응. */
export const noteReactionEmojis = ["👍", "❤️", "😂", "😮", "😢"] as const;
export const noteReactionEmojiSchema = z.enum(noteReactionEmojis);
export type NoteReactionEmoji = (typeof noteReactionEmojis)[number];

/**
 * 기록 생성 입력. 웹앱과 (미래의) 북마클릿/확장이 공유하는 단일 계약.
 * - tmdbId / ytId 없이 title만으로도 생성 가능(자유입력 폴백).
 * - watchedOn 은 클라이언트 로컬 날짜 'YYYY-MM-DD'.
 */
export const entryInputSchema = z.object({
  contentId: z.string().min(1).optional(),
  type: contentTypeSchema,
  title: z.string().min(1).max(300),
  tmdbId: z.number().int().positive().optional(),
  ytId: z.string().min(1).max(64).optional(),
  posterUrl: z.string().url().max(1000).optional(),
  watchedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "watchedOn must be YYYY-MM-DD"),
  reaction: reactionSchema.optional(),
  note: z.string().max(1000).optional(),
  isNotePublic: z.boolean().default(true),
  platform: z.string().max(60).optional(),
}).refine(
  (input) => !(input.contentId && (input.tmdbId != null || input.ytId != null)),
  { message: "contentId cannot be combined with tmdbId or ytId" },
);
export type EntryInput = z.input<typeof entryInputSchema>;

export const PROFILE_NAME_MAX_LENGTH = 100;
export const PROFILE_BIO_MAX_LENGTH = 500;

/** 잔디 한 칸: 날짜 + 그날 소비량. level 은 색 농도 버킷(0~4). */
export interface HeatmapCell {
  date: string; // YYYY-MM-DD
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** 자동완성 검색 결과(TMDB / YouTube oEmbed 공통 형태). */
export interface SearchResult {
  type: ContentType;
  title: string;
  tmdbId?: number;
  ytId?: string;
  posterUrl?: string;
  year?: string;
  subtitle?: string;
  overview?: string; // 간단 설명
  rating?: number; // TMDB 평점(vote_average, 0~10)
  genreIds?: number[]; // 장르 id. 이름은 클라 i18n에서 매핑
}

/** 공개 감상평의 로컬·연합우주 통합 반응 집계. */
export interface NoteReactionSummary {
  emoji: string;
  imageUrl: string | null;
  count: number;
  remoteCount: number;
  reactedByMe: boolean;
}

/** 공개 프로필 응답. */
export interface PublicNote {
  id: string;
  contentId: string;
  title: string;
  posterUrl: string | null;
  watchedOn: string;
  reaction: Reaction | null;
  note: string;
  reactions: NoteReactionSummary[];
}

export interface PublicProfile {
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string;
  followerCount: number;
  followingCount: number;
  canReact: boolean;
  total: number;
  cells: HeatmapCell[];
  posters: { id: string; contentId: string; title: string; posterUrl: string | null }[];
  notes: PublicNote[];
}

export interface PublicUserSummary {
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string;
}

export interface FollowListResponse {
  users: PublicUserSummary[];
  nextCursor: string | null;
}

export interface FollowStatus {
  isSelf: boolean;
  following: boolean;
}

export interface FollowMutationResult {
  following: boolean;
  followerCount: number;
}

/** 작품 공개 페이지: 작품 정보 + 익명 집계. */
/** TMDB 상세에서 가져오는 부가 정보. 없을 수 있음(자유입력/유튜브 기록). */
export interface ContentFacts {
  overview?: string;
  tagline?: string;
  genres?: string[];
  year?: string;
  /** 영화: 분. TV 는 회당 방영시간. */
  runtime?: number;
  seasons?: number;
  episodes?: number;
  /** TV 방영 상태 원문(Returning Series / Ended 등). */
  status?: string;
  backdropUrl?: string;
  voteAverage?: number;
  voteCount?: number;
}

export interface ContentDetail {
  id: string;
  type: ContentType;
  title: string;
  posterUrl: string | null;
  viewerCount: number;
  reactions: { down: number; up: number; love: number };
  facts: ContentFacts;
}

/** 작품 페이지 하단 '내 기록' 한 줄. */
export interface MyContentEntry {
  id: string;
  watchedOn: string;
  reaction: Reaction | null;
  note: string | null;
  isNotePublic: boolean;
  platform: string | null;
}

export function countToLevel(count: number): HeatmapCell["level"] {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

export * from "./markdown";
