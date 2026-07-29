import type { ContentDetail, MyContentEntry } from "@1ott/shared";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type EntryRow } from "../lib/api";
import { useSession } from "../lib/authClient";
import { LanguageSelect } from "./LanguageSelect";
import { RecentItem } from "./RecentItem";
import { REACTION_META } from "../lib/reactions";
import { updatePageMetadata } from "../lib/seo";

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
  useEffect(() => {
    if (state === "notfound") {
      updatePageMetadata(
        window.location.pathname,
        i18n.resolvedLanguage ?? i18n.language,
        {
          title: `${t("content.notFoundTitle")} | ${t("common.serviceName")}`,
          robots: "noindex,nofollow",
        },
      );
      return;
    }
    if (!detail) return;
    updatePageMetadata(
      window.location.pathname,
      i18n.resolvedLanguage ?? i18n.language,
      {
        title: `${detail.title} | ${t("common.serviceName")}`,
        description:
          detail.facts.overview ??
          t("seo.contentDescription", { title: detail.title }),
      },
    );
  }, [detail, i18n.language, i18n.resolvedLanguage, state, t]);

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

  const f = detail.facts;
  // 제목 위 한 줄: 유형 · 연도 · 러닝타임/시즌·화수 · 방영상태
  const metaLine = [
    t(`type.${detail.type}`),
    f.year,
    f.seasons ? t("content.seasons", { count: f.seasons }) : undefined,
    f.episodes ? t("content.episodes", { count: f.episodes }) : undefined,
    f.runtime ? t("content.runtime", { count: f.runtime }) : undefined,
    statusLabel(f.status, t),
  ].filter(Boolean) as string[];
  const backdrop = backdropLayer(f.backdropUrl);

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

      <div style={st.heroBox}>
        {backdrop && <div style={backdrop} />}
        <div style={st.hero}>
          {detail.posterUrl && (
            <img src={detail.posterUrl} alt={detail.title} style={st.poster} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={st.muted}>{metaLine.join(" · ")}</div>
            <h1 style={{ margin: "4px 0 8px", letterSpacing: "-0.02em" }}>{detail.title}</h1>
            {f.tagline && <div style={st.tagline}>{f.tagline}</div>}
            {f.genres && f.genres.length > 0 && (
              <div style={st.chips}>
                {f.genres.map((g) => (
                  <span key={g} style={st.chip}>
                    {g}
                  </span>
                ))}
              </div>
            )}
            <div style={st.aggRow}>
              <span>👥 {t("content.viewers", { count: detail.viewerCount })}</span>
              <span>{REACTION_META.up.emoji} {detail.reactions.up}</span>
              <span>{REACTION_META.love.emoji} {detail.reactions.love}</span>
              <span>{REACTION_META.down.emoji} {detail.reactions.down}</span>
              {f.voteAverage != null && (
                <span>
                  ⭐ {t("content.tmdbScore", { score: f.voteAverage.toFixed(1) })}{" "}
                  {f.voteCount != null && (
                    <span style={st.muted}>{t("content.tmdbVotes", { count: f.voteCount })}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {f.overview && (
        <div style={st.card}>
          <div style={{ marginBottom: 8 }}>
            <b>{t("content.overview")}</b>
          </div>
          <p style={st.overview}>{f.overview}</p>
        </div>
      )}

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

      {/*
        TMDB API 이용약관 3조가 "the following notice" 로 지정한 문구.
        번역본이 원문을 대체해도 되는지 약관에 언급이 없어 영어 원문 그대로 둔다.
      */}
      <div style={st.attribution}>
        <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer noopener">
          <img src="/tmdb.svg" alt="TMDB" style={st.tmdbLogo} />
        </a>
        <span>
          This service uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise
          approved by TMDB.
        </span>
      </div>
    </div>
  );
}

// TMDB status 원문 → 번역 키. 매핑에 없으면 표시하지 않는다(영문 노출 방지).
const STATUS_KEY: Record<string, string> = {
  "Returning Series": "content.statusReturning",
  Ended: "content.statusEnded",
  Canceled: "content.statusCanceled",
  Planned: "content.statusPlanned",
  "In Production": "content.statusProduction",
};

function statusLabel(status: string | undefined, t: (k: string) => string): string | undefined {
  const key = status ? STATUS_KEY[status] : undefined;
  return key ? t(key) : undefined;
}

/**
 * backdrop 은 배경으로 은은하게만. 라이트/다크 테마가 모두 있어 고정 색 오버레이 대신
 * 이미지 자체를 옅게 깔아(별도 레이어) 어느 테마에서도 본문 대비를 유지한다.
 */
function backdropLayer(url: string | undefined): React.CSSProperties | null {
  if (!url) return null;
  return {
    position: "absolute",
    inset: 0,
    backgroundImage: `url(${url})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    opacity: 0.18,
    pointerEvents: "none",
  };
}

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 920, margin: "0 auto", padding: "28px 20px 60px" },
  top: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  heroBox: { position: "relative", overflow: "hidden", borderRadius: "var(--radius)", marginBottom: 20 },
  hero: { position: "relative", display: "flex", gap: 16, padding: 16 },
  tagline: { fontStyle: "italic", color: "var(--muted)", marginBottom: 10 },
  chips: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  chip: {
    fontSize: 12,
    padding: "3px 9px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--surface)",
  },
  overview: { margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" },
  attribution: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 28,
    fontSize: 12,
    color: "var(--muted)",
  },
  tmdbLogo: { height: 12, opacity: 0.8 },
  poster: { width: 120, aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" },
  aggRow: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 15, color: "var(--muted)" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginBottom: 16, boxShadow: "var(--shadow)" },
  muted: { color: "var(--muted)", fontSize: 13 },
  ghost: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", background: "var(--surface)", color: "inherit" },
};
