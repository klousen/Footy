/** Gemeinsame Stat-Kachel (Design "Matchday Dossier") - genutzt von SeasonSummary
 * (`.stat-row-primary/secondary`) UND Dashboard (`.presseason-primary/secondary`),
 * da beide Screens exakt dasselbe visuelle Muster für kompakte Kennzahlen nutzen. */
export function StatBox({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="stat-box">
      <span className="v">{value}</span>
      {/* Optionale kleine Detailzeile (z.B. die rohen Einsatzminuten hinter der
          Prozentzahl) - bewusst getrennt vom Hauptwert, statt beides in einen
          langen String zu packen: ein langer String wie "93/1980 Min. (5%)"
          brach in der schmalen Box auf drei Zeilen um und wirkte kaputt. */}
      {detail && <span className="stat-detail">{detail}</span>}
      <span className="l">{label}</span>
    </div>
  );
}
