import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ImportResult, type PasskeyRow } from "../lib/api";
import { authClient, signIn } from "../lib/authClient";
import { useTheme } from "../lib/theme";
import { LanguageSelect } from "./LanguageSelect";

export interface MyPageUser {
  id: string;
  name: string;
  email: string;
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
      <PasskeyManager user={user} />
      <Settings user={user} />
      <ImportExport />
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
function PasskeyManager({ user }: { user: MyPageUser }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<PasskeyRow[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Better Auth 는 passkey 등록을 민감 작업으로 보고 fresh 세션을 요구한다.
  // 세션이 오래되면 SESSION_NOT_FRESH(403) → 비밀번호 재입력으로 재로그인 후 재시도.
  const [reauth, setReauth] = useState(false);
  const [password, setPassword] = useState("");

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
      const e = res.error;
      // 오래된 세션이면 재로그인 폼을 띄운다(그 뒤 자동 재시도).
      if (("code" in e && e.code === "SESSION_NOT_FRESH") || e.status === 403) {
        setReauth(true);
        setMsg(t("passkey.reauthHint"));
        return;
      }
      // 그 외(WebAuthn 취소/미지원 등)는 실제 code/status 를 그대로 노출.
      console.error("[passkey] addPasskey failed", e);
      const detail = ("code" in e && e.code) || e.message || e.status;
      setMsg(detail ? `${t("passkey.addFailed")} (${detail})` : t("passkey.addFailed"));
      return;
    }
    setName("");
    await load();
  }

  // 비밀번호로 재로그인 → 새 fresh 세션 → passkey 등록 재시도.
  async function reauthAndAdd() {
    setBusy(true);
    setMsg(null);
    const r = await signIn.email({ email: user.email, password });
    if (r.error) {
      setBusy(false);
      setMsg(t("passkey.reauthFailed"));
      return;
    }
    setBusy(false);
    setPassword("");
    setReauth(false);
    await add();
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

      {reauth && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            reauthAndAdd();
          }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}
        >
          <input
            style={{ ...st.input, width: 200 }}
            type="password"
            autoFocus
            placeholder={t("auth.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button style={st.primary} type="submit" disabled={busy || !password}>
            {t("passkey.reauthDo")}
          </button>
          <button style={st.ghost} type="button" onClick={() => { setReauth(false); setPassword(""); setMsg(null); }}>
            {t("common.cancel")}
          </button>
        </form>
      )}

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

/** 기록 대량 가져오기/내보내기. dry-run 미리보기 후 확정. */
function ImportExport() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Extract<ImportResult, { committed: false }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
    e.target.value = ""; // 같은 파일 재선택 허용
  }

  async function runPreview() {
    setBusy(true);
    setMsg(null);
    setPreview(null);
    try {
      const res = await api.importEntries(text, false);
      if (res.committed) return; // dry-run이라 도달 안 함
      setPreview(res);
    } catch (err) {
      setMsg(err instanceof Error && err.message.includes("400") ? t("impexport.tooMany") : t("impexport.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.importEntries(text, true);
      if (res.committed) {
        setMsg(t("impexport.done", { n: res.inserted }));
        setPreview(null);
        setText("");
        setTimeout(() => window.location.reload(), 800);
      }
    } catch {
      setMsg(t("impexport.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    try {
      await api.exportEntries();
    } catch {
      setMsg(t("impexport.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.card}>
      <div style={st.cardHead}>
        <b>{t("impexport.title")}</b>
        <span style={st.muted}>{t("impexport.desc")}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <button style={st.ghost} disabled={busy} onClick={download}>
          {t("impexport.download")}
        </button>
        <label style={{ ...st.ghost, cursor: "pointer" }}>
          {t("impexport.fileLabel")}
          <input type="file" accept=".md,.markdown,text/markdown" onChange={onFile} style={{ display: "none" }} />
        </label>
      </div>

      <textarea
        style={{ ...st.input, width: "100%", minHeight: 120, fontFamily: "monospace", resize: "vertical" }}
        placeholder={t("impexport.placeholder")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // 미리보기 이후 텍스트를 수정하면 확정 시 다른 내용이 등록될 수 있어 미리보기를 무효화한다.
          setPreview(null);
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button style={st.primary} disabled={busy || !text.trim()} onClick={runPreview}>
          {t("impexport.preview")}
        </button>
      </div>

      {preview && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ marginBottom: 8 }}>
            {t("impexport.summary", {
              ok: preview.okCount,
              err: preview.errors.length,
              dup: preview.dupWarnings.length,
            })}
          </div>

          {preview.errors.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ ...st.muted, color: "crimson" }}>{t("impexport.errorsHead")}</div>
              {preview.errors.map((e) => (
                <div key={`e${e.row}`} style={{ fontSize: 13 }}>
                  {t("impexport.rowLabel", { row: e.row })}: {e.message}
                </div>
              ))}
            </div>
          )}

          {preview.dupWarnings.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={st.muted}>{t("impexport.dupsHead")}</div>
              {preview.dupWarnings.map((d) => (
                <div key={`d${d.row}`} style={{ fontSize: 13 }}>
                  {t("impexport.rowLabel", { row: d.row })}: {d.watchedOn} · {d.title}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={st.primary} disabled={busy || preview.okCount === 0} onClick={commit}>
              {preview.okCount === 0 ? t("impexport.empty") : t("impexport.confirm", { ok: preview.okCount })}
            </button>
            <button style={st.ghost} disabled={busy} onClick={() => setPreview(null)}>
              {t("impexport.cancel")}
            </button>
          </div>
        </div>
      )}

      {msg && <div style={{ ...st.muted, marginTop: 8 }}>{msg}</div>}
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
