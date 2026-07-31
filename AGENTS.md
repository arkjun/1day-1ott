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
- `pnpm db:generate` / `pnpm db:migrate:local`: generate Drizzle migrations and apply them to local D1.
- When generating a Drizzle migration, always provide a descriptive name with `--name` (for example, `pnpm --filter @1ott/api exec drizzle-kit generate --name=add_user_lang`); do not keep the default randomly generated name.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, double quotes, semicolons, and trailing commas in multiline constructs. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and descriptive lowercase filenames for utilities. Route modules use domain names such as `entries.ts`. Preserve strict typing; account for `noUncheckedIndexedAccess` instead of using unchecked assertions. No formatter or linter is configured, so match nearby code and keep imports organized.

## Testing Guidelines

Vitest is used throughout. Name tests `*.test.ts` and colocate pure-unit tests beside source; place Worker integration tests in `apps/api/test`. Add regression coverage for bug fixes and cover validation failures as well as successful paths. Before submitting, run `pnpm test && pnpm typecheck`.

## Commit & Pull Request Guidelines

Use Conventional Commit-style prefixes (`feat:`, `fix:`, `refactor:`, `perf:`, `docs:`, `style:`) followed by concise, imperative English summaries. Commit messages must be written in English. Keep each commit focused. Pull requests should explain the problem and solution, identify affected packages, link relevant issues or design documents, and report test results. Include screenshots for visible UI changes and call out migrations, configuration changes, or deployment steps explicitly.

## Security & Configuration

Never commit secrets or local Cloudflare state. Store `BETTER_AUTH_SECRET` with Wrangler, and review `apps/api/wrangler.jsonc` carefully before changing bindings or deployment settings.
