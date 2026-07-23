# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**먼저 [AGENTS.md](./AGENTS.md) 를 읽을 것.** 디렉터리 구조, 기본 명령어, 코드 스타일·네이밍, 테스트 규칙,
커밋/PR 규칙, 시크릿 취급은 전부 거기 있고 여기서 반복하지 않는다.
이 문서는 여러 파일을 읽어야 알 수 있는 아키텍처 결정과 함정만 다룬다.

## 이 저장소만의 명령어 함정

```bash
pnpm run deploy                          # `run` 필수 — pnpm 내장 deploy 와 충돌한다
pnpm --filter @1ott/api test titles      # 파일명 필터로 단일 테스트 파일
pnpm --filter @1ott/api test -- -t "잔디"  # 테스트 이름 필터
```

로컬 개발엔 `apps/api/.dev.vars` 가 필요하다(`.dev.vars.example` 복사). `TMDB_API_TOKEN` 이 없으면
`/api/search` 는 503 을 돌려주고 자유입력 기록만 가능하다 — 검색이 안 되면 먼저 이걸 의심할 것.

`main` push 시 CI 가 typecheck → test → web build → D1 원격 마이그레이션 → 프로덕션 배포까지 자동으로 한다.

주석은 한국어로 쓴다(커밋 요약과 동일). 기존 파일의 주석 밀도와 톤을 따를 것.

## 아키텍처에서 알아야 할 것

**Worker 하나가 API 와 웹을 같이 서빙한다.** `wrangler.jsonc` 의 `assets` 가 `../web/dist` 를 정적 자산으로
붙이고 `run_worker_first: ["/api/*", "/health"]` 로 API 만 Worker 가 먼저 받는다. 프로덕션은 same-origin 이라
CORS/쿠키 문제가 없고, 개발에선 Vite 프록시가 같은 모양을 흉내낸다. 새 API 경로는 `/api/` 하위로 두거나
`run_worker_first` 를 갱신해야 한다.

**인증 경계는 `apps/api/src/index.ts` 의 라우트 등록 순서다.** Hono 는 등록 순서대로 핸들러를 합성하므로
`publicRoute` 를 인증 게이트 미들웨어보다 **먼저** 등록해 무인증으로 통과시킨다. 게이트는 추가로
`/api/auth/`, `/api/u/` 접두사를 예외 처리한다. 무인증 엔드포인트를 추가할 땐 `publicRoute` 에 넣고
등록 위치를 확인할 것 — 순서가 곧 보안이다. 인증 통과 시 `c.set("userId", ...)` 로 내려가고,
소유권 검사(본인 entry 인지)는 각 핸들러가 직접 한다.

**Better Auth 인스턴스는 요청마다 새로 만든다**(`createAuth(env)`). D1 write-lock 경합을 피하는
Cloudflare 권장 패턴이므로 모듈 스코프로 끌어올리지 말 것. `user` 테이블의 `username`/`isPublic`/`lang` 은
Better Auth `additionalFields` 로 선언돼 있어 `auth.ts` 와 `db/schema.ts` 를 함께 고쳐야 한다.
어댑터가 JS property key(camelCase)로 매핑하므로 컬럼명 snake_case / key camelCase 규칙을 유지할 것.

**다국어 제목·포스터는 `content.meta` JSON 캐시로 해결한다.** `apps/api/src/lib/titles.ts` 의
`resolveLocalized()` 가 유일한 경로다. `meta` 에 `{titles, posters, facts, fetchedAt}` 을 언어별로 캐시하고
TTL(7일 — TMDB 약관상 6개월 상한보다 넉넉히 짧게) 만료 시에만 TMDB 상세를 1회 조회해 갱신한다.
클라이언트는 관련 요청에 전부 `?lang=` 을 붙이고(`apps/web/src/lib/api.ts`), `pickLang()` 이 지원 언어
(ko/en/ja)로만 통과시킨다. `lang` 미지정이면 저장된 원문을 그대로 쓴다. posters 캐시의 `""` 는
"그 언어 포스터 없음"을 캐시한 표식이지 미조회가 아니다.

**`@1ott/shared` 는 빌드 없이 TS 소스를 직접 import 한다**(`main` 이 `./src/index.ts`).
API·웹이 공유하는 계약(zod 입력 스키마, `ContentType`/`Reaction`, markdown import/export 파서)은 전부
여기 두되 순수 함수만 — Worker 런타임이나 DOM 에 의존하는 코드 금지.

**라우터 라이브러리를 쓰지 않는다.** `App.tsx` 가 `window.location.pathname` 을 수동 분기한다
(`/u/:username` 공개 프로필, `/c/:contentId` 작품 페이지, `/me` 마이페이지, 그 외 대시보드).
의도된 제약이니 react-router 등을 끌어들이지 말 것.

**스타일은 CSS 변수 + 인라인 스타일 객체다.** `index.css` 가 `--surface`/`--border`/`--accent` 등 토큰과
다크 모드(`prefers-color-scheme` + `data-theme` 오버라이드)를 정의하고, 각 컴포넌트는 파일 하단의
`const st: Record<string, React.CSSProperties>` 에 스타일을 모아둔다. CSS 프레임워크 없음.

**모든 UI 문자열은 i18n 을 거친다.** `src/i18n/locales/{ko,en,ja}.ts` 에 키를 추가하고 `t("...")` 로 쓴다.
세 로케일의 키가 어긋나면 `i18n.test.ts` 가 실패한다. 기본 언어는 ko.

## 테스트·마이그레이션에서 놓치기 쉬운 것

API 테스트는 목이 없다. `@cloudflare/vitest-pool-workers` 로 **실제 workerd + 실제 D1**(테스트마다 격리된
스토리지) 위에서 HTTP 전 구간을 돈다 — better-auth 가입/세션, drizzle 쿼리 모두 프로덕션과 같은 경로다.
`test/apply-migrations.ts` 셋업이 매번 마이그레이션을 적용하므로 각 테스트는 자기 데이터를 스스로 만든다.
`vitest.config.ts` 는 `wrangler.jsonc` 를 일부러 쓰지 않고(웹 dist 의존·프로덕션 vars 회피) 테스트 전용
바인딩만 주입한다 — **환경 변수를 추가하면 여기에도 넣어야 한다.**

스키마 변경은 `db/schema.ts` 수정 → `pnpm db:generate` → 생성된 SQL 을 **커밋** → `pnpm db:migrate:local`.
drizzle-kit 은 생성만 하고 적용은 `wrangler d1 migrations apply` 가 한다.

## 문서

기능 작업은 `docs/specs/YYYY-MM-DD-*.md`(설계 확정) → `docs/plans/` 또는 `docs/superpowers/plans/`
(체크박스 실행 계획) 순서로 남아 있다. 큰 기능을 시작하기 전 관련 spec 이 있는지 먼저 볼 것.
