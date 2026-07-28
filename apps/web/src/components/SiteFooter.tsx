import { useTranslation } from "react-i18next";

export function SiteFooter() {
  const { t } = useTranslation();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>© 2026 1일 1OTT</span>
        <nav aria-label={t("footer.legalNav")}>
          <a href="/privacy">{t("footer.privacy")}</a>
          <a href="/terms">{t("footer.terms")}</a>
          <a
            href="https://github.com/arkjun/1day-1ott"
            target="_blank"
            rel="noreferrer noopener"
          >
            {t("footer.source")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
