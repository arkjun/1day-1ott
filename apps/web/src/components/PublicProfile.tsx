import type { PublicProfile as Profile } from "@1ott/shared";
import { useEffect, useState } from "react";
import ActivityCalendar from "react-activity-calendar";
import { api } from "../lib/api";
import { GREEN, buildYear, currentStreak, isoDaysAgo, prefersDark } from "../lib/heatmap";

/** SVG 잔디를 클라이언트 canvas 로 PNG 변환 후 다운로드(폰트/서버 렌더 불필요). */
async function downloadPng(username: string) {
  const res = await fetch(`/api/u/${encodeURIComponent(username)}/jandi.svg`);
  const svgText = await res.text();
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `${username}-jandi.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  img.src = url;
}

export function PublicProfile({ username }: { username: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .publicProfile(username)
      .then((p) => {
        setProfile(p);
        setState("ok");
      })
      .catch(() => setState("notfound"));
  }, [username]);

  if (state === "loading") return <p style={{ padding: 24 }}>로딩…</p>;
  if (state === "notfound" || !profile)
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <h2>프로필을 찾을 수 없어요</h2>
        <p style={{ color: "#8890a0" }}>비공개거나 없는 사용자입니다.</p>
        <a href="/" style={{ color: "#ff5a36" }}>홈으로</a>
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
          <div style={{ fontSize: 12, color: "#8890a0" }}>🌱 1일 1OTT</div>
          <h1 style={{ margin: "2px 0 0" }}>@{profile.username}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={st.ghost} onClick={copyLink}>
            {copied ? "복사됨!" : "링크 복사"}
          </button>
          <button style={st.primary} onClick={() => downloadPng(profile.username)}>
            ⬇ 잔디 이미지
          </button>
        </div>
      </div>

      <div style={st.stats}>
        <Stat k="🔥 현재 연속" v={streak} unit="일" accent />
        <Stat k="이번 달" v={thisMonth} unit="편" />
        <Stat k="총 기록" v={profile.total} unit="편" />
      </div>

      <div style={st.card}>
        <div style={st.cardHead}>
          <b>잔디</b>
          <span style={st.muted}>하루 1칸 · 색이 진할수록 그날 많이 봄</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <ActivityCalendar
            data={year}
            colorScheme={prefersDark()}
            theme={GREEN}
            blockSize={12}
            blockMargin={3}
            labels={{ totalCount: "{{count}}편 기록" }}
          />
        </div>
      </div>

      {profile.posters.length > 0 && (
        <div style={st.card}>
          <div style={st.cardHead}>
            <b>포스터</b>
          </div>
          <div style={st.posterGrid}>
            {profile.posters
              .filter((p) => p.posterUrl)
              .map((p) => (
                <img key={p.id} src={p.posterUrl!} alt={p.title} title={p.title} style={st.poster} />
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
  wrap: { maxWidth: 780, margin: "0 auto", padding: "28px 20px 60px" },
  top: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
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
  primary: { border: 0, borderRadius: 10, padding: "9px 16px", background: "linear-gradient(135deg,#ff5a36,#d63a17)", color: "#fff", fontWeight: 700, cursor: "pointer" },
  ghost: { border: "1px solid #8884", borderRadius: 10, padding: "9px 14px", background: "none", color: "inherit", cursor: "pointer" },
};
