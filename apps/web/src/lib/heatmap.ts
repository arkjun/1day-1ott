import type { HeatmapCell } from "@1ott/shared";

export const GREEN = {
  light: ["#e9ecf1", "#b9e6c4", "#74d089", "#37b25c", "#157f3b"],
  dark: ["#1b212b", "#0e4429", "#14683a", "#26a148", "#3fd35b"],
};

export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** /api/heatmap 셀을 지난 365일 전체로 패딩(빈 날 level0). */
export function buildYear(cells: HeatmapCell[]) {
  const byDate = new Map(cells.map((c) => [c.date, c]));
  const out: { date: string; count: number; level: number }[] = [];
  for (let i = 364; i >= 0; i--) {
    const date = isoDaysAgo(i);
    const hit = byDate.get(date);
    out.push({ date, count: hit?.count ?? 0, level: hit?.level ?? 0 });
  }
  return out;
}

/** 오늘(또는 어제)부터 뒤로 연속 기록 일수. */
export function currentStreak(cells: HeatmapCell[]): number {
  const has = new Set(cells.filter((c) => c.count > 0).map((c) => c.date));
  let streak = 0;
  const start = has.has(isoDaysAgo(0)) ? 0 : 1;
  for (let i = start; i < 400; i++) {
    if (has.has(isoDaysAgo(i))) streak++;
    else break;
  }
  return streak;
}

export function prefersDark(): "light" | "dark" {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
