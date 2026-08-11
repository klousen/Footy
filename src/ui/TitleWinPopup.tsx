import { useId, useMemo } from "react";
import type { Player, TitleType, TitleWin } from "../engine/types";
import {
  hasWonAnyTitleBefore,
  TITLE_TYPE_VISUAL,
  titleWinBaseSubline,
  titleWinContribLabel,
  titleWinEyebrow,
  titleWinGoldText,
  titleWinHeadline,
  titleWinMinutesText,
  titleWinReferenceSentence,
  titleWinRoleLabel,
  titleWinStatBoxes,
} from "./labels";

/** Farbverlauf je Tier für die Pokal-SVGs (siehe `TrophySvg`) - bewusst eigene,
 * kräftigere Hex-Werte statt der flachen `--gold`/`--silver`-Tokens: ein Icon
 * braucht Licht/Schatten-Abstufung, die ein einzelner Token nicht liefert (1:1 aus
 * dem Referenz-Mockup übernommen). */
const TIER_GRADIENT: Record<"gold" | "silver", { top: string; mid: string; bot: string }> = {
  gold: { top: "#f0d9a6", mid: "#c9a86a", bot: "#8a7248" },
  silver: { top: "#f2f5f6", mid: "#c7cdd2", bot: "#7d858c" },
};

/** Die drei Pokal-Silhouetten aus dem Referenz-Mockup, 1:1 übernommen - eigene
 * `gradientId` pro Instanz (statt fester IDs wie im Mockup), da im selben Popup
 * mehrere Trophäen gleichzeitig sichtbar sein können (Haupt-Pokal + gedimmte
 * Vorgänger-Icons, siehe `TitleWinPopup`). */
function TrophySvg({ shape, tier, gradientId }: { shape: "cup" | "plate" | "bigear"; tier: "gold" | "silver"; gradientId: string }) {
  const c = TIER_GRADIENT[tier];
  const gradient = (
    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={c.top} />
      <stop offset="55%" stopColor={c.mid} />
      <stop offset="100%" stopColor={c.bot} />
    </linearGradient>
  );
  const fill = `url(#${gradientId})`;
  if (shape === "plate") {
    return (
      <svg viewBox="0 0 64 64" fill="none">
        <defs>{gradient}</defs>
        <ellipse cx="32" cy="24" rx="17" ry="15" fill={fill} />
        <ellipse cx="32" cy="24" rx="11" ry="9.5" fill="#0e1c15" opacity="0.3" />
        <rect x="29" y="37" width="6" height="8" fill={fill} />
        <path d="M21 48c0-2.6 4.9-4.5 11-4.5s11 1.9 11 4.5v1.6H21V48z" fill={fill} />
      </svg>
    );
  }
  if (shape === "bigear") {
    return (
      <svg viewBox="0 0 64 64" fill="none">
        <defs>{gradient}</defs>
        <path d="M25 12h14v10c0 5.5-3.1 9.5-7 9.5s-7-4-7-9.5V12z" fill={fill} />
        <path
          d="M25 15h-9c-2.4 0-4 1.8-4 4.4 0 6.4 4.6 11 10.5 11.8"
          stroke={fill}
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M39 15h9c2.4 0 4 1.8 4 4.4 0 6.4-4.6 11-10.5 11.8"
          stroke={fill}
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="29" y="31.5" width="6" height="10" fill={fill} />
        <path d="M19 49c0-3 5.8-5.3 13-5.3s13 2.3 13 5.3v2H19v-2z" fill={fill} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <defs>{gradient}</defs>
      <path d="M22 10h20v14c0 7-4.5 12-10 12s-10-5-10-12V10z" fill={fill} />
      <path d="M22 13h-6c-2 0-3 1.4-3 3.4 0 5 3.4 8.6 8 9.3" stroke={fill} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M42 13h6c2 0 3 1.4 3 3.4 0 5-3.4 8.6-8 9.3" stroke={fill} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <rect x="29" y="35" width="6" height="9" fill={fill} />
      <path d="M20 50c0-3 5.4-5 12-5s12 2 12 5v2H20v-2z" fill={fill} />
      <circle cx="32" cy="19" r="3.2" fill="#0e1c15" opacity="0.35" />
    </svg>
  );
}

const CONFETTI_COLORS = ["#c9a227", "#e6c158", "#f2ede1", "#8a6d2f", "#c7cdd2"];

/** Konfetti-Konfiguration für DIESES Popup - `useMemo` statt der imperativen
 * DOM-Manipulation aus dem Mockup (`spawnConfetti`), damit React die Elemente
 * verwaltet. Neu gewürfelt bei jedem Wechsel des Titels (Typ+Saison), damit jedes
 * Popup einer Doublé/Triple-Sequenz sein eigenes, frisches Konfetti bekommt. */
function useConfetti(seed: string) {
  return useMemo(
    () =>
      Array.from({ length: 30 }, () => ({
        left: `${Math.random() * 100}%`,
        background: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        animationDelay: `${(Math.random() * 1.4 + 0.3).toFixed(2)}s`,
        animationDuration: `${(2 + Math.random() * 1.2).toFixed(2)}s`,
        width: `${(4 + Math.random() * 3).toFixed(1)}px`,
        height: `${(8 + Math.random() * 6).toFixed(1)}px`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed]
  );
}

/**
 * Titelgewinn-Popup (siehe Handoff "Titelgewinn-Popup") - läuft VOR der normalen
 * Saisonbilanz als eigener Zwischenschritt (siehe `App.tsx` `finishSeasonEvents`/
 * `handleContinueFromTitlePopup`), bei mehreren Titeln derselben Saison sequenziell
 * nacheinander. Styling/Animationen 1:1 aus dem Referenz-Mockup übernommen (siehe
 * `.tw-*`-Klassen in app.css).
 */
export function TitleWinPopup({
  titleWin,
  player,
  precedingTypes,
  isLastPopup,
  onContinue,
}: {
  titleWin: TitleWin;
  player: Player;
  /** `TitleType`s, die in DIESER Popup-Sequenz bereits mit "Weiter" bestätigt wurden -
   * steuert Doublé/Triple-Eyebrow, Referenzsatz und die gedimmten Vorgänger-Icons. */
  precedingTypes: TitleType[];
  /** Ob nach diesem Popup keine weiteren mehr in der Warteschlange stehen - steuert
   * den CTA-Text ("Weiter" vs. "Weiter zur Saisonbilanz"). */
  isLastPopup: boolean;
  onContinue: () => void;
}) {
  const visual = TITLE_TYPE_VISUAL[titleWin.type];
  const confetti = useConfetti(`${titleWin.season}-${titleWin.type}`);
  const mainGradientId = useId();
  const eyebrow = titleWinEyebrow(titleWin, precedingTypes);
  const referenceSentence = titleWinReferenceSentence(precedingTypes, titleWin.type);
  const baseSubline = titleWinBaseSubline(titleWin, player.position, hasWonAnyTitleBefore(player));
  const subline = referenceSentence ? `${baseSubline} ${referenceSentence}` : baseSubline;
  const statBoxes = titleWinStatBoxes(titleWin, player.position);

  return (
    <div className="screen tw-screen">
      <div className={`tw-backdrop tw-tier-${visual.tier}`}>
        <div className="tw-rays" />
        <div className="tw-confetti">
          {confetti.map((c, i) => (
            <span key={i} style={c} />
          ))}
        </div>
        <div className={`tw-card tw-tier-${visual.tier}`}>
          {precedingTypes.length > 0 && (
            <div className="tw-preceding-row">
              {precedingTypes.map((type, i) => {
                const pv = TITLE_TYPE_VISUAL[type];
                return <MiniTrophy key={type} tier={pv.tier} trophySvg={pv.trophySvg} isLast={i === precedingTypes.length - 1} />;
              })}
            </div>
          )}
          <div className="tw-eyebrow">{eyebrow}</div>
          <div className="tw-trophy-wrap">
            <div className="tw-trophy-glow" />
            <div className="tw-rings" />
            <div className="tw-rings tw-ring2" />
            <div className="tw-trophy">
              <TrophySvg shape={visual.trophySvg} tier={visual.tier} gradientId={mainGradientId} />
            </div>
          </div>
          <div className="tw-title-line">
            {titleWinHeadline(titleWin)}
            <span className="tw-gold-text">{titleWinGoldText(titleWin)}</span>
          </div>
          <div className="tw-subline" dangerouslySetInnerHTML={{ __html: subline }} />
          <div className="tw-divider" />
          <div className="tw-contrib">
            <div className="tw-contrib-label">{titleWinContribLabel(titleWin.type)}</div>
            <div className="tw-contrib-grid">
              {statBoxes.map((s, i) => (
                <div className="tw-stat-box" key={i}>
                  <div className="tw-stat-num">{s.num}</div>
                  <div className="tw-stat-tag">{s.tag}</div>
                </div>
              ))}
            </div>
            <div className="tw-role-row">
              <span className="tw-role-pill">{titleWinRoleLabel(titleWin.contribution.squadRole)}</span>
              <span>{titleWinMinutesText(titleWin)}</span>
            </div>
            <div className="tw-ovr-note">
              Gesamtstärke <b>{titleWin.overallBefore}</b>{" "}
              <span className="tw-ovr-arrow">→</span> <b>{titleWin.overallAfter}</b>
            </div>
          </div>
          <div className="tw-cta">
            <button className="tw-btn" onClick={onContinue}>
              {isLastPopup ? "Weiter zur Saisonbilanz" : "Weiter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Eine gedimmte, unanimierte Mini-Trophäe für einen bereits im vorherigen Popup
 * dieser Saison gezeigten Titel (siehe `.tw-preceding-row`) - jeweils eigene
 * `gradientId`, da mehrere gleichzeitig im DOM stehen können. */
function MiniTrophy({
  tier,
  trophySvg,
  isLast,
}: {
  tier: "gold" | "silver";
  trophySvg: "cup" | "plate" | "bigear";
  isLast: boolean;
}) {
  const gradientId = useId();
  return (
    <>
      <span className="tw-mini">
        <TrophySvg shape={trophySvg} tier={tier} gradientId={gradientId} />
      </span>
      {!isLast && <span className="tw-plus">+</span>}
    </>
  );
}
