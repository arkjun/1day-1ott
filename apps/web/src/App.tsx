import { contentTypes, type ContentType } from "@1ott/shared";
import { useEffect, useState } from "react";
import { api, type EntryRow } from "./lib/api";
import { signIn, signOut, signUp, useSession } from "./lib/authClient";

const LEVEL_COLORS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function Heatmap({ cells }: { cells: { date: string; level: number }[] }) {
  const map = new Map(cells.map((c) => [c.date, c.level]));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxWidth: 400 }}>
      {[...map.entries()].map(([date, level]) => (
        <div
          key={date}
          title={date}
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: LEVEL_COLORS[level] ?? LEVEL_COLORS[0],
          }}
        />
      ))}
      {cells.length === 0 && <span style={{ color: "#888" }}>아직 기록 없음</span>}
    </div>
  );
}

function Dashboard() {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [cells, setCells] = useState<{ date: string; level: number }[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ContentType>("movie");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [e, h] = await Promise.all([api.listEntries(), api.heatmap()]);
    setEntries(e.entries);
    setCells(h.cells);
  }
  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.createEntry({ type, title: title.trim(), watchedOn: today() });
      setTitle("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>1일 1OTT</h1>
        <button onClick={() => signOut()}>로그아웃</button>
      </div>

      <h3>잔디</h3>
      <Heatmap cells={cells} />

      <h3 style={{ marginTop: 24 }}>오늘 기록</h3>
      <form onSubmit={add} style={{ display: "flex", gap: 8 }}>
        <select value={type} onChange={(e) => setType(e.target.value as ContentType)}>
          {contentTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          style={{ flex: 1 }}
        />
        <button disabled={busy} type="submit">
          추가
        </button>
      </form>

      <h3 style={{ marginTop: 24 }}>최근 기록</h3>
      <ul>
        {entries.map((e) => (
          <li key={e.id}>
            <b>{e.watchedOn}</b> · {e.type} · {e.title}
          </li>
        ))}
      </ul>
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
      <h1>1일 1OTT</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
        {mode === "up" && (
          <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input
          placeholder="이메일"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="비밀번호(8자+)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">{mode === "up" ? "가입" : "로그인"}</button>
      </form>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <button
        style={{ marginTop: 12 }}
        onClick={() => setMode((m) => (m === "in" ? "up" : "in"))}
      >
        {mode === "in" ? "계정 만들기" : "로그인으로"}
      </button>
    </div>
  );
}

export function App() {
  const { data: session, isPending } = useSession();
  if (isPending) return <p style={{ padding: 24 }}>로딩…</p>;
  return session?.user ? <Dashboard /> : <Auth />;
}
