# 기록 대량 업로드/다운로드 (Markdown)

- 날짜: 2026-07-16
- 상태: 설계 확정 (구현 대기)

## 목적

사용자가 자기 시청 기록(entries)을 **markdown 표**로 한 번에 올리고 내려받는다.
손으로 쓰기 쉬운 사람 친화 포맷(B안). 반응(따봉)·한줄 감상까지 한 방에 입력.

핵심 사용 시나리오: 사용자가 표에 여러 편을 적어(또는 다른 곳에서 붙여넣어) 대량 등록.
export는 백업/열람용이며 같은 포맷이라 재업로드도 된다.

## 범위 밖 (YAGNI)

- TMDB/YouTube 매칭·posterUrl·tmdbId — 모든 content는 free-text 신규 생성
- 유형 자동 추론
- undo/롤백 (미리보기로 대체)
- CSV/JSON 등 다른 포맷
- import 시 중복 자동 제거 (경고만)

## 데이터 모델 (기존, 변경 없음)

`entries`: `userId, contentId, watchedOn(YYYY-MM-DD), reaction(down|up|love|null), note, platform, createdAt`
`content`: `id, type, tmdbId, ytId, title, posterUrl, meta`

- `platform`: 스키마·API엔 있으나 현재 입력 UI가 없어 항상 null인 dead field.
  이 기능의 import가 platform을 채우는 **유일한 경로**가 된다(유지).

## Markdown 포맷

Github-flavored markdown 표. export/import 공용.

```markdown
| 날짜 | 제목 | 유형 | 반응 | 감상 | 플랫폼 |
|------|------|------|------|------|--------|
| 2026-07-15 | 무빙 | 드라마 | 좋아요 | 재밌었다 | 디즈니+ |
| 2026-07-15 | 폭싹 속았수다 | 드라마 | 매우 좋아요 |  |  |
| 2026-07-14 | 어떤영화 |  | 싫어요 |  | 넷플릭스 |
```

### 컬럼

| 컬럼 | 필수 | entries 매핑 | 규칙 |
|------|------|--------------|------|
| 날짜 | O | `watchedOn` | `YYYY-MM-DD` 정규식. 불일치 시 행 오류 |
| 제목 | O | `content.title` | 1~300자. 빈칸이면 행 오류 |
| 유형 | X | `content.type` | 아래 라벨 매핑. 빈칸→`other` |
| 반응 | X | `reaction` | 아래 라벨 매핑. 빈칸→`null` |
| 감상 | X | `note` | 최대 1000자 |
| 플랫폼 | X | `platform` | 최대 60자 |

### 유형 라벨 매핑

기존 i18n(`type.*`) 한국어 라벨 재사용. 영어 enum 키도 허용. 대소문자·공백 무시.

| enum | 한국어 라벨(export에 사용) |
|------|------|
| movie | 영화 |
| tv | 드라마 |
| variety | 예능 |
| documentary | 시사·교양 |
| anime | 애니 |
| youtube | 유튜브 |
| other | 기타 |

- import: 한국어 라벨 또는 영어 키 모두 인식. 미인식 라벨은 행 오류(무단 `other` 강등 금지 — 오타를 숨기지 않음).
- 빈칸만 `other`.

### 반응 라벨 매핑

기존 i18n(`reaction.*`) 라벨을 canonical로 사용. alias 추가 허용.

| enum | canonical(export) | import alias |
|------|------|------|
| down | 싫어요 | 👎, 별로 |
| up | 좋아요 | 👍, 굿 |
| love | 매우 좋아요 | 👍👍, 최고 |

- 빈칸→`null`. 미인식 값은 행 오류.

## 공유 파서 (`packages/shared`)

api·web·테스트가 공유하는 순수 함수. 라벨 매핑 상수도 여기 둔다.

```ts
// packages/shared/src/markdown.ts (또는 index.ts에 추가)

export interface ParsedEntryRow {
  watchedOn: string;
  title: string;
  type: ContentType;
  reaction: Reaction | null;
  note: string | null;
  platform: string | null;
}

export interface ParseError {
  row: number;        // 1-based 데이터 행 번호(헤더 제외)
  message: string;    // 한국어
}

export interface ParseResult {
  ok: ParsedEntryRow[];
  errors: ParseError[];
}

export function parseEntriesMarkdown(md: string): ParseResult;
export function formatEntriesMarkdown(rows: ParsedEntryRow[]): string;
```

파싱 규칙:
- 표(파이프 구분) 라인만 파싱. 헤더 행 + 구분선(`|---|`) 스킵.
- 표 밖의 텍스트(제목/설명 등)는 무시 — export가 순수 표라도 사용자가 앞에 메모 붙일 수 있음.
- 헤더 컬럼 순서는 **위치 기반 고정**(날짜|제목|유형|반응|감상|플랫폼). 헤더 라벨 자체는 검증 안 함(단순).
- 셀 앞뒤 공백 trim. 이스케이프 처리 안 함(파이프 `|` 포함 셀은 미지원 — 알려진 한계).
- 각 행 독립 검증. 오류 행은 `errors`에, 정상 행은 `ok`에.

`formatEntriesMarkdown`: 위 표 생성. null/빈 필드는 빈 셀. 셀 내 개행은 공백으로 치환(표 깨짐 방지).

## 백엔드 (`apps/api`)

`apps/api/src/routes/entries.ts`에 두 엔드포인트 추가(기존 라우트·`upsertContent` 재사용).

### `POST /api/entries/import`

body: `{ markdown: string, commit: boolean }`

1. `parseEntriesMarkdown(markdown)` 호출.
2. 행 수(`ok.length + errors.length`) > **500**이면 `400 { error: "too_many_rows" }`.
3. 중복 경고 계산: 내 기존 entries에서 `(watchedOn, title)` 동일한 게 있는 `ok` 행 → `dupWarnings`.
   - 구현: `ok`의 `(watchedOn,title)` 쌍을 모아 기존 entries+content 조인으로 조회(제목은 content.title 기준). N개 쌍 IN 조회 1회.
4. `commit === false` (dry-run): DB 미변경. 반환:
   ```json
   { "committed": false, "okCount": N, "errors": [...], "dupWarnings": [{ "row": 2, "watchedOn": "...", "title": "..." }] }
   ```
5. `commit === true`: `ok` 행만 순회하며 기존 `upsertContent` + `entries` insert 재사용. 반환:
   ```json
   { "committed": true, "inserted": N, "errors": [...] }
   ```
   - 오류 행은 넣지 않음(부분 성공). 중복 의심 행은 **넣는다**(경고만).
   - `lang` 쿼리 있으면 `upsertContent`에 전달(기존과 동일).

인증: 기존 entries 라우트와 동일 미들웨어(`userId` 컨텍스트). 남의 기록 영향 없음.

### `GET /api/entries/export`

- 내 전체 entries를 `formatEntriesMarkdown`으로 직렬화. 날짜 desc, 같은 날은 createdAt desc.
- content 조인해서 title/type 획득(기존 목록 쿼리 형태 재사용, resolveTitles 불필요 — 저장 원제목 사용).
- 응답: `text/markdown`, `Content-Disposition: attachment; filename="1ott-<오늘YYYY-MM-DD>.md"`.

## 프론트 (`apps/web`)

### `api.ts`

```ts
importEntries: (markdown: string, commit: boolean) =>
  req<ImportResult>(`/api/entries/import?lang=${i18n.language}`, {
    method: "POST", body: JSON.stringify({ markdown, commit }),
  }),
// export는 파일 다운로드라 fetch로 blob 받아 저장(req 헬퍼는 json 전제라 별도 처리)
exportEntries: async () => { /* fetch → blob → a[download] 클릭 */ },
```

### `MyPage.tsx`에 "가져오기 / 내보내기" 섹션 추가

- **내보내기**: 버튼 → `exportEntries()` → `1ott-YYYY-MM-DD.md` 저장.
- **가져오기**:
  1. 파일 선택(`<input type="file" accept=".md,.markdown,text/markdown">`) 또는 textarea 붙여넣기.
  2. `importEntries(md, false)` (dry-run) → 미리보기 모달:
     - 요약: "등록 N건 / 오류 M건 / 중복 의심 K건"
     - 오류 행 목록(행번호 + 메시지), 중복 의심 행 목록.
  3. N>0이고 사용자가 [확정] → `importEntries(md, true)` → 목록·잔디 새로고침, 모달 닫기.
  4. N===0이면 확정 버튼 비활성(등록할 게 없음).

i18n: 새 문자열은 `ko/en/ja` 로케일에 추가(기존 패턴 따름).

## 에러 처리

- 잘못된 행: dry-run·commit 모두 `errors[]`로 리포트, 나머지는 진행(부분 성공).
- 500행 초과: 400 거부, 사용자에 "500행까지 가능" 안내.
- 빈 표/표 없음: `okCount:0`, 확정 버튼 비활성.
- 네트워크 오류: 기존 `req` throw → 프론트 에러 토스트/메시지(기존 패턴).

## 테스트

- `packages/shared` 단위 테스트(`markdown.test.ts`):
  - 정상 다행 파싱, 빈 선택 컬럼, 잘못된 날짜/빈 제목 → error 행, 유형·반응 라벨/영어키/이모지 매핑, 미인식 라벨 → error.
  - `format → parse` roundtrip 동일성(선택 필드 포함).
  - 표 밖 텍스트 무시.
- `apps/api` 통합 테스트(`test/api.test.ts` 확장):
  - dry-run은 DB 불변(entries count 그대로).
  - commit은 유효 행만 insert, 오류 행 제외.
  - 501행 → 400.
  - export가 방금 넣은 기록을 표로 반환.

## 열린 한계 (의도된 단순화)

- 셀 내 `|` 미지원(이스케이프 안 함). 필요 시 파서 확장.
- 중복은 경고만 — 재업로드 시 사용자가 판단.
- content dedup 없음(free-text) — 같은 작품 반복 import는 content 행이 늘어남. 수기 입력 앱 특성상 수용.
