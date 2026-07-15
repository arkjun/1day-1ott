import en from "./en";
import ja from "./ja";
import ko from "./ko";

export const LANGS = ["ko", "en", "ja"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "ko";

/** 언어 코드 → 표시명(셀렉터용). */
export const LANG_NAMES: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
};

export const resources = {
  ko: { translation: ko },
  en: { translation: en },
  ja: { translation: ja },
} as const;

/** 임의 문자열을 지원 언어로 정규화(예: "en-US" → "en"). 미지원이면 null. */
export function normalizeLang(input: string | null | undefined): Lang | null {
  if (!input) return null;
  const base = (input.split("-")[0] ?? "").toLowerCase();
  return (LANGS as readonly string[]).includes(base) ? (base as Lang) : null;
}
