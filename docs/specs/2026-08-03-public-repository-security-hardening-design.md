# 공개 저장소 전환 보안 강화 설계

## 배경

저장소 공개 전 검토에서 비밀값 유출은 발견되지 않았지만 다음 운영 위험이 확인됐다.

- Better Auth의 기본 rate limit이 `NODE_ENV=production`에 의존해 Worker 운영 환경에서 비활성화된다.
- 연합우주를 비활성화한 뒤에도 실패 발행 cron 또는 이미 적재된 Queue가 감상평을 발행할 수 있다.
- 원격 Actor가 선언한 inbox URL을 검증하지 않아 Worker가 임의 목적지로 요청할 수 있다.
- 원격 커스텀 이모지 이미지를 방문자 브라우저에서 직접 불러와 제3자 추적이 가능하다.
- CI Action이 가변 태그를 사용하고 공통 보안 응답 헤더가 없다.

## 목표

1. 인증 요청 제한을 환경 판별과 Worker isolate 메모리에 의존하지 않게 한다.
2. 공개 프로필 또는 연합우주를 끈 사용자의 새 발행과 재시도를 모든 실행 경로에서 중단한다.
3. 원격 inbox는 HTTPS 공개 주소인 경우에만 저장·발송한다.
4. 공개 페이지에서 원격 서버의 이미지를 직접 요청하지 않는다.
5. 공개 저장소의 CI 공급망과 브라우저 보안 기본값을 강화한다.

## 설계

### 인증 rate limit

Better Auth의 rate limit을 명시적으로 활성화하고 storage를 D1 database로 고정한다. `rate_limit` 테이블에 key, count, last request 시각을 저장하며 Better Auth의 특수 규칙을 그대로 사용한다.

- 로그인·가입·비밀번호·이메일 변경: 10초에 3회
- 인증메일·OTP 발송: 60초에 3회
- 그 밖의 인증 API: 10초에 100회

### 연합우주 비활성화

발행 데이터 조회는 사용자 `isPublic`과 `federationEnabled`가 모두 true인 경우만 허용한다. 비활성화 시 pending/failed publication은 deleted로 전환해 재활성화 전 cron 재시도도 막는다.

Queue consumer는 outgoing activity의 로컬 Actor를 추출해 처리 직전에 사용자 활성 상태를 확인한다. 비활성 Actor의 Create/Update/Accept는 폐기하지만, 이미 요청된 삭제가 원격에 전달되도록 Delete는 허용한다.

Actor가 비활성인 동안 outbox와 Note object는 제공하지 않는다.

### 원격 inbox 검증

Fedify의 `validatePublicUrl()`로 remote inbox와 shared inbox를 검증한다. HTTPS가 아니거나 사설·루프백·예약 주소이면 Follow를 저장하거나 Accept를 보내지 않는다.

Queue consumer에서도 outbox/fanout 대상 URL을 다시 검증한다. fanout은 안전한 대상만 남기고, 안전한 대상이 없으면 메시지를 폐기한다.

### 원격 이미지

ActivityPub custom emoji의 이름과 집계는 유지하되 원격 icon URL은 저장·응답하지 않는다. 공개 페이지는 `:emoji_name:` 텍스트를 표시하므로 방문자가 원격 서버에 직접 연결되지 않는다.

### 저장소·응답 보안

- GitHub Actions는 공식 release commit SHA로 고정한다.
- workflow 권한은 `contents: read`로 명시한다.
- Worker와 정적 자산에 nosniff, frame deny, referrer, permissions policy를 적용한다.
- R2 custom domain에도 `X-Content-Type-Options: nosniff`를 필수 운영 설정으로 문서화한다.

## 검증

- rate limit 네 번째 인증 요청이 429인지 통합 테스트
- 비활성화 후 publication·outbox·object·retry·Queue 차단 테스트
- private/non-HTTPS inbox 저장 및 Queue 발송 차단 테스트
- 원격 custom emoji URL이 API와 HTML에 노출되지 않는 테스트
- 전체 테스트, typecheck, web build, Wrangler dry-run, Gitleaks, pnpm audit
