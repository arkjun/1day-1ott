export type AnalyticsConsent = "granted" | "denied";

interface ConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export const ANALYTICS_CONSENT_KEY = "1ott.analytics-consent";
const GA_SCRIPT_ID = "google-analytics";
const GA_MEASUREMENT_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? "";

let scheduled = false;

export function isGaMeasurementId(id: string): boolean {
  return /^G-[A-Z0-9]+$/.test(id);
}

export function isAnalyticsConfigured(): boolean {
  return isGaMeasurementId(GA_MEASUREMENT_ID);
}

export function readAnalyticsConsent(
  storage: ConsentStorage = window.localStorage,
): AnalyticsConsent | null {
  try {
    const value = storage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(
  consent: AnalyticsConsent,
  storage: ConsentStorage = window.localStorage,
): void {
  try {
    storage.setItem(ANALYTICS_CONSENT_KEY, consent);
  } catch {
    // 저장소가 차단돼도 현재 페이지의 선택은 React 상태로 유지한다.
  }
}

export function denyGoogleAnalytics(): void {
  writeAnalyticsConsent("denied");
  window.gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

export function grantGoogleAnalytics(): void {
  writeAnalyticsConsent("granted");
  if (window.gtag) {
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  } else {
    scheduleGoogleAnalytics();
  }
}

export function scheduleGoogleAnalytics(): void {
  if (!isAnalyticsConfigured() || scheduled) return;
  scheduled = true;

  const load = () => loadGoogleAnalytics();
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(load, { timeout: 2000 });
  } else {
    globalThis.setTimeout(load, 0);
  }
}

function loadGoogleAnalytics(): void {
  if (document.getElementById(GA_SCRIPT_ID)) return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement("script");
  script.id = GA_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
    GA_MEASUREMENT_ID,
  )}`;
  document.head.append(script);
}
