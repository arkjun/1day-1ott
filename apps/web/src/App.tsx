import type { HeatmapCell } from "@1ott/shared";
import { useEffect, useMemo, useState } from "react";
import ActivityCalendar from "react-activity-calendar";
import { PublicProfile } from "./components/PublicProfile";
import { RecordModal } from "./components/RecordModal";
import { api, type EntryRow } from "./lib/api";
import { signIn, signOut, signUp, useSession } from "./lib/authClient";
import { GREEN, buildYear, currentStreak, isoDaysAgo, prefersDark } from "./lib/heatmap";

const TYPE_META: Record<string, { label: string; bar: string }> = {
  movie: { label: "영화", bar: "linear-gradient(90deg,#ff5a36,#ff8a5c)" },
  tv: { label: "드라마", bar: "linear-gradient(90deg,#2f7bff,#5aa0ff)" },
  youtube: { label: "유튜브", bar: "linear-gradient(90deg,#ff3d3d,#ff7a7a)" },
  anime: { label: "애니", bar: "linear-gradient(90deg,#37b25c,#63d987)" },
  other: { label: "직접입력", bar: "linear-gradient(90deg,#8a94a3,#b3bcc9)" },
};

interface SessionUser {
  id: string;
  name: string;
  username?: string | null;
  isPublic?: boolean | null;
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
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [open, setOpen] = useState(false);
  const scheme = prefersDark();

  async function refresh() {
    const [e, h] = await Promise.all([api.listEntries(), api.heatmap()]);
    setEntries(e.entries);
    setCells(h.cells);
  }
  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  const year = useMemo(() => buildYear(cells), [cells]);
  const streak = useMemo(() => currentStreak(cells), [cells]);
  const thisMonth = useMemo(() => {
    const pre = isoDaysAgo(0).slice(0, 7);
    return entries.filter((e) => e.watchedOn.startsWith(pre)).length;
  }, [entries]);
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    const total = entries.length || 1;
    return [...counts.entries()]
      .map(([type, count]) => ({
        type,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);
  const posters = entries.filter((e) => e.posterUrl).slice(0, 12);

  return (
    <div style={st.wrap}>
      <div style={st.top}>
        <b style={{ fontSize: 18, letterSpacing: "-0.02em" }}>🌱 1일 1OTT</b>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={st.primary} onClick={() => setOpen(true)}>
            + 기록
          </button>
          <button style={st.ghost} onClick={() => signOut()}>
            로그아웃
          </button>
        </div>
      </div>

      <div style={st.stats}>
        <Stat k="🔥 현재 연속" v={streak} unit="일" accent />
        <Stat k="이번 달" v={thisMonth} unit="편" />
        <Stat k="총 기록" v={entries.length} unit="편" />
      </div>

      <ShareSettings user={user} />

      <div style={st.card}>
        <div style={st.cardHead}>
          <b>잔디</b>
          <span style={st.muted}>하루 1칸 · 색이 진할수록 그날 많이 봄</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <ActivityCalendar
            data={year}
            colorScheme={scheme}
            theme={GREEN}
            blockSize={12}
            blockMargin={3}
            labels={{ totalCount: "{{count}}편 기록" }}
          />
        </div>
      </div>

      {posters.length > 0 && (
        <div style={st.card}>
          <div style={st.cardHead}>
            <b>포스터</b>
            <span style={st.muted}>최근 기록</span>
          </div>
          <div style={st.posterGrid}>
            {posters.map((e) => (
              <img key={e.id} src={e.posterUrl!} alt={e.title} title={e.title} style={st.poster} />
            ))}
          </div>
        </div>
      )}

      {breakdown.length > 0 && (
        <div style={st.card}>
          <div style={st.cardHead}>
            <b>유형별</b>
            <span style={st.muted}>총 {entries.length}편</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {breakdown.map((b) => (
              <div key={b.type}>
                <div style={st.bdRow}>
                  <span>{TYPE_META[b.type]?.label ?? b.type}</span>
                  <span style={st.muted}>
                    {b.count}편 · {b.pct}%
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
          <b>최근 기록</b>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {entries.slice(0, 20).map((e) => (
            <li key={e.id} style={{ marginBottom: 4 }}>
              <b>{e.watchedOn}</b> · {e.type} · {e.title}
              {e.rating != null ? ` · ★${e.rating}` : ""}
            </li>
          ))}
          {entries.length === 0 && <li style={st.muted}>아직 기록이 없어요. “+ 기록”을 눌러보세요.</li>}
        </ul>
      </div>

      {open && <RecordModal onClose={() => setOpen(false)} onSaved={refresh} />}
    </div>
  );
}

function Auth() {
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
    if (res.error) setErr(res.error.message ?? "실패");
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1>🌱 1일 1OTT</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
        {mode === "up" && (
          <input style={st.input} placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input style={st.input} placeholder="이메일" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          style={st.input}
          placeholder="비밀번호(8자+)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button style={st.primary} type="submit">
          {mode === "up" ? "가입" : "로그인"}
        </button>
      </form>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <button style={{ ...st.ghost, marginTop: 12 }} onClick={() => setMode((m) => (m === "in" ? "up" : "in"))}>
        {mode === "in" ? "계정 만들기" : "로그인으로"}
      </button>
    </div>
  );
}

/** 공개 프로필 설정 + 공유. username/공개여부를 PATCH /api/me 로 저장. */
function ShareSettings({ user }: { user: SessionUser }) {
  const [username, setUsername] = useState(user.username ?? "");
  const [isPublic, setIsPublic] = useState(!!user.isPublic);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const profileUrl =
    user.username ? `${window.location.origin}/u/${user.username}` : null;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.updateMe({ username: username || undefined, isPublic });
      setMsg("저장됨 — 새로고침 중…");
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setMsg("실패: username 중복이거나 형식(소문자/숫자/_ 3~20자) 오류");
      setBusy(false);
    }
  }

  async function copy() {
    if (!profileUrl) return;
    await navigator.clipboard.writeText(profileUrl);
    setMsg("링크 복사됨!");
    setTimeout(() => setMsg(null), 1500);
  }

  return (
    <div style={st.card}>
      <div style={st.cardHead}>
        <b>공개 프로필</b>
        {user.isPublic && user.username && (
          <span style={st.muted}>/u/{user.username} 공개 중</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={st.muted}>@</span>
        <input
          style={{ ...st.input, width: 160 }}
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
        />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          공개
        </label>
        <button style={st.ghost} disabled={busy} onClick={save}>
          저장
        </button>
        {profileUrl && (
          <>
            <button style={st.ghost} onClick={copy}>
              링크 복사
            </button>
            <a style={{ ...st.ghost, textDecoration: "none" }} href={profileUrl} target="_blank" rel="noreferrer">
              프로필 열기 ↗
            </a>
          </>
        )}
      </div>
      {msg && <div style={{ ...st.muted, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

function AuthedApp() {
  const { data: session, isPending } = useSession();
  if (isPending) return <p style={{ padding: 24 }}>로딩…</p>;
  return session?.user ? <Dashboard user={session.user as SessionUser} /> : <Auth />;
}

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/u/")) {
    const username = decodeURIComponent(path.slice(3).split("/")[0] ?? "");
    if (username) return <PublicProfile username={username} />;
  }
  return <AuthedApp />;
}

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 780, margin: "0 auto", padding: "28px 20px 60px" },
  top: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  stats: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 },
  tile: { border: "1px solid #8883", borderRadius: 14, padding: "14px 16px" },
  tileK: { fontSize: 12, color: "#8890a0" },
  tileV: { marginTop: 6, fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" },
  tileU: { fontSize: 13, fontWeight: 600, color: "#8890a0", marginLeft: 3 },
  card: { border: "1px solid #8883", borderRadius: 14, padding: 18, marginBottom: 16 },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  muted: { color: "#8890a0", fontSize: 12 },
  posterGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(78px,1fr))", gap: 10 },
  poster: { width: "100%", aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 8 },
  primary: {
    border: 0,
    borderRadius: 10,
    padding: "9px 16px",
    background: "linear-gradient(135deg,#ff5a36,#d63a17)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  ghost: { border: "1px solid #8884", borderRadius: 10, padding: "9px 14px", background: "none", color: "inherit", cursor: "pointer" },
  bdRow: { display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 },
  bdTrack: { height: 8, borderRadius: 999, background: "#8882", overflow: "hidden" },
  bdFill: { height: "100%", borderRadius: 999 },
  input: { padding: "10px 12px", borderRadius: 10, border: "1px solid #8884", background: "transparent", color: "inherit", fontSize: 14 },
};
