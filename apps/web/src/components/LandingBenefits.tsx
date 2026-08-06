import { useTranslation } from "react-i18next";

const FEATURE_IDS = ["1", "2", "3", "4"] as const;

export function LandingBenefits() {
  const { t } = useTranslation();

  return (
    <section
      className="landing-benefits"
      aria-labelledby="landing-benefits-title"
    >
      <div className="landing-benefits-copy">
        <span className="landing-benefits-eyebrow">
          {t("landing.benefitsEyebrow")}
        </span>
        <h2 id="landing-benefits-title">{t("landing.benefitsTitle")}</h2>
        <p>{t("landing.benefitsSub")}</p>
      </div>

      <div className="landing-benefit-grid">
        {FEATURE_IDS.map((id) => (
          <article key={id} className="landing-benefit-card">
            <span className="landing-benefit-icon" aria-hidden="true">
              {t(`landing.feat${id}Icon`)}
            </span>
            <h3>{t(`landing.feat${id}Title`)}</h3>
            <p>{t(`landing.feat${id}Body`)}</p>
          </article>
        ))}
      </div>

      <div className="landing-fediverse">
        <div className="landing-fediverse-copy">
          <span>{t("landing.fediverseEyebrow")}</span>
          <h3>{t("landing.fediverseTitle")}</h3>
          <p>{t("landing.fediverseBody")}</p>
          <ul>
            <li>{t("landing.fediversePoint1")}</li>
            <li>{t("landing.fediversePoint2")}</li>
            <li>{t("landing.fediversePoint3")}</li>
          </ul>
        </div>

        <div className="landing-fediverse-visual" aria-hidden="true">
          <div className="landing-fediverse-profile">
            <span>🌱</span>
            <div>
              <b>{t("landing.fediverseProfile")}</b>
              <small>@myname@1day1ott.com</small>
            </div>
          </div>
          <div className="landing-fediverse-path">
            <i />
            <span>•••</span>
            <i />
          </div>
          <div className="landing-fediverse-network">
            <span>🌌</span>
            <div>
              <b>{t("landing.fediverseNetwork")}</b>
              <small>Mastodon · Fediverse</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
