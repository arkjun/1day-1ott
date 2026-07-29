# 1DAY 1OTT

[English](./README.md) · [한국어](./README_ko.md) · [日本語](./README_ja.md)

A web service for logging the movies, TV shows, variety shows, anime, YouTube videos, and other content you watch each day, then visualizing your activity as a GitHub-style contribution graph.

- Service: [https://1day1ott.com](https://1day1ott.com)
- Source code: [MIT License](./LICENSE)
- Policies: [Privacy Policy](https://1day1ott.com/privacy?lang=en) · [Terms of Service](https://1day1ott.com/terms?lang=en) (Korean originals: [PRIVACY.md](./PRIVACY.md) · [TERMS.md](./TERMS.md))

## Features

- Log the date, content type, reaction, short note, and platform
- Annual activity graph, streaks, and monthly and category statistics
- Search with TMDB and fetch metadata from YouTube URLs
- Shareable profiles with user-controlled public visibility
- Email/password and Passkey authentication
- Korean, English, and Japanese interfaces with light and dark themes
- Import and export records in Markdown format

## Architecture

This repository is a TypeScript monorepo managed with pnpm workspaces.

```text
apps/web         React 19 + Vite frontend
apps/api         Cloudflare Worker using Hono, Better Auth, and Drizzle
packages/shared  Zod schemas, shared types, and pure utilities
docs             Feature specifications and implementation plans
```

In production, a single Cloudflare Worker handles `/api/*` requests and serves the Vite build output. Data is stored in Cloudflare D1. During local development, Vite proxies `/api` requests to `wrangler dev`.

## Requirements

- Node.js 24
- pnpm 10.33.0

The pnpm version is pinned in the root `package.json` through the `packageManager` field.

## Local Development

Install dependencies and prepare the local environment file.

```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
openssl rand -base64 32
```

Copy the output of the last command into `BETTER_AUTH_SECRET` in `apps/api/.dev.vars`. Set `TMDB_API_TOKEN` as well to enable TMDB search. `.dev.vars` is ignored by Git and must never be committed.

Apply the committed migrations to the local D1 database.

```bash
pnpm db:migrate:local
```

Start the API and web app in separate terminals.

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

- Web: `http://localhost:5173`
- API: `http://localhost:8787`
- Health check: `http://localhost:8787/health`

## Verification

```bash
pnpm test
pnpm typecheck
pnpm --filter @1ott/web build
```

API tests run against real, isolated D1 storage inside `workerd`.

## Database Changes

Generate a new migration only after changing the Drizzle schema, then verify it locally.

```bash
pnpm db:generate
pnpm db:migrate:local
```

Commit the generated files under `apps/api/migrations` together with the source changes.

## Cloudflare Deployment

Sign in to Cloudflare with Wrangler and create the D1 database.

```bash
pnpm --filter @1ott/api exec wrangler login
pnpm --filter @1ott/api exec wrangler d1 create 1ott-db
```

Add the returned `database_id` to `apps/api/wrangler.jsonc`, then register the production secrets.

```bash
pnpm --filter @1ott/api exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter @1ott/api exec wrangler secret put TMDB_API_TOKEN
pnpm --filter @1ott/api db:migrate:remote
pnpm run deploy
```

To deploy through GitHub Actions, configure these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Update the custom domain, `BETTER_AUTH_URL`, `WEB_ORIGIN`, and D1 binding in `apps/api/wrangler.jsonc` for your environment. A push to `main` runs CI, applies remote D1 migrations, and deploys to production after CI succeeds.

## External Services

- Content search and details: [TMDB](https://www.themoviedb.org/)
- YouTube URL metadata: [YouTube oEmbed](https://oembed.com/)
- Runtime and database: [Cloudflare Workers](https://workers.cloudflare.com/) · [D1](https://developers.cloudflare.com/d1/)

This service uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.

## Contributing

Read [AGENTS.md](./AGENTS.md) before making changes, then run the tests and type checks. Bugs and feature requests are welcome through GitHub Issues. Report security vulnerabilities or privacy concerns privately to `support@1day1ott.com`.

All contributors must follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

This project is released under the [MIT License](./LICENSE).
