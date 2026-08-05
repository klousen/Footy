import { useState } from "react";
import type { LeagueState, Player } from "../engine/types";
import { POSITION_LABEL } from "../engine/types";
import { overallRating } from "../engine/careerEngine";
import { leagueNameForTier } from "../engine/leagueEngine";
import { AttributeBars } from "./AttributeBars";
import { formatMoney, RELATIONSHIP_LABEL } from "./labels";
import { Timeline } from "./Timeline";

export function Dashboard({
  player,
  league,
  onStartSeason,
}: {
  player: Player;
  league: LeagueState;
  onStartSeason: () => void;
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const overall = overallRating(player);
  const lastStats = player.seasonHistory[player.seasonHistory.length - 1];
  const leagueName = leagueNameForTier(league, player.club.tier);

  return (
    <div className="screen dashboard">
      <div className="player-header">
        <div>
          <h2>{player.name}</h2>
          <p className="muted">
            {POSITION_LABEL[player.position]} · {player.age} Jahre · {player.club.name} · {leagueName} (
            {league.flag} {league.countryName})
          </p>
        </div>
        <div className="overall-badge">
          <span className="overall-number">{overall}</span>
          <span className="overall-caption">Gesamtstärke</span>
        </div>
      </div>

      {player.injury && (
        <div className="banner banner-warning">
          🩹 Verletzt: {player.injury.label} - noch {player.injury.weeksOut} Wochen Ausfallzeit
        </div>
      )}

      <div className="stat-strip">
        <Stat label="Moral" value={`${player.morale}%`} />
        <Stat label="Fitness" value={`${player.fitness}%`} />
        <Stat label="Bekanntheit" value={`${player.reputation}%`} />
        <Stat label="Vereinsbeziehung" value={`${player.clubRelation}%`} />
        <Stat label="Vermögen" value={formatMoney(player.wealth)} />
        <Stat
          label="Privatleben"
          value={
            RELATIONSHIP_LABEL[player.relationshipStatus] + (player.children > 0 ? ` · ${player.children} Kind(er)` : "")
          }
        />
      </div>

      <div className="panel">
        <h3>Attribute</h3>
        <AttributeBars attributes={player.attributes} />
      </div>

      <div className="panel">
        <h3>Vertrag</h3>
        <div className="contract-grid">
          <span>Verein</span>
          <span>{player.club.name}</span>
          <span>Liga</span>
          <span>{leagueName}</span>
          <span>Rolle</span>
          <span>{player.contract.squadRole}</span>
          <span>Laufzeit</span>
          <span>{player.contract.yearsLeft} Jahr(e)</span>
          <span>Gehalt</span>
          <span>{formatMoney(player.contract.wagePerYear)} / Jahr</span>
        </div>
      </div>

      {lastStats && (
        <div className="panel">
          <h3>Letzte Saison ({lastStats.seasonLabel})</h3>
          <div className="contract-grid">
            <span>Spiele</span>
            <span>{lastStats.matches}</span>
            <span>Tore / Vorlagen</span>
            <span>
              {lastStats.goals} / {lastStats.assists}
            </span>
            <span>Ø Bewertung</span>
            <span>{lastStats.avgRating}</span>
            <span>Tabellenplatz</span>
            <span>{lastStats.leaguePosition}.</span>
          </div>
        </div>
      )}

      <div className="dashboard-actions">
        <button className="btn btn-primary" onClick={onStartSeason}>
          Neue Saison beginnen
        </button>
        <button className="btn btn-ghost" onClick={() => setShowTimeline(true)}>
          Karriereverlauf ansehen
        </button>
      </div>

      {showTimeline && <Timeline player={player} onClose={() => setShowTimeline(false)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-chip">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
