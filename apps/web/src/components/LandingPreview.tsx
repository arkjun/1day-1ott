import { useState } from "react";
import { useTranslation } from "react-i18next";

type PreviewView = "dashboard" | "record";

const HEATMAP_PATTERN = [
  0, 0, 1, 0, 2, 0, 0, 0, 1, 0, 0, 2, 0, 0,
  1, 0, 2, 1, 0, 0, 0, 2, 0, 3, 0, 1, 0, 0,
  0, 1, 0, 0, 2, 0, 1, 0, 3, 0, 0, 1, 0, 2,
  1, 0, 2, 0, 0, 1, 3, 0, 1, 2, 0, 0, 2, 1,
  0, 2, 1, 0, 3, 0, 1, 1, 0, 2, 0, 4, 1, 0,
  2, 0, 3, 1, 0, 2, 1, 4, 0, 2, 3, 1, 2, 0,
  1, 3, 2, 0, 4, 2, 1, 3, 0, 4, 2, 3, 1, 4,
];

const HEATMAP_LEVELS = Array.from(
  { length: 52 * 7 },
  (_, index) => HEATMAP_PATTERN[index % HEATMAP_PATTERN.length] ?? 0,
);

const POSTER_COLORS = [
  "linear-gradient(145deg, #16213e, #e94560)",
  "linear-gradient(145deg, #2f4858, #f6ae2d)",
  "linear-gradient(145deg, #3d405b, #81b29a)",
  "linear-gradient(145deg, #5f0f40, #fb8b24)",
  "linear-gradient(145deg, #133c55, #59a5d8)",
];

export function LandingPreview() {
  const { t } = useTranslation();
  const [view, setView] = useState<PreviewView>("dashboard");

  return (
    <section className="landing-preview" aria-labelledby="landing-preview-title">
      <div className="landing-preview-copy">
        <span className="landing-preview-eyebrow">{t("preview.eyebrow")}</span>
        <h2 id="landing-preview-title">{t("preview.title")}</h2>
        <p>{t("preview.sub")}</p>
      </div>

      <div className="landing-preview-tabs" role="tablist" aria-label={t("preview.tabsLabel")}>
        {(["dashboard", "record"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={view === tab}
            aria-controls="landing-preview-panel"
            className={view === tab ? "is-active" : ""}
            onClick={() => setView(tab)}
          >
            <span aria-hidden="true">{tab === "dashboard" ? "🌱" : "✍️"}</span>
            {t(`preview.${tab}Tab`)}
          </button>
        ))}
      </div>

      <div
        id="landing-preview-panel"
        className="landing-preview-browser"
        role="tabpanel"
        aria-label={t(`preview.${view}Tab`)}
      >
        <div className="landing-preview-browser-bar" aria-hidden="true">
          <span />
          <span />
          <span />
          <div>1day1ott.app</div>
        </div>

        <div className="landing-preview-screen">
          <div className="landing-preview-appbar">
            <b>🌱 {t("common.serviceName")}</b>
            <div>
              <span>{t("preview.myPage")}</span>
              <span className="landing-preview-add">{t("action.addRecord")}</span>
            </div>
          </div>

          <div className="landing-preview-stats">
            <PreviewStat label={t("preview.streak")} value="12" unit={t("preview.days")} accent />
            <PreviewStat label={t("preview.thisMonth")} value="18" unit={t("preview.entries")} />
            <PreviewStat label={t("preview.total")} value="124" unit={t("preview.entries")} />
          </div>

          <div className="landing-preview-card landing-preview-heatmap">
            <div className="landing-preview-card-head">
              <b>{t("heatmap.title")}</b>
              <span>{t("preview.heatmapHint")}</span>
            </div>
            <div className="landing-preview-grass" aria-hidden="true">
              {HEATMAP_LEVELS.map((level, index) => (
                <span key={index} data-level={level} />
              ))}
            </div>
          </div>

          <div className="landing-preview-card">
            <div className="landing-preview-card-head">
              <b>{t("preview.recentContent")}</b>
              <span>{t("posters.recent")}</span>
            </div>
            <div className="landing-preview-posters" aria-hidden="true">
              {POSTER_COLORS.map((background, index) => (
                <div key={background} style={{ background }}>
                  <span>{t(`preview.poster${index + 1}`)}</span>
                </div>
              ))}
            </div>
          </div>

          {view === "record" ? <RecordPreview /> : null}
        </div>
      </div>

      <p className="landing-preview-caption">{t(`preview.${view}Caption`)}</p>
    </section>
  );
}

function PreviewStat({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong className={accent ? "is-accent" : ""}>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}

function RecordPreview() {
  const { t } = useTranslation();

  return (
    <div className="landing-preview-modal-layer" aria-hidden="true">
      <div className="landing-preview-modal">
        <div className="landing-preview-modal-head">
          <b>{t("modal.title")}</b>
          <span>✕</span>
        </div>
        <div className="landing-preview-type-tabs">
          <span className="is-active">{t("type.tv")}</span>
          <span>{t("type.movie")}</span>
          <span>{t("type.youtube")}</span>
        </div>
        <div className="landing-preview-picked">
          <div />
          <p>
            <b>{t("preview.sampleTitle")}</b>
            <span>{t("preview.sampleMeta")}</span>
          </p>
          <small>{t("common.change")}</small>
        </div>
        <label>
          <span>{t("modal.date")}</span>
          <div>2026-07-28</div>
        </label>
        <div className="landing-preview-reactions">
          <span>{t("modal.reactionPrompt")}</span>
          <div>
            <b>👎 {t("reaction.down")}</b>
            <b>👍 {t("reaction.up")}</b>
            <b className="is-active">😍 {t("reaction.love")}</b>
          </div>
        </div>
        <div className="landing-preview-note">{t("preview.sampleNote")}</div>
        <div className="landing-preview-save">{t("action.submitRecord")}</div>
      </div>
    </div>
  );
}
