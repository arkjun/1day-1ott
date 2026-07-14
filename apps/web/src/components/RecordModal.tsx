import { contentTypes, type ContentType, type EntryInput, type SearchResult } from "@1ott/shared";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

const TYPE_LABEL: Record<ContentType, string> = {
  movie: "영화",
  tv: "드라마",
  anime: "애니",
  youtube: "유튜브",
  other: "직접입력",
};

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const RATINGS = ["", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1", "0.5"];

export function RecordModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ContentType>("movie");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [ytUrl, setYtUrl] = useState("");
  const [tmdbOff, setTmdbOff] = useState(false);
  const [watchedOn, setWatchedOn] = useState(todayStr());
  const [rating, setRating] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const searchable = type === "movie" || type === "tv" || type === "anime";

  // 디바운스 TMDB 검색
  useEffect(() => {
    if (!searchable || picked) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.search(term, type);
        setResults(r.results);
        setTmdbOff(false);
      } catch {
        setResults([]);
        setTmdbOff(true); // 503 등: 토큰 미설정 → 직접입력 폴백
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, type, searchable, picked]);

  function reset() {
    setPicked(null);
    setResults([]);
    setQ("");
    setYtUrl("");
  }

  async function lookupYt() {
    setErr(null);
    try {
      const r = await api.yt(ytUrl.trim());
      setPicked(r.result);
    } catch {
      setErr("유튜브 URL을 인식하지 못했습니다.");
    }
  }

  async function save() {
    setErr(null);
    let input: EntryInput | null = null;
    if (picked) {
      input = {
        type: picked.type,
        title: picked.title,
        tmdbId: picked.tmdbId,
        ytId: picked.ytId,
        posterUrl: picked.posterUrl,
        watchedOn,
        rating: rating ? Number(rating) : undefined,
        note: note.trim() || undefined,
      };
    } else if (q.trim()) {
      input = {
        type: type === "youtube" ? "youtube" : type,
        title: q.trim(),
        watchedOn,
        rating: rating ? Number(rating) : undefined,
        note: note.trim() || undefined,
      };
    }
    if (!input) {
      setErr("제목을 선택하거나 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      await api.createEntry(input);
      onSaved();
      onClose();
    } catch {
      setErr("저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <b>오늘 뭐 봤어요?</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {/* 유형 탭 */}
        <div style={S.tabs}>
          {contentTypes.map((t) => (
            <button
              key={t}
              onClick={() => {
                setType(t);
                reset();
              }}
              style={{ ...S.tab, ...(type === t ? S.tabOn : {}) }}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {/* 입력 영역 */}
        {picked ? (
          <div style={S.preview}>
            {picked.posterUrl && (
              <img src={picked.posterUrl} alt="" style={S.posterSm} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{picked.title}</div>
              <div style={S.muted}>
                {TYPE_LABEL[picked.type]}
                {picked.year ? ` · ${picked.year}` : ""}
                {picked.subtitle ? ` · ${picked.subtitle}` : ""}
              </div>
            </div>
            <button style={S.link} onClick={reset}>
              변경
            </button>
          </div>
        ) : type === "youtube" ? (
          <div style={S.row}>
            <input
              style={S.input}
              placeholder="YouTube URL 붙여넣기"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupYt()}
            />
            <button style={S.btn} onClick={lookupYt}>
              가져오기
            </button>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <input
              style={S.input}
              placeholder={
                searchable ? "제목 검색 (TMDB)" : "제목 직접 입력"
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            {searchable && tmdbOff && (
              <div style={S.hint}>
                TMDB 토큰 미설정 — 지금은 직접 입력으로 저장됩니다.
              </div>
            )}
            {results.length > 0 && (
              <div style={S.dropdown}>
                {results.map((r) => (
                  <button
                    key={`${r.type}-${r.tmdbId}`}
                    style={S.option}
                    onClick={() => setPicked(r)}
                  >
                    {r.posterUrl ? (
                      <img src={r.posterUrl} alt="" style={S.optPoster} />
                    ) : (
                      <div style={{ ...S.optPoster, background: "#3334" }} />
                    )}
                    <span>
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div style={S.muted}>{r.year ?? ""}</div>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 메타 */}
        <div style={{ ...S.row, marginTop: 12 }}>
          <label style={S.field}>
            <span style={S.muted}>날짜</span>
            <input
              type="date"
              style={S.input}
              value={watchedOn}
              onChange={(e) => setWatchedOn(e.target.value)}
            />
          </label>
          <label style={S.field}>
            <span style={S.muted}>별점</span>
            <select
              style={S.input}
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            >
              {RATINGS.map((v) => (
                <option key={v} value={v}>
                  {v ? `★ ${v}` : "—"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <input
          style={{ ...S.input, marginTop: 8 }}
          placeholder="한 줄 감상 (선택)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {err && <div style={{ color: "crimson", marginTop: 8 }}>{err}</div>}

        <button
          style={{ ...S.btn, ...S.save, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={save}
        >
          기록하기
        </button>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(480px, 100%)",
    background: "var(--surface, #fff)",
    color: "var(--text, inherit)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
  },
  head: { display: "flex", justifyContent: "space-between", marginBottom: 14 },
  x: { border: 0, background: "none", cursor: "pointer", fontSize: 16, color: "var(--muted)" },
  tabs: { display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" },
  tab: {
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "inherit",
    borderRadius: 999,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
  },
  tabOn: { background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" },
  row: { display: "flex", gap: 8 },
  field: { flex: 1, display: "grid", gap: 4, fontSize: 12 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "inherit",
    fontSize: 14,
    boxSizing: "border-box",
  },
  hint: { fontSize: 12, color: "var(--accent-ink)", marginTop: 6 },
  dropdown: {
    marginTop: 6,
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    maxHeight: 280,
    overflowY: "auto",
    background: "var(--surface)",
  },
  option: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    width: "100%",
    textAlign: "left",
    padding: 8,
    border: 0,
    borderBottom: "1px solid var(--border)",
    background: "none",
    color: "inherit",
    cursor: "pointer",
  },
  optPoster: { width: 34, height: 51, borderRadius: 4, objectFit: "cover" },
  preview: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    padding: 10,
    border: "1px solid var(--border)",
    borderRadius: 10,
  },
  posterSm: { width: 46, height: 69, borderRadius: 6, objectFit: "cover" },
  muted: { color: "var(--muted)", fontSize: 12 },
  link: { border: 0, background: "none", color: "var(--accent-ink)", cursor: "pointer" },
  btn: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "10px 16px",
    background: "var(--surface-2)",
    color: "inherit",
    cursor: "pointer",
    fontSize: 14,
  },
  save: {
    width: "100%",
    marginTop: 16,
    background: "linear-gradient(135deg,var(--accent),var(--accent-ink))",
    color: "#fff",
    fontWeight: 700,
    padding: 12,
  },
};
