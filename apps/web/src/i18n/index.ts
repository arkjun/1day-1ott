import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANG, LANGS, type Lang, resources } from "./locales";

export const LANG_STORAGE_KEY = "1ott.lang";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: LANGS as readonly string[],
    load: "languageOnly", // "en-US" → "en"
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false }, // React 가 이미 XSS 방어
    detection: {
      // ?lang= 이 먼저다. 외부에서 언어를 지정해 링크할 수 있어야 한다(README 정책 링크).
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lang",
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

/** 언어 변경 + localStorage 반영. 서버 저장은 호출부에서 별도 처리. */
export function changeLang(lang: Lang): void {
  i18n.changeLanguage(lang);
}

export default i18n;
