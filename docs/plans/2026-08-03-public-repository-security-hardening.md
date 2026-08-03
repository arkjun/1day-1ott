# 공개 저장소 전환 보안 강화 구현 계획

- [x] Better Auth rate limit 회귀 테스트를 추가한다.
- [x] D1 rate limit 스키마와 migration을 추가하고 database storage를 활성화한다.
- [x] 연합우주 비활성화·retry·object/outbox 회귀 테스트를 추가한다.
- [x] publication 조회와 Queue consumer에 사용자 활성 상태 검증을 추가한다.
- [x] 원격 inbox URL 검증 테스트와 저장·Queue 발송 방어를 추가한다.
- [x] 원격 custom emoji 이미지 노출을 제거한다.
- [x] Action SHA pinning과 공통 보안 헤더를 적용한다.
- [x] 전체 테스트, typecheck, web build, Wrangler dry-run, 보안 스캔을 실행한다.

## 검증 결과

- `pnpm test`: 297개 테스트 통과
- `pnpm typecheck`: 통과
- `pnpm --filter @1ott/web build`: 통과(기존 청크 크기 경고 유지)
- `pnpm --filter @1ott/api exec wrangler deploy --dry-run`: 통과
- Gitleaks 전체 Git 이력: 114개 commit에서 유출 없음
- `pnpm audit --prod`: 알려진 취약점 없음
