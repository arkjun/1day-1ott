export interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  WEB_ORIGIN: string;
  // GitHub 소셜(M0에선 미사용, 배선만): 값은 나중에 .dev.vars / secret 으로.
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  // TMDB v4 read access token(Bearer). 없으면 /api/search 는 503.
  TMDB_API_TOKEN?: string;
}
