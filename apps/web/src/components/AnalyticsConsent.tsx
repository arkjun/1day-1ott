import { useTranslation } from "react-i18next";
import type { AnalyticsConsent } from "../lib/analytics";

export function AnalyticsConsentBanner({
  onDecision,
}: {
  onDecision: (consent: AnalyticsConsent) => void;
}) {
  const { t } = useTranslation();

  return (
    <aside
      className="analytics-consent"
      aria-label={t("analytics.title")}
      aria-live="polite"
    >
      <div>
        <b>{t("analytics.title")}</b>
        <p>
          {t("analytics.description")}{" "}
          <a href="/privacy">{t("analytics.learnMore")}</a>
        </p>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" onClick={() => onDecision("denied")}>
          {t("analytics.reject")}
        </button>
        <button
          type="button"
          className="analytics-consent-accept"
          onClick={() => onDecision("granted")}
        >
          {t("analytics.accept")}
        </button>
      </div>
    </aside>
  );
}
