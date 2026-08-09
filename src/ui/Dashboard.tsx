import { useState } from "react";
import type { LeagueState, Player } from "../engine/types";
import { POSITION_LABEL, overallRatingFromAttributes } from "../engine/types";
import { computeCareerNarrativeState, overallRating, seasonLabelForNumber, squadRoleLabel } from "../engine/careerEngine";
import { leagueNameForTier } from "../engine/leagueEngine";
import { AttributeBars } from "./AttributeBars";
import { TraitBars } from "./TraitBars";
import { StoryThreads } from "./StoryThreads";
import { describeCareerMomentum, formatMoney, overallTier, RELATIONSHIP_LABEL } from "./labels";
import { StatBox } from "./StatBox";
import { Timeline } from "./Timeline";

export function Dashboard({
  player,
  league,
  seasonNumber,
  onStartSeason,
}: {
  player: Player;
  league: LeagueState;
  seasonNumber: number;
  onStartSeason: () => void;
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const overall = overallRating(player);
  const lastStats = player.seasonHistory[player.seasonHistory.length - 1];
  const leagueName = leagueNameForTier(league, player.club.tier);
  const tier = overallTier(overall);
  // Entwicklung seit dem letzten Saisonabschluss - macht die Weiterentwicklung durch
  // Training/Entscheidungen direkt auf dem Dashboard sichtbar. Als Vergleichswert
  // bewusst NICHT `lastStats.overallRating` nehmen (das wird erst NACH allen
  // Entscheidungs-Events jener Saison erfasst, siehe SeasonSummary), sondern die
  // Gesamtstärke aus dem echten Saisonbeginn-Snapshot neu berechnen - exakt dieselbe
  // Formel wie im Saison-Rückblick (SeasonSummary), damit beide Bildschirme denselben
  // Delta-Wert zeigen statt sich scheinbar zu widersprechen.
  const trend = lastStats
    ? overall - overallRatingFromAttributes(lastStats.attributesAtSeasonStart, player.position)
    : null;
  // Klare Kennzeichnung, WELCHE Saison hier ansteht - ohne diesen Titel war beim
  // Wechsel vom Saison-Rückblick zurück aufs Dashboard nicht auf den ersten Blick
  // erkennbar, dass die neue Saison noch nicht begonnen hat.
  const upcomingSeasonLabel = seasonLabelForNumber(seasonNumber + 1);
  // Karrierebogen (siehe "CAREER NARRATIVE ... TECHNISCHE VERANKERUNG" Abschnitt 9/10/13):
  // EINE gemeinsame Quelle (`computeCareerNarrativeState`), rein natursprachlich - siehe
  // `describeCareerMomentum`s Doc-Kommentar, warum hier bewusst nur ein Panel statt zwei.
  const narrativeState = computeCareerNarrativeState(player);
  const momentum = describeCareerMomentum(narrativeState, player);

  return (
    <div className="screen dashboard">
      <p className="season-kicker">Vor {upcomingSeasonLabel}</p>
      <div className="player-header">
        <div>
          <h2>
            {player.name} <span className="pos-badge">{player.position}</span>
          </h2>
          <p className="muted">
            {POSITION_LABEL[player.position]} · {player.age} Jahre · {player.club.name} · {leagueName} (
            {league.flag} {league.countryName})
          </p>
        </div>
      </div>

      {player.injury && (
        <div className="banner banner-warning">
          🩹 Verletzt: {player.injury.label} - noch {player.injury.weeksOut} Wochen Ausfallzeit
        </div>
      )}

      {/* Hero-Box für die Gesamtstärke (mit Trend-Pfeil + Tier) - dasselbe Muster wie
          im Saisonrückblick (SeasonSummary), statt in einem uniformen 8er-Grid
          untergehen zu lassen (siehe footy-karriere-mockup.html .hero-rating). */}
      <div className="hero-rating">
        <div className="num-block">
          <span className="num">{overall}</span>
          {trend !== null && trend !== 0 && (
            <span className={`trend ${trend > 0 ? "up" : "down"}`}>
              {trend > 0 ? "▲" : "▼"} {Math.abs(trend)}
            </span>
          )}
        </div>
        <div className="tier-label">
          <div className="tier-name">{tier.label}</div>
          <div className="tier-sub">Gesamtstärke</div>
        </div>
      </div>

      {/* Zwei gestaffelte 3er-Reihen statt eines uniformen 6er-Grids - kurze Labels
          ohne Zeilenumbruch (siehe footy-karriere-mockup.html .presseason-primary/
          -secondary), dieselben Stat-Kacheln wie im Saisonrückblick. */}
      <div className="stat-row-primary">
        <StatBox label="Moral" value={`${player.morale}%`} />
        <StatBox label="Fitness" value={`${player.fitness}%`} />
        <StatBox label="Bekannt." value={`${player.reputation}%`} />
      </div>
      <div className="stat-row-secondary">
        <StatBox label="Verein" value={`${player.clubRelation}%`} />
        <StatBox label="Vermögen" value={formatMoney(player.wealth)} />
        <StatBox
          label="Privat"
          value={RELATIONSHIP_LABEL[player.relationshipStatus]}
          detail={player.children > 0 ? `${player.children} Kind(er)` : undefined}
        />
      </div>

      {/* Investitionen-Feature folgt in einem späteren Schritt (Kategorien, Preise,
          Tier-Gating) - hier bewusst nur der Platzhalter-Button an der richtigen
          Stelle im Design, noch ohne Funktion. */}
      <button type="button" className="btn btn-outline-gold" onClick={() => {}}>
        💼 Investitionen
      </button>

      {momentum && (
        <div className="panel narrative-momentum-panel">
          <h3>Karrierebogen</h3>
          <p className="narrative-momentum-headline">{momentum.headline}</p>
          <p className="muted">{momentum.text}</p>
        </div>
      )}

      <div className="panel">
        <h3>Attribute</h3>
        <AttributeBars attributes={player.attributes} compare={lastStats?.attributesAtSeasonStart} />
      </div>

      <div className="panel">
        <h3>Charakter & Ruf</h3>
        <p className="muted trait-hint">Prägt sich durch deine Entscheidungen und beeinflusst Wachstum, Leistung und welche Ereignisse künftig auftauchen.</p>
        <TraitBars traits={player.traits} compare={lastStats?.traitsAtSeasonStart} />
      </div>

      <StoryThreads threads={player.activeStorylines} seasonNumber={seasonNumber} />

      <div className="panel">
        <h3>Vertrag</h3>
        <div className="contract-grid">
          <span>Verein</span>
          <span>{player.club.name}</span>
          <span>Liga</span>
          <span>{leagueName}</span>
          <span>Rolle</span>
          <span>{squadRoleLabel(player.contract.squadRole, player.position)}</span>
          <span>Laufzeit</span>
          <span>{player.contract.yearsLeft} Jahr(e)</span>
          <span>Gehalt</span>
          <span>{formatMoney(player.contract.wagePerYear)} / Jahr</span>
        </div>
      </div>

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
