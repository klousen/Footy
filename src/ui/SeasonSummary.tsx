import type { Player, SeasonStats } from "../engine/types";
import { formatMoney, overallTier } from "./labels";

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
  const seasonIndex = player.seasonHistory.findIndex((s) => s === stats);
  const previous = seasonIndex > 0 ? player.seasonHistory[seasonIndex - 1] : null;
  const overallDelta = previous ? stats.overallRating - previous.overallRating : null;
  const tier = overallTier(stats.overallRating);

  return (
    <div className="screen summary-screen">
      <h2>{stats.seasonLabel} - Rückblick</h2>
      <p className="muted">
        {player.name} bei {stats.club} ({stats.leagueName})
      </p>

      <div className="stat-strip">
        <SummaryStat
          label={`Gesamtstärke · ${tier.label}`}
          value={`${stats.overallRating}${overallDelta ? ` (${overallDelta > 0 ? "+" : ""}${overallDelta})` : ""}`}
        />
        <SummaryStat label="Spiele" value={String(stats.matches)} />
        <SummaryStat label="Tore" value={String(stats.goals)} />
        <SummaryStat label="Vorlagen" value={String(stats.assists)} />
        <SummaryStat label="Ø Bewertung" value={String(stats.avgRating)} />
        <SummaryStat label="Tabelle" value={`${stats.leaguePosition}.`} />
        <SummaryStat label="Einkommen" value={formatMoney(stats.income)} />
        {stats.possibleMinutes > 0 && (
          <SummaryStat
            label="Einsatzquote"
            value={`${stats.minutesPlayed}/${stats.possibleMinutes} Min. (${Math.round(
              (stats.minutesPlayed / stats.possibleMinutes) * 100
            )}%)`}
          />
        )}
        {stats.capsThisSeason > 0 && (
          <SummaryStat label="Länderspiele" value={String(stats.capsThisSeason)} />
        )}
      </div>

      {stats.trophies.length > 0 && (
        <div className="banner banner-success">🏆 Gewonnen: {stats.trophies.join(", ")}</div>
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

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-chip">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
