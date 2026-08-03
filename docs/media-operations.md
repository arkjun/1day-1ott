# 프로필 미디어 운영 설정

프로필 이미지는 Cloudflare R2의 `1ott-media` bucket에 저장하고
`media.1day1ott.com` custom domain으로 공개한다. 사용자 업로드 키는
`avatars/{uuid}.{ext}` 형식이며 교체할 때마다 새 UUID를 사용한다.

## 최초 1회 프로비저닝

```bash
pnpm --filter @1ott/api exec wrangler r2 bucket create 1ott-media
pnpm --filter @1ott/api media:upload-default
```

Cloudflare Dashboard의 R2 bucket 설정에서 다음 작업을 완료한다.

- `media.1day1ott.com` custom domain 연결
- 개발용 `r2.dev` public URL 비활성화
- Response Header Transform Rule로
  `X-Content-Type-Options: nosniff`를 반드시 추가
- GitHub Actions의 `CLOUDFLARE_API_TOKEN`에 R2 binding 배포 권한 추가

기본 이미지가 다음 주소에서 `image/svg+xml`로 응답하는지 확인한다.

```text
https://media.1day1ott.com/avatars/default.svg
```

## 업로드 정책

- 허용 형식: JPEG, PNG, WebP
- 최대 크기: 5MB
- 파일명은 저장하지 않고 검증된 원래 확장자만 소문자로 유지
- multipart MIME, 확장자, magic bytes가 일치할 때만 저장
- 사용자 업로드 SVG는 허용하지 않음
- 사용자 객체는 `public, max-age=31536000, immutable`로 캐시

## 장애 및 삭제

업로드는 신규 R2 객체 저장, D1의 `avatar_key` 갱신, 이전 객체 삭제 순서로
처리한다. D1 갱신이 실패하면 신규 객체를 즉시 삭제한다. 이전 객체 삭제가
실패하면 Worker 로그의 `Failed to delete previous avatar` 또는
`Failed to delete avatar`를 확인하고 해당 키를 수동 삭제한다.

계정 삭제 요청을 처리할 때 `user.avatar_key`가 가리키는 R2 객체도 함께
삭제한다. 공개 URL과 독립 ActivityPub 서버에 이미 캐시된 사본은 즉시
제거되지 않을 수 있다.

## 배포 전후 확인

```bash
pnpm test
pnpm typecheck
pnpm --filter @1ott/web build
pnpm --filter @1ott/api exec wrangler deploy --dry-run
```

배포 후 JPEG, PNG, WebP 각각의 등록·교체·기본 이미지 복원을 확인하고,
공개 프로필 JSON과 ActivityPub Actor의 `icon` URL이 같은지 점검한다.
