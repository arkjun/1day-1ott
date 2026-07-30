# 연합우주 운영 설정

Fedify 기능은 D1 외에 Cloudflare KV 2개와 Queue/DLQ가 필요하다.
리소스 생성은 배포 환경 변경이므로 저장소 설정만으로 자동 수행하지 않는다.

## 최초 1회 프로비저닝

```bash
pnpm --filter @1ott/api exec wrangler kv namespace create FEDIFY_KV
pnpm --filter @1ott/api exec wrangler kv namespace create FEDIFY_ORDERING_KV
pnpm --filter @1ott/api exec wrangler queues create 1ott-fedify
pnpm --filter @1ott/api exec wrangler queues create 1ott-fedify-dlq
pnpm --filter @1ott/api exec wrangler secret put FEDERATION_KEY_SECRET
```

- KV 생성 결과의 ID를 `apps/api/wrangler.jsonc`의 placeholder와 교체한다.
- `FEDERATION_KEY_SECRET`에는 비밀번호가 아니라 32바이트 이상 난수 값을 넣는다.
- 키를 분실하면 저장된 Actor private JWK를 복호화할 수 없으므로 백업 대상에 포함한다.

## 배포 전 확인

```bash
pnpm test
pnpm typecheck
pnpm --filter @1ott/web build
pnpm --filter @1ott/api exec wrangler deploy --dry-run
```

배포 후 다음 주소를 실제 활성 사용자 핸들로 확인한다.

```text
https://1day1ott.com/.well-known/webfinger?resource=acct:username@1day1ott.com
https://1day1ott.com/ap/users/{userId}
```

Fedify CLI의 `fedify lookup`, `fedify inbox`, `fedify tunnel`도 상호운용성
검증에 사용할 수 있다.

## Cloudflare WAF

Bot/Managed Challenge가 ActivityPub 서버 요청을 차단하지 않도록 다음 요청은
Challenge를 건너뛰게 설정한다.

- `Accept`에 `application/activity+json` 또는 `application/ld+json` 포함
- `Content-Type`에 `application/activity+json` 또는 `application/ld+json` 포함

프로덕션에는 `Allow ActivityPub federation` 사용자 지정 규칙을 사용한다.
예외 범위를 연합 엔드포인트로 제한하기 위한 표현식은 다음과 같다.

```text
(starts_with(http.request.uri.path, "/ap/") or starts_with(http.request.uri.path, "/.well-known/")) and (any(http.request.headers["accept"][*] contains "application/activity+json") or any(http.request.headers["accept"][*] contains "application/ld+json") or any(http.request.headers["content-type"][*] contains "application/activity+json") or any(http.request.headers["content-type"][*] contains "application/ld+json"))
```

동작은 `Skip`으로 설정하고 나머지 사용자 지정 규칙, 속도 제한 규칙, 관리
규칙과 Super Bot Fight Mode 규칙을 건너뛴다. 일치 요청 로깅은 활성화한다.

## 장애 처리

- 발행 큐는 최대 5회 재시도 후 `1ott-fedify-dlq`로 이동한다.
- D1에서 `federation_publications.status = 'failed'`인 신규 발행은 10분마다
  최대 20건 재등록한다.
- 원격 inbox가 `404` 또는 `410`을 영구 반환하면 해당 원격 Actor의 follower를
  `removed` 처리한다.
- Worker Observability에서 `fedify` 및 `activitypub` 로그와 Queue/DLQ 적재량을
  함께 모니터링한다.
