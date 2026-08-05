import type { Player } from "../engine/types";
import { formatMoney } from "./labels";

export function CareerEnd({
  player,
  legacyScore,
  legacyTier,
  epilogue,
  onNewCareer,
}: {
  player: Player;
  legacyScore?: number;
  legacyTier?: string;
  epilogue?: string;
  onNewCareer: () => void;
}) {
  const t = player.careerTotals;
  return (
    <div className="screen career-end-screen">
      <div className="hero">
        <div className="hero-badge">🏁</div>
        <h1>Karriereende</h1>
        <p className="legacy-tier">{legacyTier}</p>
        {legacyScore !== undefined && <p className="muted">Legacy-Score: {legacyScore}</p>}
      </div>

      <p className="epilogue">{epilogue}</p>

      <div className="panel">
        <h3>Karrierestatistik</h3>
        <div className="contract-grid">
          <span>Spiele</span>
          <span>{t.matches}</span>
          <span>Tore</span>
          <span>{t.goals}</span>
          <span>Vorlagen</span>
          <span>{t.assists}</span>
          <span>Titel</span>
          <span>{t.trophies.length > 0 ? t.trophies.join(", ") : "keine"}</span>
          <span>Länderspiele</span>
          <span>{player.nationalTeamCaps}</span>
          <span>Karten</span>
          <span>
            {t.yellowCards}× Gelb, {t.redCards}× Rot
          </span>
          <span>Vermögen</span>
          <span>{formatMoney(player.wealth)}</span>
        </div>
      </div>

      <button className="btn btn-primary" onClick={onNewCareer}>
        Neue Karriere starten
      </button>
    </div>
  );
}
