import { contentTypes, type ContentType, type EntryInput, type Reaction, type SearchResult } from "@1ott/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { RecentContent } from "../lib/recentContents";
import { REACTION_META, REACTION_ORDER } from "../lib/reactions";

type PickedContent = SearchResult & { contentId?: string };
type RecordTab = ContentType | "all";

const recordTabs: readonly RecordTab[] = ["all", ...contentTypes];
const searchableTypes: readonly RecordTab[] = [
  "all",
  "movie",
  "tv",
  "variety",
  "documentary",
  "anime",
];

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 장르 id → 로케일 이름(앞 3개). 매핑 없는 id는 버림. */
function useGenreNames() {
  const { t } = useTranslation();
  return (ids?: number[]) =>
    (ids ?? [])
      .slice(0, 3)
      .map((id) => t(`genre.${id}`, { defaultValue: "" }))
      .filter(Boolean);
}

/** 넷플릭스식 반응 선택기(토글). */
export function ReactionPicker({
  value,
  onChange,
}: {
  value: Reaction | null;
  onChange: (r: Reaction | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {REACTION_ORDER.map((r) => {
        const on = value === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(on ? null : r)}
            title={t(`reaction.${r}`)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 11px",
              borderRadius: 999,
              border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
              background: on ? "var(--accent-weak)" : "var(--surface-2)",
              color: "inherit",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <span>{REACTION_META[r].emoji}</span>
            <span>{t(`reaction.${r}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RecordModal({
  recentContents,
  onClose,
  onSaved,
}: {
  recentContents: RecentContent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const genreNames = useGenreNames();
  const [type, setType] = useState<RecordTab>("all");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<PickedContent | null>(null);
  const [ytUrl, setYtUrl] = useState("");
  const [tmdbOff, setTmdbOff] = useState(false);
  const [watchedOn, setWatchedOn] = useState(todayStr());
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [note, setNote] = useState("");
  const [isNotePublic, setIsNotePublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const searchable = searchableTypes.includes(type);
  const recentContentsForType = recentContents.filter((content) =>
    type === "all"
      ? searchableTypes.includes(content.type)
      : content.type === type,
  );

  // 디바운스 TMDB 검색
  useEffect(() => {
    if (!searchable || picked) return;
    let cancelled = false;
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.search(term, type);
        if (cancelled) return;
        setResults(r.results);
        setTmdbOff(false);
      } catch {
        if (cancelled) return;
        setResults([]);
        setTmdbOff(true); // 503 등: 토큰 미설정 → 직접입력 폴백
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
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
      setErr(t("modal.ytError"));
    }
  }

  async function save() {
    setErr(null);
    let input: EntryInput | null = null;
    if (picked) {
      input = {
        contentId: picked.contentId,
        type: picked.type,
        title: picked.title,
        tmdbId: picked.tmdbId,
        ytId: picked.ytId,
        posterUrl: picked.posterUrl,
        watchedOn,
        reaction: reaction ?? undefined,
        note: note.trim() || undefined,
        isNotePublic,
      };
    } else if (q.trim()) {
      if (type === "all") {
        setErr(t("modal.needCategory"));
        return;
      }
      input = {
        type: type === "youtube" ? "youtube" : type,
        title: q.trim(),
        watchedOn,
        reaction: reaction ?? undefined,
        note: note.trim() || undefined,
        isNotePublic,
      };
    }
    if (!input) {
      setErr(t("modal.needTitle"));
      return;
    }
    setBusy(true);
    try {
      await api.createEntry(input);
      onSaved();
      onClose();
    } catch {
      setErr(t("modal.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div
        className="record-modal"
        style={S.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={S.head}>
          <b>{t("modal.title")}</b>
          <button style={S.x} onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>

        {/* 유형 탭 */}
        <div style={S.tabs}>
          {recordTabs.map((ct) => (
            <button
              key={ct}
              onClick={() => {
                setType(ct);
                reset();
              }}
              style={{ ...S.tab, ...(type === ct ? S.tabOn : {}) }}
            >
              {t(`type.${ct}`)}
            </button>
          ))}
        </div>

        {!picked &&
          !q.trim() &&
          !ytUrl.trim() &&
          recentContentsForType.length > 0 && (
          <div style={S.recentSection}>
            <div style={S.recentLabel}>{t("modal.recentContents")}</div>
            <div style={S.recentList}>
              {recentContentsForType.map((content) => (
                <button
                  key={content.contentId}
                  type="button"
                  style={S.recentCard}
                  aria-label={t("modal.pickRecent", { title: content.title })}
                  title={content.title}
                  onClick={() =>
                    setPicked({
                      contentId: content.contentId,
                      type: content.type,
                      title: content.title,
                      posterUrl: content.posterUrl ?? undefined,
                    })
                  }
                >
                  {content.posterUrl ? (
                    <img src={content.posterUrl} alt="" style={S.recentPoster} />
                  ) : (
                    <span style={S.recentPlaceholder} aria-hidden="true">
                      {t(`type.${content.type}`).slice(0, 1)}
                    </span>
                  )}
                  <span style={S.recentTitle}>{content.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 입력 영역 */}
        {picked ? (
          <div style={S.preview}>
            {picked.posterUrl && (
              <img src={picked.posterUrl} alt="" style={S.posterSm} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{picked.title}</div>
              <div style={S.muted}>
                {t(`type.${picked.type}`)}
                {picked.year ? ` · ${picked.year}` : ""}
                {picked.rating ? ` · ★ ${picked.rating.toFixed(1)}` : ""}
                {picked.subtitle ? ` · ${picked.subtitle}` : ""}
                {genreNames(picked.genreIds).length
                  ? ` · ${genreNames(picked.genreIds).join(", ")}`
                  : ""}
              </div>
              {picked.overview && <div style={S.clamp3}>{picked.overview}</div>}
            </div>
            <button style={S.link} onClick={reset}>
              {t("common.change")}
            </button>
          </div>
        ) : type === "youtube" ? (
          <div style={S.row}>
            <input
              style={S.input}
              placeholder={t("modal.ytPlaceholder")}
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupYt()}
            />
            <button style={S.btn} onClick={lookupYt}>
              {t("action.fetch")}
            </button>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <input
              style={S.input}
              placeholder={
                type === "all"
                  ? t("modal.searchAllPlaceholder")
                  : searchable
                    ? t("modal.searchPlaceholder")
                    : t("modal.manualPlaceholder")
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            {searchable && tmdbOff && (
              <div style={S.hint}>{t("modal.tmdbOff")}</div>
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
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div style={S.muted}>
                        {type === "all" && (
                          <span style={S.typeBadge}>{t(`type.${r.type}`)}</span>
                        )}
                        {r.rating ? `★ ${r.rating.toFixed(1)}` : ""}
                        {r.rating && r.year ? " · " : ""}
                        {r.year ?? ""}
                        {genreNames(r.genreIds).length
                          ? ` · ${genreNames(r.genreIds).join(", ")}`
                          : ""}
                      </div>
                      {r.overview && <div style={S.clamp2}>{r.overview}</div>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 메타 */}
        <div style={{ marginTop: 12 }}>
          <label style={{ ...S.field, maxWidth: 180 }}>
            <span style={S.muted}>{t("modal.date")}</span>
            <input
              type="date"
              style={S.input}
              value={watchedOn}
              onChange={(e) => setWatchedOn(e.target.value)}
            />
          </label>
          <div style={{ marginTop: 10 }}>
            <div style={{ ...S.muted, marginBottom: 6 }}>{t("modal.reactionPrompt")}</div>
            <ReactionPicker value={reaction} onChange={setReaction} />
          </div>
        </div>
        <input
          style={{ ...S.input, marginTop: 8 }}
          placeholder={t("note.placeholderOptional")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <label style={S.visibility}>
          <input
            type="checkbox"
            checked={isNotePublic}
            onChange={(e) => setIsNotePublic(e.target.checked)}
          />
          <span>
            <b>{t("note.visibility")}</b>
            <span style={{ ...S.muted, display: "block" }}>
              {t("note.visibilityHint")}
            </span>
          </span>
        </label>

        {err && <div style={{ color: "crimson", marginTop: 8 }}>{err}</div>}

        <button
          style={{ ...S.btn, ...S.save, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={save}
        >
          {t("action.submitRecord")}
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
  recentSection: { marginBottom: 14 },
  recentLabel: { color: "var(--muted)", fontSize: 12, marginBottom: 6 },
  recentList: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    padding: "2px 2px 4px",
  },
  recentCard: {
    flex: "0 0 64px",
    minWidth: 64,
    padding: 4,
    border: "1px solid transparent",
    borderRadius: 8,
    background: "transparent",
    color: "inherit",
    textAlign: "center",
  },
  recentPoster: {
    display: "block",
    width: 56,
    height: 84,
    borderRadius: 6,
    objectFit: "cover",
  },
  recentPlaceholder: {
    display: "grid",
    placeItems: "center",
    width: 56,
    height: 84,
    borderRadius: 6,
    background: "var(--surface-2)",
    color: "var(--muted)",
    fontSize: 20,
    fontWeight: 700,
  },
  recentTitle: {
    display: "block",
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12,
  },
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
  typeBadge: {
    display: "inline-block",
    marginRight: 6,
    padding: "1px 6px",
    borderRadius: 999,
    background: "var(--accent-weak)",
    color: "var(--accent-ink)",
    fontWeight: 700,
  },
  clamp2: {
    color: "var(--muted)",
    fontSize: 12,
    marginTop: 3,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  clamp3: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 1.45,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
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
  visibility: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    fontSize: 13,
  },
};
