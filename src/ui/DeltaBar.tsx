/**
 * Zweischichtiger Delta-Balken (Design "Matchday Dossier") - Basis-Fill zeigt den
 * aktuellen Wert, ein zweites, an der Balkenspitze verankertes Segment zeigt die
 * Änderung seit dem letzten Snapshot (siehe `Player.attributesAtSeasonStart`/
 * `traitsAtSeasonStart`). Wird von `AttributeBars` (sportliche Attribute, Gold-
 * Verlauf) UND `TraitBars` (Charakter/Ruf, Blau-Lila-Verlauf via `variant="char"`)
 * gemeinsam genutzt, damit beide exakt demselben visuellen Muster folgen.
 *
 * `compare === undefined` (keine Vorsaison, z.B. ganz zu Beginn der Karriere)
 * unterdrückt die Delta-Anzeige komplett - `compare` gesetzt, aber Wert
 * unverändert (Delta = 0) zeigt weiterhin die "±0"-Pille, nur ohne Wachstums-
 * Segment auf dem Balken selbst (siehe Disziplin-Beispiel im Mockup).
 */
export function DeltaBar({
  label,
  value,
  compare,
  variant = "attr",
}: {
  label: string;
  value: number;
  compare?: number;
  variant?: "attr" | "char";
}) {
  const hasComparison = compare !== undefined;
  const delta = hasComparison ? value - (compare as number) : 0;
  const dir = delta > 0 ? "pos" : delta < 0 ? "neg" : "zero";
  const fillClass = variant === "char" ? "attr-fill char-fill" : "attr-fill";
  const growthClass = variant === "char" ? "attr-fill-growth char-fill" : "attr-fill-growth";
  const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
  const prevValue = hasComparison ? (compare as number) : value;
  // Verstärkungsfaktor 1.5 auf das ECHTE Delta (nicht den Rohwert) - sonst wirkt
  // z.B. +7 kaum größer als +2. Mindestbreite deckt CSS bereits über
  // `.attr-fill-growth{min-width:9px}` ab (siehe app.css).
  const growthWidth = Math.abs(delta) * 1.5;
  // Immer über `right` verankert (an der Balkenspitze), nie über `left` - das
  // Segment wächst von der höheren der beiden Positionen (vorher/nachher) nach
  // innen, unabhängig davon ob es ein Zuwachs oder ein Rückgang ist.
  const anchorRight = clamp100(100 - Math.max(prevValue, value));

  return (
    <div className="attr-row">
      <div className="attr-top">
        <span className="n">{label}</span>
        <span className="v-group">
          {hasComparison && (
            <span className={`delta ${dir}`}>{delta > 0 ? `+${delta}` : delta === 0 ? "±0" : delta}</span>
          )}
          <span className="v">{value}</span>
        </span>
      </div>
      <div className="attr-track">
        <div className={fillClass} style={{ width: `${clamp100(value)}%` }} />
        {hasComparison && delta !== 0 && (
          <div className={`${growthClass} ${dir}`} style={{ right: `${anchorRight}%`, width: `${growthWidth}%` }} />
        )}
      </div>
    </div>
  );
}
