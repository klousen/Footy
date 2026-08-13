import type { RankingEntry } from "../engine/types";
import { rankingScore } from "../engine/careerEngine";
import { useLanguage } from "./LanguageContext";

/**
 * Bestenliste (siehe Handoff Abschnitt 4): Tracking läuft immer, die Anzeige ist
 * an den Karriere-Pass gebunden. Gesperrt zeigt sie eine verschwommene Vorschau
 * der ECHTEN eigenen Top-Werte (keine Fake-Daten) über dem Lock-Overlay.
 */
export function LeaderboardScreen({
  entries,
  hasCareerPass,
  onBack,
  onUpgrade,
}: {
  entries: RankingEntry[];
  hasCareerPass: boolean;
  onBack: () => void;
  onUpgrade: () => void;
}) {
  const { t } = useLanguage();
  const sorted = [...entries].sort((a, b) => rankingScore(b) - rankingScore(a));
  const visible = hasCareerPass ? sorted : sorted.slice(0, 3);

  return (
    <div className="screen tm-screen">
      <button className="tm-back-link" onClick={onBack}>
        {t("backToTitle")}
      </button>

      <div className="tm-slot-header">
        <div className="tm-slot-eyebrow">{t("rankingTitleAccent")}</div>
        <h1 className="tm-slot-title">{t("rankingTitle")}</h1>
      </div>

      <div className="tm-ranking-panel" style={{ marginTop: 8 }}>
        {sorted.length === 0 && <div className="tm-leaderboard-empty">{t("leaderboardEmpty")}</div>}

        {visible.map((entry, i) => (
          <div key={i} className={`tm-rank-row ${i === 0 ? "tm-rank-first" : ""} ${!hasCareerPass ? "tm-panel-blurred" : ""}`}>
            <div className="tm-rank-pos">{i + 1}</div>
            <div className="tm-rank-main">
              <div className="tm-rank-name">{entry.playerName}</div>
              <div className="tm-rank-meta">
                {entry.nationFlag} {entry.nation} · {entry.longestClub.years} {t("yearsAbbr")} {t("yearsAtClub")} {entry.longestClub.name}
              </div>
            </div>
            <div className="tm-rank-scores">
              <div className="tm-score-block">
                <span className="tm-score-value ovr">{entry.finalOVR}</span>
                <span className="tm-score-label">OVR</span>
              </div>
              <div className="tm-score-block">
                <span className="tm-score-value legacy">{entry.legacyScore}</span>
                <span className="tm-score-label">{t("legacyLabel")}</span>
              </div>
            </div>
          </div>
        ))}

        {!hasCareerPass && sorted.length > 0 && (
          <div className="tm-lock-overlay">
            <svg className="tm-lock-icon" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 10V8a6 6 0 1112 0v2M5 10h14a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
            <div className="tm-lock-title">{t("lockTitle")}</div>
            <div className="tm-lock-sub">{t("lockSub")}</div>
            <button className="tm-lock-cta" onClick={onUpgrade}>
              {t("lockCta")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
