import type { HeatmapCell } from "@1ott/shared";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import ActivityCalendar from "react-activity-calendar";
import { useTranslation } from "react-i18next";
import { AllEntries } from "./components/AllEntries";
import { AnalyticsConsentBanner } from "./components/AnalyticsConsent";
import { CalendarView } from "./components/CalendarView";
import { ContentPage } from "./components/ContentPage";
import { MyPage } from "./components/MyPage";
import { PublicProfile } from "./components/PublicProfile";
import { RecentItem } from "./components/RecentItem";
import { RecordModal } from "./components/RecordModal";
import { SiteFooter } from "./components/SiteFooter";
import { activityLabels } from "./i18n/format";
import { LanguageSelect } from "./components/LanguageSelect";
import { LandingPreview } from "./components/LandingPreview";
import { api, type EntryRow } from "./lib/api";
import { signIn, signOut, signUp, useSession } from "./lib/authClient";
import { buildTypeBreakdown } from "./lib/breakdown";
import { GREEN, buildYear, currentStreak, isoDaysAgo } from "./lib/heatmap";
import { useTheme } from "./lib/theme";
import { TYPE_META } from "./lib/typeMeta";
import { pickRecentContents } from "./lib/recentContents";
import {
  denyGoogleAnalytics,
  grantGoogleAnalytics,
  isAnalyticsConfigured,
  readAnalyticsConsent,
  scheduleGoogleAnalytics,
  type AnalyticsConsent,
} from "./lib/analytics";
import { updatePageMetadata } from "./lib/seo";

const LegalPage = lazy(() =>
  import("./components/LegalPage").then((module) => ({
    default: module.LegalPage,
  })),
);

interface SessionUser {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  isPublic?: boolean | null;
  lang?: string | null;
}

function Stat({ k, v, unit, accent }: { k: string; v: number; unit: string; accent?: boolean }) {
  return (
    <div style={{ ...st.tile }}>
      <div style={st.tileK}>{k}</div>
      <div style={{ ...st.tileV, color: accent ? "#ff5a36" : "inherit" }}>
        {v}
        <small style={st.tileU}>{unit}</small>
      </div>
    </div>
  );
}

function Dashboard({ user }: { user: SessionUser }) {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"home" | "calendar" | "all">("home");
  const { resolved: scheme } = useTheme();

  async function refresh() {
    const [e, h] = await Promise.all([api.listEntries(), api.heatmap()]);
    setEntries(e.entries);
    setCells(h.cells);
  }
  // 언어가 바뀌면 저장된 작품 제목도 그 언어로 다시 받아온다.
  useEffect(() => {
    refresh().catch(console.error);
  }, [i18n.language]);

  const year = useMemo(() => buildYear(cells), [cells]);
  const streak = useMemo(() => currentStreak(cells), [cells]);
  // 잔디 진입 시 오늘(오른쪽 끝)이 보이도록. 왼쪽으로 밀면 과거.
  // react-activity-calendar 는 자체 내부 스크롤 컨테이너를 렌더하므로,
  // 바깥 div 가 아니라 그 컨테이너를 끝으로 보낸다. 콜백 ref 라 재마운트마다 실행.
  const heatmapRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const sc = el.querySelector<HTMLElement>(
      ".react-activity-calendar__scroll-container",
    );
    if (sc) sc.scrollLeft = sc.scrollWidth;
  }, []);
  const thisMonth = useMemo(() => {
    const pre = isoDaysAgo(0).slice(0, 7);
    return entries.filter((e) => e.watchedOn.startsWith(pre)).length;
  }, [entries]);
  const breakdown = useMemo(() => {
    return buildTypeBreakdown(entries);
  }, [entries]);
  const posters = entries.filter((e) => e.posterUrl).slice(0, 12);
  const recentContents = useMemo(() => pickRecentContents(entries), [entries]);

  return (
    <div style={{ ...st.wrap, maxWidth: view === "calendar" ? 1080 : 920 }}>
      <div style={st.top}>
        <b style={{ fontSize: 18, letterSpacing: "-0.02em" }}>
          🌱 {t("common.serviceName")}
        </b>
        <div style={{ display: "flex", gap: 8 }}>
          <a style={{ ...st.ghost, textDecoration: "none" }} href="/me">
            {t("nav.myPage")}
          </a>
          <button style={st.primary} onClick={() => setOpen(true)}>
            {t("action.addRecord")}
          </button>
          <button style={st.ghost} onClick={() => signOut()}>
            {t("action.logout")}
          </button>
        </div>
      </div>

      <div style={st.viewTabs}>
        {(["home", "calendar", "all"] as const).map((v) => (
          <button
            key={v}
            style={{ ...st.viewTab, ...(view === v ? st.viewTabActive : {}) }}
            onClick={() => setView(v)}
          >
            {t(`nav.${v}`)}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <CalendarView entries={entries} onShowAll={() => setView("all")} />
      ) : view === "all" ? (
        <AllEntries entries={entries} onChanged={refresh} />
      ) : (
        <>
      <div style={st.stats}>
        <Stat k={t("stat.streak")} v={streak} unit={t("unit.day", { count: streak })} accent />
        <Stat k={t("stat.thisMonth")} v={thisMonth} unit={t("unit.entry", { count: thisMonth })} />
        <Stat k={t("stat.total")} v={entries.length} unit={t("unit.entry", { count: entries.length })} />
      </div>

      <div style={st.card}>
        <div style={st.cardHead}>
          <b>{t("heatmap.title")}</b>
          <span style={st.muted}>{t("heatmap.hint")}</span>
        </div>
        <div ref={heatmapRef} style={{ overflowX: "auto" }}>
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

      {posters.length > 0 && (
        <div style={st.card}>
          <div style={st.cardHead}>
            <b>{t("posters.title")}</b>
            <span style={st.muted}>{t("posters.recent")}</span>
          </div>
          <div style={st.posterGrid}>
            {posters.map((e) => (
              <a key={e.id} href={`/c/${e.contentId}`} style={{ display: "block" }}>
                <img src={e.posterUrl!} alt={e.title} title={e.title} style={st.poster} />
              </a>
            ))}
          </div>
        </div>
      )}

      {breakdown.length > 0 && (
        <div style={st.card}>
          <div style={st.cardHead}>
            <b>{t("byType.title")}</b>
            <span style={st.muted}>{t("byType.total", { count: entries.length })}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {breakdown.map((b) => (
              <div key={b.type}>
                <div style={st.bdRow}>
                  <span>{t(`type.${b.type}`)}</span>
                  <span style={st.muted}>
                    {b.type === "tv"
                      ? `${t("count.work", { count: b.workCount })} · ${t("count.totalEntry", { count: b.count })} · ${b.pct}%`
                      : `${t("count.entry", { count: b.count })} · ${b.pct}%`}
                  </span>
                </div>
                <div style={st.bdTrack}>
                  <div
                    style={{
                      ...st.bdFill,
                      width: `${b.pct}%`,
                      background: TYPE_META[b.type]?.bar ?? "#8a94a3",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={st.card}>
        <div style={st.cardHead}>
          <b>{t("recent.title")}</b>
        </div>
        <div>
          {entries.slice(0, 20).map((e) => (
            <RecentItem key={e.id} entry={e} onChanged={refresh} />
          ))}
          {entries.length === 0 && <div style={st.muted}>{t("recent.empty")}</div>}
        </div>
      </div>
        </>
      )}

      {open && (
        <RecordModal
          recentContents={recentContents}
          onClose={() => setOpen(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function Auth() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    const res =
      mode === "up"
        ? await signUp.email({ email, password, name: name || email })
        : await signIn.email({ email, password });
    if (res.error) setErr(res.error.message ?? t("auth.failed"));
  }

  async function passkeyLogin() {
    setErr(null);
    const res = await signIn.passkey();
    if (res?.error) setErr(t("passkey.signinFailed"));
  }

  const features = [
    { t: t("landing.feat1Title"), b: t("landing.feat1Body") },
    { t: t("landing.feat2Title"), b: t("landing.feat2Body") },
    { t: t("landing.feat3Title"), b: t("landing.feat3Body") },
  ];

  return (
    <div style={st.landing}>
      <div style={st.landingBar}>
        <b style={{ fontSize: 18, letterSpacing: "-0.02em" }}>
          🌱 {t("common.serviceName")}
        </b>
        <LanguageSelect />
      </div>

      <div className="landing-hero" style={st.hero}>
        <div style={st.heroCopy}>
          <span style={st.badge}>{t("landing.badge")}</span>
          <h1 style={st.heroH1}>{t("landing.headline")}</h1>
          <p style={st.heroSub}>{t("landing.sub")}</p>
        </div>

        <div style={st.loginCard}>
          <div style={st.cardHead}>
            <b>{t("landing.loginTitle")}</b>
          </div>
          <p style={{ ...st.muted, marginTop: -6, marginBottom: 14 }}>{t("landing.loginSub")}</p>
          <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
            {mode === "up" && (
              <input style={st.input} placeholder={t("auth.name")} value={name} onChange={(e) => setName(e.target.value)} />
            )}
            <input style={st.input} placeholder={t("auth.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input
              style={st.input}
              placeholder={t("auth.password")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "up" ? (
              <p className="signup-agreement">
                {t("auth.agreementPrefix")}{" "}
                <a href="/terms">{t("footer.terms")}</a>
                {t("auth.agreementAnd")}
                <a href="/privacy">{t("footer.privacy")}</a>
                {t("auth.agreementSuffix")}
              </p>
            ) : null}
            <button style={st.primary} type="submit">
              {mode === "up" ? t("auth.signup") : t("auth.signin")}
            </button>
          </form>
          <button style={{ ...st.ghost, width: "100%", marginTop: 8 }} onClick={passkeyLogin}>
            🔑 {t("passkey.signin")}
          </button>
          {err && <p style={{ color: "crimson" }}>{err}</p>}
          <button style={{ ...st.ghost, marginTop: 12, width: "100%" }} onClick={() => setMode((m) => (m === "in" ? "up" : "in"))}>
            {mode === "in" ? t("auth.toSignup") : t("auth.toSignin")}
          </button>
        </div>
      </div>

      <LandingPreview />

      <div style={st.features}>
        {features.map((f) => (
          <div key={f.t} style={st.card}>
            <b style={{ fontSize: 16 }}>{f.t}</b>
            <p style={{ ...st.muted, fontSize: 14, marginTop: 8, marginBottom: 0 }}>{f.b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthedApp() {
  const { t } = useTranslation();
  const { data: session, isPending } = useSession();
  if (isPending) return <p style={{ padding: 24 }}>{t("common.loading")}</p>;
  if (!session?.user) return <Auth />;
  const user = session.user as SessionUser;
  if (window.location.pathname === "/me") return <MyPage user={user} />;
  return <Dashboard user={user} />;
}

function AppContent() {
  const path = window.location.pathname;
  if (path === "/privacy" || path === "/terms") {
    return (
      <Suspense fallback={<p style={{ padding: 24 }}>로딩…</p>}>
        <LegalPage kind={path === "/privacy" ? "privacy" : "terms"} />
      </Suspense>
    );
  }
  if (path.startsWith("/u/")) {
    const username = decodeURIComponent(path.slice(3).split("/")[0] ?? "");
    if (username) return <PublicProfile username={username} />;
  }
  if (path.startsWith("/c/")) {
    const id = decodeURIComponent(path.slice(3).split("/")[0] ?? "");
    if (id) return <ContentPage contentId={id} />;
  }
  return <AuthedApp />;
}

export function App() {
  const { i18n } = useTranslation();
  const analyticsConfigured = isAnalyticsConfigured();
  const [analyticsConsent, setAnalyticsConsent] =
    useState<AnalyticsConsent | null>(() => readAnalyticsConsent());

  useEffect(() => {
    updatePageMetadata(
      window.location.pathname,
      i18n.resolvedLanguage ?? i18n.language,
    );
  }, [i18n.language, i18n.resolvedLanguage]);

  useEffect(() => {
    if (analyticsConsent === "granted") scheduleGoogleAnalytics();
  }, [analyticsConsent]);

  function decideAnalytics(consent: AnalyticsConsent) {
    if (consent === "denied") denyGoogleAnalytics();
    else grantGoogleAnalytics();
    setAnalyticsConsent(consent);
  }

  return (
    <div className="site-shell">
      <main className="site-content">
        <AppContent />
      </main>
      <SiteFooter
        onAnalyticsSettings={
          analyticsConfigured ? () => setAnalyticsConsent(null) : undefined
        }
      />
      {analyticsConfigured && analyticsConsent === null ? (
        <AnalyticsConsentBanner onDecision={decideAnalytics} />
      ) : null}
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 920, margin: "0 auto", padding: "28px 20px 60px" },
  top: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  viewTabs: { display: "inline-flex", gap: 4, padding: 4, marginBottom: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)" },
  viewTab: { border: 0, borderRadius: 9, padding: "7px 18px", background: "transparent", color: "var(--muted)", fontWeight: 700, fontSize: 14 },
  viewTabActive: { background: "var(--surface)", color: "inherit", boxShadow: "var(--shadow)" },
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
  iconBtn: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", background: "var(--surface)", lineHeight: 1 },
  entryRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  entryEdit: { padding: "12px", margin: "6px 0", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)" },
  smallBtn: { border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", background: "var(--surface)", color: "var(--muted)", fontSize: 12 },
  bdRow: { display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 },
  bdTrack: { height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" },
  bdFill: { height: "100%", borderRadius: 999 },
  input: { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "inherit", fontSize: 14 },
  landing: { maxWidth: 960, margin: "0 auto", padding: "24px 20px 60px" },
  landingBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 },
  hero: { display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(300px,0.85fr)", gap: 40, alignItems: "center", marginBottom: 48 },
  heroCopy: { minWidth: 0 },
  badge: { display: "inline-block", padding: "5px 12px", borderRadius: 999, background: "var(--accent-weak)", color: "var(--accent-ink)", fontSize: 13, fontWeight: 700, marginBottom: 18 },
  heroH1: { fontSize: 44, lineHeight: 1.12, letterSpacing: "-0.03em", fontWeight: 800, margin: 0, whiteSpace: "pre-line" },
  heroSub: { marginTop: 18, fontSize: 16, color: "var(--muted)", lineHeight: 1.6, maxWidth: 460 },
  loginCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 22, boxShadow: "var(--shadow)" },
  features: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 },
};
