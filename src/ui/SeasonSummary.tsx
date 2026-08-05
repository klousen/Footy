import type { Player, SeasonStats } from "../engine/types";

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

  return (
    <div className="screen summary-screen">
      <h2>{stats.seasonLabel} - Rückblick</h2>
      <p className="muted">
        {player.name} bei {stats.club} ({stats.leagueName})
      </p>

      <div className="stat-strip">
        <SummaryStat label="Spiele" value={String(stats.matches)} />
        <SummaryStat label="Tore" value={String(stats.goals)} />
        <SummaryStat label="Vorlagen" value={String(stats.assists)} />
        <SummaryStat label="Ø Bewertung" value={String(stats.avgRating)} />
        <SummaryStat label="Tabelle" value={`${stats.leaguePosition}.`} />
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
