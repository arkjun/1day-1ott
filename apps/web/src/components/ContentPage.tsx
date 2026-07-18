import type { ContentDetail, MyContentEntry } from "@1ott/shared";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type EntryRow } from "../lib/api";
import { useSession } from "../lib/authClient";
import { LanguageSelect } from "./LanguageSelect";
import { RecentItem } from "./RecentItem";
import { REACTION_META } from "../lib/reactions";

export function ContentPage({ contentId }: { contentId: string }) {
  const { t, i18n } = useTranslation();
  const { data: session } = useSession();
  const [detail, setDetail] = useState<ContentDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [mine, setMine] = useState<MyContentEntry[]>([]);

  const loadDetail = useCallback(() => {
    api
      .content(contentId)
      .then((d) => {
        setDetail(d);
        setState("ok");
      })
      .catch(() => setState("notfound"));
  }, [contentId]);

  const loadMine = useCallback(() => {
    if (!session?.user) {
      setMine([]);
      return;
    }
    api.contentMine(contentId).then((r) => setMine(r.entries)).catch(() => setMine([]));
  }, [contentId, session?.user]);

  // 언어 바뀌면 제목 다시. 로그인/작품 바뀌면 내 기록 다시.
  useEffect(() => loadDetail(), [loadDetail, i18n.language]);
  useEffect(() => loadMine(), [loadMine]);

  function refresh() {
    loadDetail();
    loadMine();
  }

  if (state === "loading") return <p style={{ padding: 24 }}>{t("common.loading")}</p>;
  if (state === "notfound" || !detail)
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <h2>{t("content.notFoundTitle")}</h2>
        <a href="/">{t("profile.toHome")}</a>
      </div>
    );

  // /mine 응답을 RecentItem 이 기대하는 EntryRow 로 변환.
  const myRows: EntryRow[] = mine.map((m) => ({
    ...m,
    contentId,
    type: detail.type,
    title: detail.title,
    posterUrl: null,
  }));

  return (
    <div style={st.wrap}>
      <div style={st.top}>
        <a style={{ ...st.ghost, textDecoration: "none" }} href="/">
          ← {t("nav.home")}
        </a>
        <LanguageSelect />
      </div>

      <div style={st.hero}>
        {detail.posterUrl && (
          <img src={detail.posterUrl} alt={detail.title} style={st.poster} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={st.muted}>{t(`type.${detail.type}`)}</div>
          <h1 style={{ margin: "4px 0 12px", letterSpacing: "-0.02em" }}>{detail.title}</h1>
          <div style={st.aggRow}>
            <span>👥 {t("content.viewers", { count: detail.viewerCount })}</span>
            <span>{REACTION_META.up.emoji} {detail.reactions.up}</span>
            <span>{REACTION_META.love.emoji} {detail.reactions.love}</span>
            <span>{REACTION_META.down.emoji} {detail.reactions.down}</span>
          </div>
        </div>
      </div>

      {session?.user && (
        <div style={st.card}>
          <div style={{ marginBottom: 12 }}>
            <b>{t("content.myRecords")}</b>
          </div>
          {myRows.length > 0 ? (
            myRows.map((e) => <RecentItem key={e.id} entry={e} onChanged={refresh} />)
          ) : (
            <div style={st.muted}>{t("content.myEmpty")}</div>
          )}
        </div>
      )}
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 780, margin: "0 auto", padding: "28px 20px 60px" },
  top: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  hero: { display: "flex", gap: 16, marginBottom: 20 },
  poster: { width: 120, aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" },
  aggRow: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 15, color: "var(--muted)" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginBottom: 16, boxShadow: "var(--shadow)" },
  muted: { color: "var(--muted)", fontSize: 13 },
  ghost: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", background: "var(--surface)", color: "inherit" },
};
