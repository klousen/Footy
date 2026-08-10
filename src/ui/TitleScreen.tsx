import { useRef } from "react";
import type { Player, RankingEntry } from "../engine/types";
import { overallRating } from "../engine/careerEngine";
import { overallTier } from "../engine/labels";
import { useLanguage } from "./LanguageContext";

const LONGPRESS_MS = 800;

/**
 * Titelmenü (siehe Handoff "Titelmenü, Spielstand-Slots & Bestenliste-Gating"
 * Abschnitt 1) - wird beim App-Start IMMER zuerst gezeigt, auch wenn ein
 * Spielstand existiert. Styling 1:1 am Referenz-Mockup orientiert (siehe
 * `.tm-*`-Klassen in app.css), eigener Namespace statt der sonst app-weiten
 * grünen `.btn-primary` - das Mockup nutzt bewusst Gold als Primärfarbe.
 */
export function TitleScreen({
  hasSave,
  previewPlayer,
  hasCareerPass,
  rankingPreview,
  onContinue,
  onNewCareer,
  onViewLeaderboard,
  onDevLongPress,
}: {
  hasSave: boolean;
  previewPlayer: Player | null;
  hasCareerPass: boolean;
  rankingPreview: RankingEntry[];
  onContinue: () => void;
  onNewCareer: () => void;
  onViewLeaderboard: () => void;
  onDevLongPress: () => void;
}) {
  const { language, setLanguage, t } = useLanguage();
  const pressTimer = useRef<number | null>(null);

  // Longpress (>= 800ms) auf den Footer-Versionstext - nur im Dev-Build aktiv
  // (siehe Handoff Abschnitt 3 "Dev-Toggle zum Testen"). Rein lokaler Zeitgeber,
  // kein Server-Call.
  function startPress() {
    if (!import.meta.env.DEV) return;
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      onDevLongPress();
    }, LONGPRESS_MS);
  }
  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  const tier = previewPlayer ? overallTier(overallRating(previewPlayer)) : null;

  return (
    <div className="screen tm-screen">
      <div className="tm-topbar">
        <div className="tm-lang-toggle">
          <button className={language === "de" ? "active" : ""} onClick={() => setLanguage("de")}>
            DE
          </button>
          <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>
            EN
          </button>
        </div>
      </div>

      <div className="tm-hero">
        <div className="tm-crest">
          <span>F</span>
        </div>
        <h1 className="tm-wordmark">FOOTCA</h1>
        <div className="tm-divider" />
        <div className="tm-tagline">{t("tagline")}</div>

        {hasSave && previewPlayer && tier && (
          <div className="tm-save-chip">
            <span className="tm-dot" />
            <span>
              {previewPlayer.name} · {previewPlayer.age} {t("yearsAbbr")} · <strong>{overallRating(previewPlayer)} OVR</strong> ·{" "}
              {tier.label}
            </span>
          </div>
        )}
      </div>

      <div className="tm-menu">
        {hasSave && (
          <button className="tm-btn tm-btn-primary" onClick={onContinue}>
            ▶ {t("continueCareer")}
          </button>
        )}
        <button className={hasSave ? "tm-btn tm-btn-secondary" : "tm-btn tm-btn-primary"} onClick={onNewCareer}>
          {t("newCareer")}
        </button>
        <button className="tm-btn tm-btn-ghost" onClick={onViewLeaderboard}>
          {t("viewLeaderboard")}
        </button>
      </div>

      <div className="tm-ranking-panel">
        <div className="tm-ranking-header" onClick={onViewLeaderboard}>
          <div className="tm-ranking-title">
            {t("rankingTitle")} · <span>{t("rankingTitleAccent")}</span>
          </div>
          <div className="tm-ranking-link">{t("rankingLink")}</div>
        </div>

        {rankingPreview.slice(0, 3).map((entry, i) => (
          <div key={i} className={`tm-rank-row ${i === 0 ? "tm-rank-first" : ""} ${!hasCareerPass ? "tm-panel-blurred" : ""}`}>
            <div className="tm-rank-pos">{i + 1}</div>
            <div className="tm-rank-main">
              <div className="tm-rank-name">{entry.playerName}</div>
              <div className="tm-rank-meta">
                {entry.nationFlag} {entry.nation} · {entry.longestClub.years} {t("yearsAbbr")} {entry.longestClub.name}
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

        {!hasCareerPass && rankingPreview.length > 0 && (
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
            <button className="tm-lock-cta" onClick={onViewLeaderboard}>
              {t("lockCta")}
            </button>
          </div>
        )}
      </div>

      <div className="tm-footer">
        <button
          className="tm-footer-text"
          title="Longpress: Dev-Toggle Karriere-Pass"
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
        >
          FOOTCA · SAISON 2026/27 · V{__APP_VERSION__}
        </button>
      </div>
    </div>
  );
}
