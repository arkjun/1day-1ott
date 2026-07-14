import { useMemo, useState } from "react";
import {
  buildYearSummary,
  listYears,
  type CalendarEntry,
  type MonthSummary,
  type YearSummary,
} from "../lib/calendar";
import { TYPE_META } from "../lib/typeMeta";

type ChartMode = "individual" | "byType";

/* ------------------------------------------------------------------ *
 * 월 셀: 2×2 포스터 콜라주 + 하단 라벨
 * ------------------------------------------------------------------ */
function MonthCell({ m }: { m: MonthSummary }) {
  const empty = m.posters.length === 0;
  return (
    <div style={{ ...cs.cell, opacity: empty ? 0.55 : 1 }}>
      <div style={cs.collage}>
        {m.posters.length === 1 ? (
          <img src={m.posters[0]} alt="" style={{ ...cs.poster, gridColumn: "1 / -1", gridRow: "1 / -1" }} />
        ) : (
          m.posters.map((url) => <img key={url} src={url} alt="" style={cs.poster} />)
        )}
      </div>
      <div style={cs.cellLabel}>
        {m.month}월
        {m.count > 0 && <span style={cs.cellCount}>{m.count}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 월별 막대그래프 (무의존 SVG). 개별=단색, 유형별=스택.
 * ------------------------------------------------------------------ */
function MonthBarChart({ summary, mode }: { summary: YearSummary; mode: ChartMode }) {
  const W = 560;
  const H = 230;
  const M = { top: 22, right: 8, bottom: 36, left: 26 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const maxCount = Math.max(...summary.months.map((m) => m.count));
  const yMax = Math.max(4, Math.ceil(maxCount / 4) * 4);
  const ticks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];
  const slot = iw / 12;
  const barW = Math.min(26, slot * 0.55);
  const y = (v: number) => M.top + ih - (v / yMax) * ih;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="월별 일지 그래프">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 4" strokeWidth={1} />
          <text x={M.left - 7} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
            {t}
          </text>
        </g>
      ))}
      {summary.months.map((m, i) => {
        const cx = M.left + slot * i + slot / 2;
        const x = cx - barW / 2;
        let acc = 0;
        return (
          <g key={m.month}>
            {m.count > 0 &&
              (mode === "individual" ? (
                <rect x={x} y={y(m.count)} width={barW} height={y(0) - y(m.count)} rx={3} fill="var(--accent)" />
              ) : (
                summary.types.map((t) => {
                  const c = m.typeCounts[t] ?? 0;
                  if (c === 0) return null;
                  const y1 = y(acc + c);
                  const h = y(acc) - y1;
                  acc += c;
                  return <rect key={t} x={x} y={y1} width={barW} height={h} fill={TYPE_META[t]?.color ?? "#8a94a3"} />;
                })
              ))}
            {m.count > 0 && (
              <text x={cx} y={y(m.count) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--muted)">
                {m.count}
              </text>
            )}
            {i % 2 === 0 && (
              <text x={cx} y={H - M.bottom + 16} textAnchor="middle" fontSize={10} fill="var(--muted)">
                {String(m.month).padStart(2, "0")}
              </text>
            )}
            {i === 0 && (
              <text x={cx} y={H - M.bottom + 29} textAnchor="middle" fontSize={10} fill="var(--muted)">
                {summary.year}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * 연간 뷰: 좌 달력 그리드 / 우 그래프 + 총 개수
 * ------------------------------------------------------------------ */
export function CalendarView({
  entries,
  onShowAll,
}: {
  entries: CalendarEntry[];
  onShowAll: () => void;
}) {
  const years = useMemo(() => listYears(entries), [entries]);
  const [year, setYear] = useState(() => years[0] ?? new Date().getFullYear());
  const [mode, setMode] = useState<ChartMode>("individual");
  const summary = useMemo(() => buildYearSummary(entries, year), [entries, year]);

  // 데이터 없는 해로도 ±1년 이동 가능(빈 뷰). 드롭다운은 기록 있는 해만.
  const yearOptions = years.includes(year) ? years : [year, ...years];
  const half1 = summary.months.slice(0, 6);
  const half2 = summary.months.slice(6);

  return (
    <div style={cs.grid}>
      <div style={cs.card}>
        <div style={cs.yearNav}>
          <button style={cs.navBtn} onClick={() => setYear((y) => y - 1)} aria-label="이전 해">
            ‹
          </button>
          <select style={cs.yearSelect} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <button style={cs.navBtn} onClick={() => setYear((y) => y + 1)} aria-label="다음 해">
            ›
          </button>
        </div>
        <div style={cs.monthGrid}>
          {summary.months.map((m) => (
            <MonthCell key={m.month} m={m} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={cs.card}>
          <div style={cs.cardHead}>
            <b>{year}년 일지 그래프</b>
            <select style={cs.modeSelect} value={mode} onChange={(e) => setMode(e.target.value as ChartMode)}>
              <option value="individual">개별</option>
              <option value="byType">유형별</option>
            </select>
          </div>
          <MonthBarChart summary={summary} mode={mode} />
          {mode === "byType" && summary.types.length > 0 && (
            <div style={cs.legend}>
              {summary.types.map((t) => (
                <span key={t} style={cs.legendItem}>
                  <span style={{ ...cs.legendDot, background: TYPE_META[t]?.color ?? "#8a94a3" }} />
                  {TYPE_META[t]?.label ?? t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={cs.card}>
          <div style={cs.cardHead}>
            <b>{year}년 총 일지 개수</b>
          </div>
          <div style={cs.totalRow}>
            <div style={cs.bigTotal}>{summary.total}</div>
            <div style={cs.monthTableWrap}>
              {[half1, half2].map((half, hi) => (
                <div key={hi} style={cs.monthTable}>
                  {half.map((m) => (
                    <div key={m.month} style={cs.monthTableRow}>
                      <span>{m.month}월</span>
                      <span style={cs.monthTableCount}>{m.count}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <button style={cs.showAll} onClick={onShowAll}>
            모든 일지 보기
          </button>
        </div>
      </div>
    </div>
  );
}

const cs: Record<string, React.CSSProperties> = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, alignItems: "start" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, boxShadow: "var(--shadow)" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  yearNav: { display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 14 },
  navBtn: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "inherit", padding: "4px 12px", fontSize: 15, lineHeight: 1.2 },
  yearSelect: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)", color: "inherit", padding: "6px 10px", fontSize: 15, fontWeight: 700 },
  modeSelect: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)", color: "inherit", padding: "4px 8px", fontSize: 12 },
  monthGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 },
  cell: { display: "flex", flexDirection: "column", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-2)" },
  collage: { display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", aspectRatio: "3 / 4", gap: 1 },
  poster: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  cellLabel: { display: "flex", justifyContent: "center", alignItems: "baseline", gap: 5, padding: "6px 0", fontSize: 13, fontWeight: 700 },
  cellCount: { fontSize: 11, fontWeight: 600, color: "var(--muted)" },
  legend: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)" },
  legendDot: { width: 10, height: 10, borderRadius: 3, display: "inline-block" },
  totalRow: { display: "flex", gap: 18, alignItems: "flex-start" },
  bigTotal: { fontSize: 46, fontWeight: 800, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", lineHeight: 1 },
  monthTableWrap: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 22px", flex: 1 },
  monthTable: { display: "flex", flexDirection: "column" },
  monthTableRow: { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600 },
  monthTableCount: { color: "var(--muted)", fontVariantNumeric: "tabular-nums" },
  showAll: { marginTop: 16, width: "100%", border: 0, borderRadius: 10, padding: "11px 0", background: "linear-gradient(135deg,var(--accent),var(--accent-ink))", color: "#fff", fontWeight: 700, boxShadow: "0 4px 14px var(--accent-weak)" },
};
