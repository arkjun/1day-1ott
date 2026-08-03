# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm workspace containing three TypeScript packages:

- `apps/web`: React 19 and Vite frontend. UI components live in `src/components`, reusable browser logic in `src/lib`, translations in `src/i18n`, and static assets in `public`.
- `apps/api`: Hono application deployed as a Cloudflare Worker. Routes are in `src/routes`, database code in `src/db`, Drizzle migrations in `migrations`, and Worker tests in `test`.
- `packages/shared`: Zod schemas, shared types, and cross-application utilities.

Design notes and implementation plans belong under `docs/`. Keep package-specific code within its package; expose shared contracts through `@1ott/shared`.

## Build, Test, and Development Commands

Use pnpm 10 (the pinned version is recorded in `package.json`).

- `pnpm install`: install all workspace dependencies.
- `pnpm dev:api`: start the local Worker at `http://localhost:8787`.
- `pnpm dev:web`: start Vite at `http://localhost:5173`; `/api` requests proxy to the Worker.
- `pnpm test`: run every package's Vitest suite once.
- `pnpm typecheck`: run strict TypeScript checks across the workspace.
- `pnpm --filter @1ott/web build`: create the production frontend bundle.
- `pnpm run deploy`: deploy the application. The `run` keyword is required because `deploy` conflicts with pnpm's built-in command.
- `pnpm --filter @1ott/api test titles`: run the API test file matching `titles`.
- `pnpm --filter @1ott/api test -- -t "잔디"`: run API tests whose names match `잔디`.
- `pnpm db:generate` / `pnpm db:migrate:local`: generate Drizzle migrations and apply them to local D1.
- When generating a Drizzle migration, always provide a descriptive name with `--name` (for example, `pnpm --filter @1ott/api exec drizzle-kit generate --name=add_user_lang`); do not keep the default randomly generated name.

Local development requires `apps/api/.dev.vars`; copy it from `.dev.vars.example`. Without `TMDB_API_TOKEN`, `/api/search` returns 503 and only free-form entries are available. Check this variable first when search is unavailable.

Pushing to `main` triggers CI to run typechecking, tests, the web build, remote D1 migrations, and the production deployment.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, double quotes, semicolons, and trailing commas in multiline constructs. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and descriptive lowercase filenames for utilities. Route modules use domain names such as `entries.ts`. Preserve strict typing; account for `noUncheckedIndexedAccess` instead of using unchecked assertions. No formatter or linter is configured, so match nearby code and keep imports organized.

Write code comments in Korean, following the density and tone of the surrounding file.

## Architecture Constraints

### Worker and Routing

A single Worker serves both the API and the web application. The `assets` configuration in `apps/api/wrangler.jsonc` attaches `../web/dist` as static assets, while `run_worker_first: ["/api/*", "/health"]` routes only API and health requests through the Worker first. Production is same-origin, and the Vite development proxy reproduces that topology locally. Add new API endpoints below `/api/` or update `run_worker_first`.

The authentication boundary depends on route registration order in `apps/api/src/index.ts`. Hono composes handlers in registration order, so `publicRoute` must be registered before the authentication gate. The gate also exempts the `/api/auth/` and `/api/u/` prefixes. Add unauthenticated endpoints to `publicRoute` and verify their registration position; route order is part of the security boundary. After authentication, the gate stores the user ID with `c.set("userId", ...)`; each handler remains responsible for resource ownership checks.

Do not introduce a client-side router. `App.tsx` intentionally branches on `window.location.pathname` for `/u/:username`, `/c/:contentId`, `/me`, and the dashboard fallback.

### Authentication and Database Mapping

Create a new Better Auth instance for every request with `createAuth(env)`. This avoids D1 write-lock contention in the Cloudflare environment; do not move the instance to module scope.

The `username`, `isPublic`, and `lang` fields on the `user` table are declared as Better Auth `additionalFields`. Update `apps/api/src/auth.ts` and `apps/api/src/db/schema.ts` together. The adapter maps JavaScript property keys, so preserve the snake_case database column and camelCase property-key convention.

### Localization and Content Metadata

Use `resolveLocalized()` in `apps/api/src/lib/titles.ts` as the only path for localized titles and posters. The `content.meta` JSON cache stores `{titles, posters, facts, fetchedAt}` by language and refreshes TMDB details only after its seven-day TTL expires. Clients must include `?lang=` on related requests through `apps/web/src/lib/api.ts`, and `pickLang()` must restrict values to `ko`, `en`, or `ja`. Without `lang`, use the stored original value. An empty string in the posters cache means that no poster exists for that language; it does not mean the value has not been fetched.

All UI strings must use i18n. Add keys to all three files under `apps/web/src/i18n/locales/{ko,en,ja}.ts` and access them through `t("...")`. `i18n.test.ts` fails when locale keys differ. The default language is Korean.

### Shared Package and Styling

`@1ott/shared` imports TypeScript source directly without a build step because its `main` points to `./src/index.ts`. Put shared contracts such as Zod input schemas, `ContentType`, `Reaction`, and Markdown import/export parsers there. Keep the package runtime-neutral: do not depend on Worker APIs or the DOM.

Use the existing CSS-variable and inline-style approach. `apps/web/src/index.css` defines tokens such as `--surface`, `--border`, and `--accent`, plus dark mode through `prefers-color-scheme` and the `data-theme` override. Components keep style objects in `const st: Record<string, React.CSSProperties>` near the end of each file. Do not add a CSS framework.

## Testing Guidelines

Vitest is used throughout. Name tests `*.test.ts` and colocate pure-unit tests beside source; place Worker integration tests in `apps/api/test`. Add regression coverage for bug fixes and cover validation failures as well as successful paths. Before submitting, run `pnpm test && pnpm typecheck`.

API tests do not use mocked infrastructure. `@cloudflare/vitest-pool-workers` runs the full HTTP path against workerd and an isolated real D1 database for each test, including Better Auth signup and sessions and Drizzle queries. `apps/api/test/apply-migrations.ts` applies migrations during setup, so each test must create its own data.

`apps/api/vitest.config.ts` intentionally does not load `wrangler.jsonc`, avoiding the web distribution dependency and production variables. Add any new environment variable to the test-specific bindings there as well.

For schema changes, update `apps/api/src/db/schema.ts`, generate a descriptively named migration, commit the generated SQL, and run `pnpm db:migrate:local`. Drizzle Kit generates migrations; `wrangler d1 migrations apply` applies them.

## Commit & Pull Request Guidelines

Use Conventional Commit-style prefixes (`feat:`, `fix:`, `refactor:`, `perf:`, `docs:`, `style:`) followed by concise, imperative English summaries. Commit messages must be written in English. Keep each commit focused. Pull requests should explain the problem and solution, identify affected packages, link relevant issues or design documents, and report test results. Include screenshots for visible UI changes and call out migrations, configuration changes, or deployment steps explicitly.

## Security & Configuration

Never commit secrets or local Cloudflare state. Store `BETTER_AUTH_SECRET` with Wrangler, and review `apps/api/wrangler.jsonc` carefully before changing bindings or deployment settings.

## Documentation Workflow

Feature work is documented first in `docs/specs/YYYY-MM-DD-*.md` as the accepted design, then in `docs/plans/` or `docs/superpowers/plans/` as a checkbox implementation plan. Before starting a substantial feature, check for an existing related specification.
