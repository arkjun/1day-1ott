import type { Reaction } from "@1ott/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type EntryRow } from "../lib/api";
import { REACTION_META } from "../lib/reactions";
import { ReactionPicker } from "./RecordModal";

/** 최근 기록 한 줄: 인라인 수정(반응/감상/날짜) + 2단계 삭제. */
export function RecentItem({ entry, onChanged }: { entry: EntryRow; onChanged: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [watchedOn, setWatchedOn] = useState(entry.watchedOn);
  const [reaction, setReaction] = useState<Reaction | null>(entry.reaction);
  const [note, setNote] = useState(entry.note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.updateEntry(entry.id, {
        watchedOn,
        reaction: reaction ?? null,
        note: note.trim() || null,
      });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await api.deleteEntry(entry.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div style={st.entryEdit}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          {t(`type.${entry.type}`)} · {entry.title}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="date"
            style={{ ...st.input, width: 150 }}
            value={watchedOn}
            onChange={(e) => setWatchedOn(e.target.value)}
          />
          <ReactionPicker value={reaction} onChange={setReaction} />
        </div>
        <input
          style={{ ...st.input, width: "100%", marginTop: 8 }}
          placeholder={t("note.placeholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={st.primary} disabled={busy} onClick={save}>
            {t("common.save")}
          </button>
          <button style={st.ghost} onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={st.entryRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{entry.watchedOn}</b> · {t(`type.${entry.type}`)} ·{" "}
        <a href={`/c/${entry.contentId}`} style={{ color: "inherit" }}>{entry.title}</a>
        {entry.reaction ? ` · ${REACTION_META[entry.reaction].emoji}` : ""}
        {entry.note ? <span style={st.muted}> · {entry.note}</span> : null}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button style={st.smallBtn} onClick={() => setEditing(true)}>
          {t("common.edit")}
        </button>
        {confirmDel ? (
          <>
            <button style={{ ...st.smallBtn, color: "crimson" }} disabled={busy} onClick={del}>
              {t("common.confirmDelete")}
            </button>
            <button style={st.smallBtn} onClick={() => setConfirmDel(false)}>
              {t("common.cancel")}
            </button>
          </>
        ) : (
          <button style={st.smallBtn} onClick={() => setConfirmDel(true)}>
            {t("common.del")}
          </button>
        )}
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  muted: { color: "var(--muted)", fontSize: 12 },
  primary: {
    border: 0,
    borderRadius: 10,
    padding: "9px 16px",
    background: "linear-gradient(135deg,var(--accent),var(--accent-ink))",
    color: "#fff",
    fontWeight: 700,
    boxShadow: "0 4px 14px var(--accent-weak)",
  },
  ghost: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", background: "var(--surface)", color: "inherit" },
  entryRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  entryEdit: { padding: "12px", margin: "6px 0", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)" },
  smallBtn: { border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", background: "var(--surface)", color: "var(--muted)", fontSize: 12 },
  input: { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "inherit", fontSize: 14 },
};
