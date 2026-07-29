import type { PublicProfile as Profile } from "@1ott/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ActivityCalendar from "react-activity-calendar";
import { api } from "../lib/api";
import { activityLabels } from "../i18n/format";
import { LanguageSelect } from "./LanguageSelect";
import { GREEN, buildYear, currentStreak, isoDaysAgo } from "../lib/heatmap";
import { useTheme } from "../lib/theme";

interface PublicProfileActionsProps {
  scheme: "light" | "dark";
  copied: boolean;
  onToggle: () => void;
  onCopyLink: () => void;
}

export function PublicProfileActions({
  scheme,
  copied,
  onToggle,
  onCopyLink,
}: PublicProfileActionsProps) {
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <LanguageSelect />
      <button
        style={st.iconBtn}
        onClick={onToggle}
        aria-label={t("action.toggleTheme")}
        title={t("action.toggleTheme")}
      >
        {scheme === "dark" ? "☀️" : "🌙"}
      </button>
      <button style={st.ghost} onClick={onCopyLink}>
        {copied ? t("common.copied") : t("share.copyLink")}
      </button>
    </div>
  );
}

export function PublicProfile({ username }: { username: string }) {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [copied, setCopied] = useState(false);
  const { resolved: scheme, toggle } = useTheme();

  // 언어가 바뀌면 포스터 제목도 그 언어로 다시 받아온다.
  useEffect(() => {
    api
      .publicProfile(username)
      .then((p) => {
        setProfile(p);
        setState("ok");
      })
      .catch(() => setState("notfound"));
  }, [username, i18n.language]);

  if (state === "loading") return <p style={{ padding: 24 }}>{t("common.loading")}</p>;
  if (state === "notfound" || !profile)
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <h2>{t("profile.notFoundTitle")}</h2>
        <p style={{ color: "var(--muted)" }}>{t("profile.notFoundBody")}</p>
        <a href="/">{t("profile.toHome")}</a>
      </div>
    );

  const cells = profile.cells;
  const streak = currentStreak(cells);
  const thisMonth = cells
    .filter((c) => c.date.startsWith(isoDaysAgo(0).slice(0, 7)))
    .reduce((a, c) => a + c.count, 0);
  const year = buildYear(cells);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={st.wrap}>
      <div style={st.top}>
        <div>
          <div style={{ fontSize: 12, color: "#8890a0" }}>
            🌱 {t("common.serviceName")}
          </div>
          <h1 style={{ margin: "2px 0 0" }}>@{profile.username}</h1>
        </div>
        <PublicProfileActions
          scheme={scheme}
          copied={copied}
          onToggle={toggle}
          onCopyLink={copyLink}
        />
      </div>

      <div style={st.stats}>
        <Stat k={t("stat.streak")} v={streak} unit={t("unit.day", { count: streak })} accent />
        <Stat k={t("stat.thisMonth")} v={thisMonth} unit={t("unit.entry", { count: thisMonth })} />
        <Stat k={t("stat.total")} v={profile.total} unit={t("unit.entry", { count: profile.total })} />
      </div>

      <div style={st.card}>
        <div style={st.cardHead}>
          <b>{t("heatmap.title")}</b>
          <span style={st.muted}>{t("heatmap.hint")}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <ActivityCalendar
            data={year}
            colorScheme={scheme}
            theme={GREEN}
            blockSize={12}
            blockMargin={3}
            labels={activityLabels(i18n.language)}
          />
        </div>
      </div>

      {profile.posters.length > 0 && (
        <div style={st.card}>
          <div style={st.cardHead}>
            <b>{t("posters.title")}</b>
          </div>
          <div style={st.posterGrid}>
            {profile.posters
              .filter((p) => p.posterUrl)
              .map((p) => (
                <a key={p.id} href={`/c/${p.contentId}`} style={{ display: "block" }}>
                  <img src={p.posterUrl!} alt={p.title} title={p.title} style={st.poster} />
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, unit, accent }: { k: string; v: number; unit: string; accent?: boolean }) {
  return (
    <div style={st.tile}>
      <div style={st.tileK}>{k}</div>
      <div style={{ ...st.tileV, color: accent ? "#ff5a36" : "inherit" }}>
        {v}
        <small style={st.tileU}>{unit}</small>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 920, margin: "0 auto", padding: "28px 20px 60px" },
  top: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  stats: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 },
  tile: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", boxShadow: "var(--shadow)" },
  tileK: { fontSize: 12, color: "var(--muted)" },
  tileV: { marginTop: 6, fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
  tileU: { fontSize: 13, fontWeight: 600, color: "var(--muted)", marginLeft: 3 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginBottom: 16, boxShadow: "var(--shadow)" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  muted: { color: "var(--muted)", fontSize: 12 },
  posterGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(78px,1fr))", gap: 10 },
  poster: { width: "100%", aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" },
  ghost: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", background: "var(--surface)", color: "inherit" },
  iconBtn: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", background: "var(--surface)", lineHeight: 1 },
};
