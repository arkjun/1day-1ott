# 연합 팔로워 웹 목록 통합

- 작성일: 2026-08-04
- 대상: `apps/api`, `apps/web`, `packages/shared`
- 상태: 승인

## 결론

공개 프로필의 팔로워 수와 팔로워 목록에 활성 상태의 연합우주 팔로워를 포함한다.
로컬 팔로우와 연합 팔로우의 저장 모델 및 수명주기는 기존처럼 분리한다.

원격 Actor를 1일 1OTT에서 팔로우하는 기능과 ActivityPub `following` 컬렉션은
이번 범위에 포함하지 않는다.

## 동작

- `followerCount`는 로컬 `user_follows` 수와 활성 `federation_followers` 수의 합이다.
- 팔로우·해제 API가 반환하는 `followerCount`도 같은 통합 수치를 사용한다.
- 팔로워 목록은 공개 로컬 사용자와 활성 원격 Actor를 생성 시각 역순으로 합친다.
- 팔로잉 수와 팔로잉 목록은 기존처럼 로컬 사용자만 대상으로 한다.
- 제거된 원격 팔로워는 수치와 목록에서 제외한다.
- 원격 Actor는 저장된 handle과 Actor URI만 사용한다. 목록 조회 중 외부 서버로
  프로필 메타데이터를 요청하지 않는다.
- 원격 Actor 항목은 연합 계정임을 표시하고 안전한 HTTP(S) Actor URI만 링크한다.

## API 계약

팔로워·팔로잉 목록 항목은 다음 판별 가능한 공용체를 사용한다.

```ts
type FollowListItem =
  | {
      kind: "local";
      username: string;
      name: string;
      bio: string | null;
      avatarUrl: string;
    }
  | {
      kind: "federated";
      handle: string | null;
      actorUrl: string | null;
    };
```

커서는 로컬·원격 항목을 함께 정렬할 수 있도록 생성 시각과 출처가 포함된 불투명
정렬 키를 담는다. 기존과 같이 잘못된 커서는 `400 invalid_cursor`로 응답한다.

## 테스트

- 활성 원격 팔로워가 공개 프로필 수치에 포함된다.
- 팔로우·해제 응답 수치에 활성 원격 팔로워가 포함된다.
- 활성 원격 팔로워가 로컬 팔로워와 함께 페이지 조회된다.
- 제거된 원격 팔로워는 수치와 목록에서 제외된다.
- 원격 Actor 링크와 연합 계정 표시가 렌더링된다.
- 팔로잉 목록에는 원격 팔로워가 섞이지 않는다.
