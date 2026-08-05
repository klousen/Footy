import type { Achievement, Player, ScoreFactor } from "../engine/types";
import { buildClubTenures } from "../engine/careerEngine";
import { formatMoney, RELATIONSHIP_LABEL } from "./labels";
import { ShareCard } from "./ShareCard";

export function CareerEnd({
  player,
  legacyScore,
  legacyTier,
  legacyFactors,
  achievements,
  epilogue,
  onNewCareer,
}: {
  player: Player;
  legacyScore?: number;
  legacyTier?: string;
  legacyFactors?: ScoreFactor[];
  achievements?: Achievement[];
  epilogue?: string;
  onNewCareer: () => void;
}) {
  const t = player.careerTotals;
  const positiveAchievements = (achievements ?? []).filter((a) => a.positive);
  const negativeAchievements = (achievements ?? []).filter((a) => !a.positive);
  const clubTenures = buildClubTenures(player);
  const totalMinutesPlayed = player.seasonHistory.reduce((s, h) => s + h.minutesPlayed, 0);
  const totalPossibleMinutes = player.seasonHistory.reduce((s, h) => s + h.possibleMinutes, 0);

  return (
    <div className="screen career-end-screen">
      <div className="hero">
        <div className="hero-badge">🏁</div>
        <h1>Karriereende</h1>
        <p className="legacy-tier">{legacyTier}</p>
        {legacyScore !== undefined && <p className="muted">Legacy-Score: {legacyScore}</p>}
      </div>

      <p className="epilogue">{epilogue}</p>

      <ShareCard player={player} legacyScore={legacyScore} legacyTier={legacyTier} achievements={achievements} />

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
          <span>
            {player.nationalTeamCaps}
            {player.nationalTeamGoals > 0 ? ` (${player.nationalTeamGoals} Tore)` : ""}
          </span>
          {totalPossibleMinutes > 0 && (
            <>
              <span>Einsatzminuten</span>
              <span>
                {totalMinutesPlayed.toLocaleString("de-DE")} / {totalPossibleMinutes.toLocaleString("de-DE")} Min. (
                {Math.round((totalMinutesPlayed / totalPossibleMinutes) * 100)}%)
              </span>
            </>
          )}
          <span>Karten</span>
          <span>
            {t.yellowCards}× Gelb, {t.redCards}× Rot
          </span>
          <span>Vereinswechsel</span>
          <span>{player.clubChangesCount}</span>
          <span>Privatleben</span>
          <span>
            {RELATIONSHIP_LABEL[player.relationshipStatus]}
            {player.children > 0 ? ` · ${player.children} Kind(er)` : ""}
          </span>
          <span>Vermögen</span>
          <span>{formatMoney(player.wealth)}</span>
        </div>
      </div>

      {clubTenures.length > 0 && (
        <div className="panel">
          <h3>Karriereverlauf</h3>
          <ul className="club-tenure-list">
            {clubTenures.map((ct, i) => (
              <li key={i} className="club-tenure-item">
                <span className="club-tenure-age">
                  {ct.fromAge === ct.toAge ? `${ct.fromAge}` : `${ct.fromAge}-${ct.toAge}`}
                </span>
                <span className="club-tenure-club">{ct.club}</span>
                <span className="club-tenure-score">Ø {ct.avgScore} Pkt.</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {legacyFactors && legacyFactors.length > 0 && (
        <div className="panel">
          <h3>Legacy-Score im Detail</h3>
          <ul className="score-factors">
            {legacyFactors.map((f, i) => (
              <li key={i}>
                <span>{f.label}</span>
                <span className={f.points >= 0 ? "factor-positive" : "factor-negative"}>
                  {f.points > 0 ? "+" : ""}
                  {f.points}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(positiveAchievements.length > 0 || negativeAchievements.length > 0) && (
        <div className="panel">
          <h3>Erfolge & Kapitel dieser Karriere</h3>
          <div className="achievement-grid">
            {positiveAchievements.map((a) => (
              <div key={a.id} className="achievement-badge positive">
                <strong>{a.label}</strong>
                <span>{a.description}</span>
              </div>
            ))}
            {negativeAchievements.map((a) => (
              <div key={a.id} className="achievement-badge negative">
                <strong>{a.label}</strong>
                <span>{a.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn-primary" onClick={onNewCareer}>
        Neue Karriere starten
      </button>
    </div>
  );
}
