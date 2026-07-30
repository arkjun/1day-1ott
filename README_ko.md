# 1일 1OTT

[English](./README.md) · [한국어](./README_ko.md) · [日本語](./README_ja.md)

영화, 드라마, 예능, 애니메이션, YouTube 등 매일 본 콘텐츠를 기록하고 GitHub 잔디처럼 시각화하는 웹 서비스입니다.

- 서비스: [https://1day1ott.com](https://1day1ott.com)
- 소스 코드: [MIT License](./LICENSE)
- 정책: [개인정보 처리방침](https://1day1ott.com/privacy?lang=ko) · [이용약관](https://1day1ott.com/terms?lang=ko) (저장소 원본: [PRIVACY.md](./PRIVACY.md) · [TERMS.md](./TERMS.md))

## 주요 기능

- 날짜·콘텐츠 유형·반응·한 줄 감상·플랫폼 기록
- 연간 잔디, 연속 기록, 월별·유형별 통계
- TMDB 검색 및 YouTube URL 정보 가져오기
- 공개 여부를 사용자가 선택하는 공유 프로필
- 이메일/비밀번호 및 Passkey 로그인
- 한국어·영어·일본어와 라이트·다크 테마
- Markdown 형식의 기록 가져오기·내보내기

## 기술 구성

이 저장소는 pnpm workspace 기반 TypeScript 모노레포입니다.

```text
apps/web         React 19 + Vite 프런트엔드
apps/api         Hono + Better Auth + Drizzle 기반 Cloudflare Worker
packages/shared  Zod 스키마, 공유 타입과 순수 유틸리티
docs             기능 설계 문서와 구현 계획
```

프로덕션에서는 Cloudflare Worker 하나가 `/api/*` 요청을 처리하고 Vite 빌드 결과물도 함께 제공합니다. 데이터는 Cloudflare D1에 저장합니다. 로컬에서는 Vite가 `/api` 요청을 `wrangler dev`로 프록시합니다.

## 요구 사항

- Node.js 24
- pnpm 10.33.0

pnpm 버전은 루트 `package.json`의 `packageManager` 필드에 고정되어 있습니다.

## 로컬 개발

의존성을 설치하고 로컬 환경 파일을 준비합니다.

```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
openssl rand -base64 32
```

마지막 명령의 출력값을 `apps/api/.dev.vars`의 `BETTER_AUTH_SECRET`에 넣습니다. TMDB 검색을 사용하려면 `TMDB_API_TOKEN`도 설정합니다. `.dev.vars`는 Git에서 제외되며 커밋하면 안 됩니다.

커밋된 마이그레이션을 로컬 D1에 적용합니다.

```bash
pnpm db:migrate:local
```

두 터미널에서 API와 웹을 실행합니다.

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

- 웹: `http://localhost:5173`
- API: `http://localhost:8787`
- 상태 확인: `http://localhost:8787/health`

## 검증

```bash
pnpm test
pnpm typecheck
pnpm --filter @1ott/web build
```

API 테스트는 `workerd`와 격리된 실제 D1 스토리지에서 실행됩니다.

## 데이터베이스 변경

Drizzle 스키마를 변경한 경우에만 새 마이그레이션을 생성한 뒤 로컬에서 검증합니다.

```bash
pnpm db:generate
pnpm db:migrate:local
```

생성된 `apps/api/migrations` 파일은 소스 코드와 함께 커밋합니다.

## Cloudflare 배포

Cloudflare 계정으로 Wrangler에 로그인하고 D1 데이터베이스를 생성합니다.

```bash
pnpm --filter @1ott/api exec wrangler login
pnpm --filter @1ott/api exec wrangler d1 create 1ott-db
```

출력된 `database_id`를 `apps/api/wrangler.jsonc`에 반영하고 프로덕션 secret을 등록합니다.

```bash
pnpm --filter @1ott/api exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter @1ott/api exec wrangler secret put TMDB_API_TOKEN
pnpm --filter @1ott/api db:migrate:remote
pnpm run deploy
```

GitHub Actions 배포를 사용하려면 저장소 secret에 다음 값을 설정합니다.

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

커스텀 도메인, `BETTER_AUTH_URL`, `WEB_ORIGIN`, D1 binding은 `apps/api/wrangler.jsonc`에서 배포 환경에 맞게 변경해야 합니다. `main` push는 CI 성공 후 D1 마이그레이션과 프로덕션 배포까지 수행합니다.

## 외부 서비스

- 콘텐츠 검색·상세 정보: [TMDB](https://www.themoviedb.org/)
- YouTube URL 정보: [YouTube oEmbed](https://oembed.com/)
- 실행 환경·데이터베이스·미디어: [Cloudflare Workers](https://workers.cloudflare.com/) · [D1](https://developers.cloudflare.com/d1/) · [R2](https://developers.cloudflare.com/r2/)

이 서비스는 TMDB와 TMDB API를 사용하지만 TMDB의 보증, 인증 또는 승인을 받은 서비스가 아닙니다.

## 기여

작업 전 [AGENTS.md](./AGENTS.md)의 저장소 규칙을 확인하고, 변경 후 테스트와 타입 검사를 실행해 주세요. 버그와 제안은 GitHub Issues로 등록할 수 있습니다. 보안 취약점이나 개인정보 관련 내용은 공개 Issue 대신 `support@1day1ott.com`으로 알려 주세요.

모든 참여자는 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)를 따라야 합니다.

## 라이선스

이 프로젝트는 [MIT License](./LICENSE)로 배포됩니다.
