# 작품별 페이지 설계

작성일: 2026-07-18

## 목표

작품(content)마다 공개 페이지를 만든다. 누구나 볼 수 있고(무인증), 로그인한
사용자에게는 하단에 "이 작품에 대한 내 기록"을 추가로 보여준다.

## 범위

- 공개 페이지: 작품 정보 + 익명 시청 집계(B안).
- 로그인 시: 하단에 본인 기록(날짜·반응·메모) 표시 + 인라인 수정/삭제.
- 진입점: Dashboard(포스터 그리드·최근 기록) + PublicProfile 포스터에서 클릭.

범위 밖:
- TMDB 추가 상세(개요·개봉연도 등) — 현재 저장하지 않으며 이번에 가져오지 않음.
- 공개 프로필 목록(누가 봤는지 이름 노출) — B안이 아니라 C안. 하지 않음.

## 라우팅

- URL: `/c/:contentId`
- `content.id` 는 이미 랜덤 text PK 라 URL 노출 무방.
- `App.tsx` 에서 기존 `/u/` 분기와 동일하게 `pathname` 수동 분기 추가.
  라우터 라이브러리 도입하지 않음(기존 방식 유지).

## API

인증 경계를 엔드포인트로 분리한다. `index.ts` 의 인증 게이트 로직은 건드리지
않는다.

| 엔드포인트 | 인증 | 반환 |
|---|---|---|
| `GET /api/content/:id?lang=` | 무인증 | 작품 정보 + 익명 집계 |
| `GET /api/content/:id/mine?lang=` | 인증 필요 | 내 기록 배열 |

- 공개 집계 엔드포인트는 `publicRoute` 에 추가. `index.ts` 에서 `publicRoute`
  는 인증 게이트(`app.use("/api/*")`)보다 먼저 마운트되므로, 매칭되는 요청은
  publicRoute 핸들러가 먼저 응답하고 뒤의 게이트 미들웨어를 타지 않는다.
  기존 `/api/u/:username`(공개 프로필)이 정확히 이 방식으로 무인증 작동 중이라
  검증된 패턴. → 게이트 화이트리스트(`/api/u/` 등) 수정 불필요.
- `/mine` 은 publicRoute 에 없으므로 게이트 뒤 별도 라우트로 마운트 →
  자동으로 인증 강제됨(entriesRoute 와 동일).

### 공개 집계 응답

```jsonc
{
  "id": "…",
  "type": "movie",
  "title": "현지화된 제목",   // resolveTitles 로 lang 반영, 없으면 원문
  "posterUrl": "…|null",
  "viewerCount": 12,          // distinct userId
  "reactions": { "up": 8, "love": 3, "down": 1 }  // group by reaction
}
```

- 집계는 `isPublic` 무관 전체 `entries` 대상(익명이므로 개인 식별 없음,
  GitHub 스타 카운트식). 사용자 동의됨.
- `reaction` 이 null 인 기록은 반응 분포에서 제외.

### `/mine` 응답

```jsonc
{ "entries": [ { id, watchedOn, reaction, note, platform } … ] }
```

- 해당 `contentId` + 세션 `userId` 의 entries, `watchedOn` 내림차순.

## 웹 컴포넌트

- 새 파일 `apps/web/src/components/ContentPage.tsx`.
- 상단: 포스터 + 제목 + 타입 + 익명 집계(관람 수, 반응 이모지별 카운트).
- 하단(로그인 시만): 내 기록 리스트. `App.tsx` 의 `RecentItem` 재사용
  가능 여부 확인 — 가능하면 재사용, 아니면 최소 버전. `RecentItem` 은
  현재 `App.tsx` 안에 있으므로, 재사용하려면 export 하거나 공용 파일로
  이동. 이동이 깔끔하면 이동한다.
- `api.ts` 에 `content(id)` / `contentMine(id)` 두 메서드 추가.

## 진입점 연결

- Dashboard 포스터 그리드·최근 기록 행: 클릭 → `/c/:contentId`.
- PublicProfile 포스터: 클릭 → `/c/:contentId`.
- posters/entries 응답에 `contentId` 존재.
  - 확인 필요: PublicProfile 의 posters 응답이 `contentId` 를 담는가.
    현재 `public.ts` 의 posters 매핑은 `id`(entry id) 만 노출하고
    `contentId` 를 빼고 있다. 진입점 연결하려면 posters 매핑에
    `contentId` 를 추가한다.

## 테스트

- API: 익명 집계(viewerCount distinct, 반응 분포 group by) 1개.
- API: `/mine` 인증 요구 + 본인 기록만 반환 1개.

## 커밋 단위

1. API: 집계 + `/mine` 엔드포인트 + 테스트.
2. 웹: ContentPage + 라우팅 + api 클라이언트.
3. 진입점 연결(포스터/최근기록 클릭, posters 에 contentId 노출).
