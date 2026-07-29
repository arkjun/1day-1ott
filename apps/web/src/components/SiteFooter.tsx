import { useTranslation } from "react-i18next";

export function SiteFooter() {
  const { t } = useTranslation();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>© 2026 {t("common.serviceName")}</span>
        <nav aria-label={t("footer.legalNav")}>
          <a href="/privacy">{t("footer.privacy")}</a>
          <a href="/terms">{t("footer.terms")}</a>
        </nav>
      </div>
    </footer>
  );
}
