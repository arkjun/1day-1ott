import type { HeatmapCell, Reaction } from "@1ott/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import ActivityCalendar from "react-activity-calendar";
import { CalendarView } from "./components/CalendarView";
import { PublicProfile } from "./components/PublicProfile";
import { RecordModal, ReactionPicker } from "./components/RecordModal";
import { api, type EntryRow } from "./lib/api";
import { signIn, signOut, signUp, useSession } from "./lib/authClient";
import { GREEN, buildYear, currentStreak, isoDaysAgo } from "./lib/heatmap";
import { REACTION_META } from "./lib/reactions";
import { useTheme } from "./lib/theme";
import { TYPE_META } from "./lib/typeMeta";

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

/** 최근 기록 한 줄: 인라인 수정(반응/감상/날짜) + 2단계 삭제. */
function RecentItem({ entry, onChanged }: { entry: EntryRow; onChanged: () => void }) {
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
          {entry.type} · {entry.title}
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
          placeholder="한 줄 감상"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={st.primary} disabled={busy} onClick={save}>
            저장
          </button>
          <button style={st.ghost} onClick={() => setEditing(false)}>
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={st.entryRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{entry.watchedOn}</b> · {entry.type} · {entry.title}
        {entry.reaction ? ` · ${REACTION_META[entry.reaction].emoji}` : ""}
        {entry.note ? <span style={st.muted}> · {entry.note}</span> : null}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button style={st.smallBtn} onClick={() => setEditing(true)}>
          수정
        </button>
        {confirmDel ? (
          <>
            <button style={{ ...st.smallBtn, color: "crimson" }} disabled={busy} onClick={del}>
              정말?
            </button>
            <button style={st.smallBtn} onClick={() => setConfirmDel(false)}>
              취소
            </button>
          </>
        ) : (
          <button style={st.smallBtn} onClick={() => setConfirmDel(true)}>
            삭제
          </button>
        )}
      </div>
    </div>
  );
}

function Dashboard({ user }: { user: SessionUser }) {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"home" | "calendar">("home");
  const { resolved: scheme, toggle } = useTheme();

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
    <div style={{ ...st.wrap, maxWidth: view === "calendar" ? 1080 : 780 }}>
      <div style={st.top}>
        <b style={{ fontSize: 18, letterSpacing: "-0.02em" }}>🌱 1일 1OTT</b>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={st.iconBtn} onClick={toggle} aria-label="테마 전환" title="테마 전환">
            {scheme === "dark" ? "☀️" : "🌙"}
          </button>
          <button style={st.primary} onClick={() => setOpen(true)}>
            + 기록
          </button>
          <button style={st.ghost} onClick={() => signOut()}>
            로그아웃
          </button>
        </div>
      </div>

      <div style={st.viewTabs}>
        {(["home", "calendar"] as const).map((v) => (
          <button
            key={v}
            style={{ ...st.viewTab, ...(view === v ? st.viewTabActive : {}) }}
            onClick={() => setView(v)}
          >
            {v === "home" ? "홈" : "달력"}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <CalendarView entries={entries} onShowAll={() => setView("home")} />
      ) : (
        <>
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
        <div ref={heatmapRef} style={{ overflowX: "auto" }}>
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
        <div>
          {entries.slice(0, 20).map((e) => (
            <RecentItem key={e.id} entry={e} onChanged={refresh} />
          ))}
          {entries.length === 0 && (
            <div style={st.muted}>아직 기록이 없어요. “+ 기록”을 눌러보세요.</div>
          )}
        </div>
      </div>
        </>
      )}

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
};
