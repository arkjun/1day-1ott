/** 로케일 의존 포맷 헬퍼(순수). i18next 인스턴스에 의존하지 않도록 언어를 인자로 받는다. */

const YEAR_SUFFIX: Record<string, string> = { ko: "년", ja: "年" };

/** 월(1~12) → 로케일 라벨. ko "7월" · ja "7月" · en "Jul". */
export function monthLabel(month: number, lng: string): string {
  const base = lng.split("-")[0] || lng;
  // 연/일과 무관한 순수 월 이름만 필요 → 임의 연·일의 Date 로 Intl 사용.
  return new Intl.DateTimeFormat(base, { month: "short" }).format(new Date(2020, month - 1, 1));
}

/** 연도 → 로케일 라벨. ko "2026년" · ja "2026年" · en "2026". */
export function yearLabel(year: number, lng: string): string {
  const base = lng.split("-")[0] || lng;
  return `${year}${YEAR_SUFFIX[base] ?? ""}`;
}

// react-activity-calendar 툴팁 집계 문구({{count}} 은 라이브러리가 보간).
const TOTAL_COUNT: Record<string, string> = {
  ko: "{{count}}편 기록",
  en: "{{count}} entries logged",
  ja: "{{count}}本 記録",
};

// 잔디 범례(Less ~ More) 라벨.
const LEGEND: Record<string, { less: string; more: string }> = {
  ko: { less: "적음", more: "많음" },
  en: { less: "Less", more: "More" },
  ja: { less: "少ない", more: "多い" },
};

/** react-activity-calendar 의 labels prop 을 로케일에 맞춰 생성(월·요일·툴팁·범례). */
export function activityLabels(lng: string) {
  const base = lng.split("-")[0] || lng;
  const month = new Intl.DateTimeFormat(base, { month: "short" });
  const weekday = new Intl.DateTimeFormat(base, { weekday: "short" });
  return {
    months: Array.from({ length: 12 }, (_, i) => month.format(new Date(2020, i, 1))),
    // 2020-06-07 은 일요일 → 0(일)~6(토) 순.
    weekdays: Array.from({ length: 7 }, (_, i) => weekday.format(new Date(2020, 5, 7 + i))),
    totalCount: TOTAL_COUNT[base] ?? TOTAL_COUNT.ko,
    legend: LEGEND[base] ?? LEGEND.ko,
  };
}
