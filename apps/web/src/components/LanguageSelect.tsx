import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { DEFAULT_LANG, LANGS, LANG_NAMES, type Lang, normalizeLang } from "../i18n/locales";

/**
 * 언어 셀렉터. 로그인 유저면 서버(user.lang)를 최초 1회 반영해 기기 간 동기화하고,
 * 변경 시 localStorage(i18next detector)와 서버 프로필에 저장한다.
 * user 미전달(공개 프로필·로그인 전)이면 클라이언트(localStorage)만 사용.
 */
export function LanguageSelect({ user }: { user?: { lang?: string | null } }) {
  const { i18n } = useTranslation();
  const synced = useRef(false);

  // 서버(user.lang)는 로그인 직후 '최초 1회'만 반영한다. 이후엔 사용자의 선택이 우선 —
  // 매 렌더 강제하면 전환할 때마다 서버 값으로 되돌아간다.
  useEffect(() => {
    if (synced.current) return;
    const server = normalizeLang(user?.lang);
    if (!server) return; // 세션 로딩 중이면 다음 렌더에서 재시도
    synced.current = true;
    if (server !== i18n.language) i18n.changeLanguage(server);
  }, [user?.lang, i18n]);

  const current = normalizeLang(i18n.language) ?? DEFAULT_LANG;

  function onChange(lang: Lang) {
    i18n.changeLanguage(lang);
    if (user) api.updateMe({ lang }).catch(() => {}); // 저장 실패는 조용히 무시(로컬은 이미 반영됨)
  }

  return (
    <select
      style={style}
      value={current}
      onChange={(e) => onChange(e.target.value as Lang)}
      aria-label="Language"
    >
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {LANG_NAMES[l]}
        </option>
      ))}
    </select>
  );
}

const style: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "9px 10px",
  background: "var(--surface)",
  color: "inherit",
  fontSize: 13,
};
