import type { Player, SeasonStats } from "../engine/types";
import { overallRatingFromAttributes } from "../engine/types";
import { overallRating } from "../engine/careerEngine";
import { formatMoney, overallTier } from "./labels";
import { LeagueTableSnapshot } from "./LeagueTableSnapshot";
import { StatBox } from "./StatBox";

export function SeasonSummary({
  stats,
  player,
  onContinue,
}: {
  stats: SeasonStats;
  player: Player;
  onContinue: () => void;
}) {
  const recentLog = player.log.slice(-4);
  // Die Alterung (siehe `ageUpPlayer`) ist zu diesem Zeitpunkt bereits auf
  // `player` angewendet (finishSeasonEvents ruft sie direkt nach simulateSeason
  // auf) - die aktuelle Gesamtstärke spiegelt also schon den Zuwachs/Abbau
  // dieser Saison wider. Als Vergleichswert bewusst NICHT `stats.overallRating`
  // nehmen: das wird erst innerhalb von `simulateSeason` erfasst, welches erst
  // NACH allen Entscheidungs-Events dieser Saison läuft (siehe `finishSeasonEvents`)
  // - Attributzuwachs durch Entscheidungen während der Saison wäre darin also
  // schon "eingepreist" und würde im Delta fehlen (z.B. +1 durch eine Trainings-
  // Entscheidung, danach 0 weiterer Zuwachs -> Delta zeigt fälschlich 0). Stattdessen
  // denselben echten Saisonbeginn-Snapshot wie die Attribut-Balken verwenden (siehe
  // `attributesAtSeasonStart`), damit Delta wirklich die GESAMTE Saison abdeckt -
  // bewusst dieselbe Formel wie Dashboards "trend"-Anzeige (siehe dort), damit die
  // beiden Bildschirme sich nicht scheinbar widersprechen.
  const currentOverall = overallRating(player);
  const seasonStartOverall = overallRatingFromAttributes(stats.attributesAtSeasonStart, player.position);
  const overallDelta = currentOverall - seasonStartOverall;
  const tier = overallTier(currentOverall);
  const isGoalkeeper = player.position === "TW";
  const isDefender = player.position === "IV" || player.position === "AV";

  return (
    <div className="screen summary-screen">
      <h2>{stats.seasonLabel} - Rückblick</h2>
      <p className="muted">
        {player.name} bei {stats.club} ({stats.leagueName})
      </p>

      {/* Hero-Box für die Gesamtstärke (mit Trend-Pfeil + Tier), getrennt von den
          übrigen Werten - siehe footy-karriere-mockup.html ".hero-rating". */}
      <div className="hero-rating">
        <div className="num-block">
          <span className="num">{currentOverall}</span>
          {overallDelta !== 0 && (
            <span className={`trend ${overallDelta > 0 ? "up" : "down"}`}>
              {overallDelta > 0 ? "▲" : "▼"} {Math.abs(overallDelta)}
            </span>
          )}
        </div>
        <div className="tier-label">
          <div className="tier-name">{tier.label}</div>
          <div className="tier-sub">Gesamtstärke</div>
        </div>
      </div>

      {/* Primäre Reihe: die "Kopfzahlen" der Saison (Spiele + Torbeteiligung bzw. bei
          Torhütern die torwartspezifischen Pendants Weiße Westen/Gehaltene Bälle -
          siehe simulateSeason, dieselbe Ausnahme wie zuvor). */}
      <div className="stat-row-primary">
        <StatBox label="Spiele" value={String(stats.matches)} />
        {isGoalkeeper ? (
          <>
            <StatBox label="Weiße Westen" value={String(stats.cleanSheets)} />
            <StatBox label="Gehaltene Bälle" value={`${stats.savePercentage}%`} />
          </>
        ) : (
          <>
            <StatBox label="Tore" value={String(stats.goals)} />
            <StatBox label="Vorlagen" value={String(stats.assists)} />
          </>
        )}
      </div>

      {/* Sekundäre Reihe: unterstützende Werte, kleiner dargestellt - dieselben
          Bedingungen wie zuvor (Einsatzquote nur mit possibleMinutes, Länderspiele nur
          bei Einsätzen, Elfmeter gehalten nur bei Torhütern mit Wert > 0). Das Grid
          bricht bei mehr als 3 Kindern automatisch in weitere Zeilen um. */}
      <div className="stat-row-secondary">
        <StatBox label="Ø Bewertung" value={String(stats.avgRating)} />
        <StatBox label="Tabelle" value={`${stats.leaguePosition}.`} />
        {stats.possibleMinutes > 0 && (
          <StatBox
            label="Einsatzquote"
            value={`${Math.round((stats.minutesPlayed / stats.possibleMinutes) * 100)}%`}
            detail={`${stats.minutesPlayed}/${stats.possibleMinutes} Min.`}
          />
        )}
        <StatBox label="Einkommen" value={formatMoney(stats.income)} />
        {isGoalkeeper && stats.penaltiesSaved > 0 && (
          <StatBox label="Elfmeter gehalten" value={String(stats.penaltiesSaved)} />
        )}
        {isDefender && stats.bigChancesPrevented > 0 && (
          <StatBox label="Großchancen verhindert" value={String(stats.bigChancesPrevented)} />
        )}
        {stats.capsThisSeason > 0 && (
          <StatBox label="Länderspiele" value={String(stats.capsThisSeason)} />
        )}
      </div>

      {stats.trophies.length > 0 && (
        <div className="banner banner-success">🏆 Gewonnen: {stats.trophies.join(", ")}</div>
      )}

      {stats.europeanCup && !stats.europeanCup.champion && (
        <div className="banner banner-info">
          🌍 {stats.europeanCup.competition === "CL" ? "Champions Cup" : "Europa Cup"}: Ausgeschieden{" "}
          {stats.europeanCup.stageReached === "Ligaphase" ? "in der Ligaphase" : `im ${stats.europeanCup.stageReached}`}
        </div>
      )}

      {stats.promoted && (
        <div className="banner banner-success">⬆️ {stats.club} steigt auf!</div>
      )}
      {stats.relegated && (
        <div className="banner banner-warning">⬇️ {stats.club} steigt ab.</div>
      )}

      {(stats.yellowCards > 0 || stats.redCards > 0) && (
        <p className="muted">
          Karten: {stats.yellowCards}× Gelb{stats.redCards > 0 ? `, ${stats.redCards}× Rot` : ""}
        </p>
      )}

      {stats.tableSnapshot.length > 0 && (
        <div className="panel">
          <h3>Tabelle</h3>
          <LeagueTableSnapshot rows={stats.tableSnapshot} />
        </div>
      )}

      {stats.newAchievements.length > 0 && (
        <div className="panel">
          <h3>🏅 Neue Erfolge dieser Saison</h3>
          <div className="achievement-grid">
            {stats.newAchievements.map((a) => (
              <div key={a.id} className={`achievement-badge ${a.positive ? "positive" : "negative"}`}>
                <strong>{a.label}</strong>
                <span>{a.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="score-header">
          <h3>Saison-Bilanz</h3>
          <span className="score-badge">{stats.score} Pkt. · {stats.scoreTier}</span>
        </div>
        <ul className="score-factors">
          {stats.scoreFactors.map((f, i) => (
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

      <div className="panel">
        <h3>Was sonst geschah</h3>
        <ul className="mini-log">
          {recentLog.map((entry, i) => (
            <li key={i}>{entry.text}</li>
          ))}
        </ul>
      </div>

      <button className="btn btn-primary" onClick={onContinue}>
        Weiter
      </button>
    </div>
  );
}

