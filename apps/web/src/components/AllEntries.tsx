import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EntryRow } from "../lib/api";
import { filterEntries } from "../lib/allEntries";
import { RecentItem } from "./RecentItem";

/** 한 번에 그릴 행 수. 기록은 계속 쌓이므로 스크롤 대신 눌러서 늘린다. */
export const PAGE_SIZE = 50;

/** 전체 기록 목록 — 검색 + 점진 로딩. 행 편집/삭제는 RecentItem 이 그대로 담당. */
export function AllEntries({
  entries,
  initialQuery = "",
  onChanged,
}: {
  entries: EntryRow[];
  initialQuery?: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const filtered = useMemo(() => filterEntries(entries, query), [entries, query]);
  const visible = filtered.slice(0, limit);

  return (
    <div style={st.card}>
      <div style={st.cardHead}>
        <b>{t("all.title")}</b>
        <span style={st.muted}>{t("count.entry", { count: filtered.length })}</span>
      </div>
      <input
        style={st.search}
        placeholder={t("all.search")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(PAGE_SIZE);
        }}
      />
      <div>
        {visible.map((e) => (
          <RecentItem key={e.id} entry={e} onChanged={onChanged} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div style={st.muted}>{entries.length === 0 ? t("all.empty") : t("all.noMatch")}</div>
      )}
      {filtered.length > visible.length && (
        <button style={st.more} onClick={() => setLimit((n) => n + PAGE_SIZE)}>
          {t("all.more", { count: filtered.length - visible.length })}
        </button>
      )}
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginBottom: 16, boxShadow: "var(--shadow)" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  muted: { color: "var(--muted)", fontSize: 12 },
  search: { width: "100%", boxSizing: "border-box", padding: "10px 12px", marginBottom: 8, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "inherit", fontSize: 14 },
  more: { marginTop: 14, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 0", background: "var(--surface-2)", color: "inherit", fontWeight: 700, fontSize: 14 },
};
