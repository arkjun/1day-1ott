# 1일 1OTT

하루 한 번 이상 소비한 콘텐츠를 기록해 잔디 그래프로 보여주는 웹 서비스.

- 스택: React(Vite) + Hono 모노레포 / Cloudflare Workers·Pages / D1 + Drizzle / Better Auth

## 구조

```
apps/api      Hono Worker + Drizzle + Better Auth (D1)
apps/web      React + Vite
packages/shared  zod 스키마 + 공유 타입
```

## 로컬 개발 (원격 Cloudflare 계정 없이 miniflare로)

```bash
pnpm install

# 1) 마이그레이션 생성 + 로컬 D1 에 적용
pnpm db:generate
pnpm db:migrate:local

# 2) API 워커 (:8787)
pnpm dev:api

# 3) 다른 터미널에서 웹 (:5173, /api 는 워커로 프록시)
pnpm dev:web
```

## 원격 배포 (당신의 Cloudflare 계정 필요 — 대화형 로그인)

```bash
# ! wrangler login          (Claude가 대신 못 함 — 직접)
cd apps/api
npx wrangler d1 create 1ott-db      # 출력된 database_id 를 wrangler.jsonc 에 반영
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler deploy
```
