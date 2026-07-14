/** 일지 달력(연 단위 회고 뷰) 집계. UI 무관 순수 함수 — heatmap.ts 와 같은 패턴. */

/** 집계에 필요한 최소 형태. EntryRow 가 그대로 대입 가능. */
export interface CalendarEntry {
  watchedOn: string; // 'YYYY-MM-DD'
  type: string;
  title: string;
  posterUrl: string | null;
}

export interface MonthSummary {
  month: number; // 1..12
  count: number;
  typeCounts: Record<string, number>;
  posters: string[]; // 콜라주용, 최근순·title 중복 제거·최대 4장
}

export interface YearSummary {
  year: number;
  months: MonthSummary[]; // 항상 12칸 (빈 달 count 0)
  total: number;
  types: string[]; // 연간 카운트 내림차순 (스택 색/순서 안정화)
}

const MAX_POSTERS = 4;

// 타임존 버그 차단: Date 를 만들지 않고 문자열만 파싱한다.
function parseYm(watchedOn: string): { year: number; month: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(watchedOn)) return null;
  const year = Number(watchedOn.slice(0, 4));
  const month = Number(watchedOn.slice(5, 7));
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** 기록에 등장하는 연도를 중복 없이 최신순으로. */
export function listYears(entries: CalendarEntry[]): number[] {
  const years = new Set<number>();
  for (const e of entries) {
    const ym = parseYm(e.watchedOn);
    if (ym) years.add(ym.year);
  }
  return [...years].sort((a, b) => b - a);
}

export function buildYearSummary(
  entries: CalendarEntry[],
  year: number,
): YearSummary {
  const months: MonthSummary[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    count: 0,
    typeCounts: {},
    posters: [],
  }));
  const yearTypeCounts = new Map<string, number>();
  // 월별 포스터 후보: 최근순 정렬 후 title dedupe 를 위해 모아둔다.
  const candidates: { month: number; watchedOn: string; title: string; posterUrl: string }[] = [];

  for (const e of entries) {
    const ym = parseYm(e.watchedOn);
    if (!ym || ym.year !== year) continue;
    const m = months[ym.month - 1]!;
    m.count++;
    m.typeCounts[e.type] = (m.typeCounts[e.type] ?? 0) + 1;
    yearTypeCounts.set(e.type, (yearTypeCounts.get(e.type) ?? 0) + 1);
    if (e.posterUrl) {
      candidates.push({
        month: ym.month,
        watchedOn: e.watchedOn,
        title: e.title,
        posterUrl: e.posterUrl,
      });
    }
  }

  candidates.sort((a, b) => b.watchedOn.localeCompare(a.watchedOn));
  const seen = new Set<string>(); // `${month}:${title}`
  for (const c of candidates) {
    const m = months[c.month - 1]!;
    const key = `${c.month}:${c.title}`;
    if (m.posters.length >= MAX_POSTERS || seen.has(key)) continue;
    seen.add(key);
    m.posters.push(c.posterUrl);
  }

  const types = [...yearTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type]) => type);

  return {
    year,
    months,
    total: months.reduce((sum, m) => sum + m.count, 0),
    types,
  };
}
