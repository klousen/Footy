import type { TableRow } from "../engine/types";

/** Kompakter Tabellen-Ausschnitt für den Saisonrückblick: die eigene Zeile plus
 * bis zu drei Vereine darüber/darunter (siehe `buildTableSnapshot` in der Engine). */
export function LeagueTableSnapshot({ rows }: { rows: TableRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="table-snapshot">
      <div className="table-snapshot-row table-snapshot-head">
        <span>#</span>
        <span className="table-snapshot-club">Verein</span>
        <span>S</span>
        <span>U</span>
        <span>N</span>
        <span>Diff</span>
        <span>Pkt</span>
      </div>
      {rows.map((r) => (
        <div key={r.clubId} className={`table-snapshot-row${r.isPlayerClub ? " own" : ""}`}>
          <span>{r.position}</span>
          <span className="table-snapshot-club">{r.club}</span>
          <span>{r.wins}</span>
          <span>{r.draws}</span>
          <span>{r.losses}</span>
          <span>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</span>
          <span className="table-snapshot-pts">{r.points}</span>
        </div>
      ))}
    </div>
  );
}
