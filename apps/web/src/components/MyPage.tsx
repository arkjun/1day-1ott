import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type PasskeyRow } from "../lib/api";
import { authClient } from "../lib/authClient";
import { useTheme } from "../lib/theme";
import { LanguageSelect } from "./LanguageSelect";

export interface MyPageUser {
  id: string;
  name: string;
  username?: string | null;
  isPublic?: boolean | null;
  lang?: string | null;
}

/** 마이페이지: 공개 프로필 · Passkey · 환경설정. `/me` 경로에서 렌더. */
export function MyPage({ user }: { user: MyPageUser }) {
  const { t } = useTranslation();
  return (
    <div style={st.wrap}>
      <div style={st.top}>
        <b style={{ fontSize: 18, letterSpacing: "-0.02em" }}>🌱 {t("nav.myPage")}</b>
        <a style={{ ...st.ghost, textDecoration: "none" }} href="/">
          {t("myPage.back")}
        </a>
      </div>
      <ShareSettings user={user} />
      <PasskeyManager />
      <Settings user={user} />
    </div>
  );
}

/** 공개 프로필 설정 + 공유. username/공개여부를 PATCH /api/me 로 저장. */
function ShareSettings({ user }: { user: MyPageUser }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(user.username ?? "");
  const [isPublic, setIsPublic] = useState(!!user.isPublic);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const profileUrl = user.username
    ? `${window.location.origin}/u/${user.username}`
    : null;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.updateMe({ username: username || undefined, isPublic });
      setMsg(t("share.saved"));
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setMsg(t("share.error"));
      setBusy(false);
    }
  }

  async function copy() {
    if (!profileUrl) return;
    await navigator.clipboard.writeText(profileUrl);
    setMsg(t("share.linkCopied"));
    setTimeout(() => setMsg(null), 1500);
  }

  return (
    <div style={st.card}>
      <div style={st.cardHead}>
        <b>{t("share.title")}</b>
        {user.isPublic && user.username && (
          <span style={st.muted}>{t("share.publicNote", { username: user.username })}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={st.muted}>@</span>
        <input
          style={{ ...st.input, width: 160 }}
          placeholder={t("share.usernamePlaceholder")}
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
        />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          {t("share.public")}
        </label>
        <button style={st.ghost} disabled={busy} onClick={save}>
          {t("common.save")}
        </button>
        {profileUrl && (
          <>
            <button style={st.ghost} onClick={copy}>
              {t("share.copyLink")}
            </button>
            <a style={{ ...st.ghost, textDecoration: "none" }} href={profileUrl} target="_blank" rel="noreferrer">
              {t("share.openProfile")}
            </a>
          </>
        )}
      </div>
      {msg && <div style={{ ...st.muted, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

/** Passkey 등록/목록/삭제. 등록·로그인은 브라우저 WebAuthn 의식이 필요. */
function PasskeyManager() {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<PasskeyRow[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      setList(await api.listPasskeys());
    } catch {
      /* 로그인 세션이 없으면 무시 */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setBusy(true);
    setMsg(null);
    const res = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
    setBusy(false);
    if (res?.error) {
      setMsg(t("passkey.addFailed"));
      return;
    }
    setName("");
    await load();
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.deletePasskey(id);
      setConfirmId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.card}>
      <div style={st.cardHead}>
        <b>{t("passkey.title")}</b>
        <span style={st.muted}>{t("passkey.desc")}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input
          style={{ ...st.input, width: 200 }}
          placeholder={t("passkey.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button style={st.primary} disabled={busy} onClick={add}>
          {t("passkey.add")}
        </button>
      </div>

      {list.length === 0 ? (
        <div style={st.muted}>{t("passkey.empty")}</div>
      ) : (
        <div>
          {list.map((pk) => (
            <div key={pk.id} style={st.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{pk.name || pk.deviceType}</b>
                <span style={st.muted}>
                  {" · "}
                  {t("passkey.registered", {
                    date: new Date(pk.createdAt).toLocaleDateString(i18n.language),
                  })}
                </span>
              </div>
              {confirmId === pk.id ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...st.smallBtn, color: "crimson" }} disabled={busy} onClick={() => remove(pk.id)}>
                    {t("common.confirmDelete")}
                  </button>
                  <button style={st.smallBtn} onClick={() => setConfirmId(null)}>
                    {t("common.cancel")}
                  </button>
                </div>
              ) : (
                <button style={st.smallBtn} onClick={() => setConfirmId(pk.id)}>
                  {t("common.del")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {msg && <div style={{ ...st.muted, marginTop: 8, color: "crimson" }}>{msg}</div>}
    </div>
  );
}

/** 환경설정: 언어 · 테마. */
function Settings({ user }: { user: MyPageUser }) {
  const { t } = useTranslation();
  const { resolved: scheme, toggle } = useTheme();
  return (
    <div style={st.card}>
      <div style={st.cardHead}>
        <b>{t("settings.title")}</b>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={st.settingRow}>
          <span>{t("settings.language")}</span>
          <LanguageSelect user={user} />
        </label>
        <label style={st.settingRow}>
          <span>{t("settings.theme")}</span>
          <button style={st.ghost} onClick={toggle}>
            {scheme === "dark" ? `☀️ ${t("settings.light")}` : `🌙 ${t("settings.dark")}`}
          </button>
        </label>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 780, margin: "0 auto", padding: "28px 20px 60px" },
  top: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginBottom: 16, boxShadow: "var(--shadow)" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  muted: { color: "var(--muted)", fontSize: 12 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  settingRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 },
  primary: { border: 0, borderRadius: 10, padding: "9px 16px", background: "linear-gradient(135deg,var(--accent),var(--accent-ink))", color: "#fff", fontWeight: 700, boxShadow: "0 4px 14px var(--accent-weak)" },
  ghost: { border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", background: "var(--surface)", color: "inherit" },
  input: { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "inherit", fontSize: 14 },
  smallBtn: { border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", background: "var(--surface)", color: "var(--muted)", fontSize: 12 },
};
