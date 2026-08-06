import { useState } from "react";
import type { Player } from "../engine/types";
import { buildClubTenures, PRO_DEBUT_AGE } from "../engine/careerEngine";

// Feste, kategoriale Farbfolge (Dark-Mode-Steps aus der dataviz-Skill-Referenzpalette) -
// gegen die App-Panelfläche (#161f2c) mit scripts/validate_palette.js geprüft: Kontrast,
// CVD-Trennschärfe (Protan/Deutan/Tritan) und Helligkeitsband bestehen alle für
// benachbarte Segmente. Jeder Verein bekommt der Reihe nach die nächste Farbe; ab dem
// 9. Verein (praktisch nie) fällt die Farbe auf ein neutrales Grau zurück statt eine
// Farbe zu wiederholen (siehe dataviz-Skill: "9th series folds into Other").
const CLUB_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const FALLBACK_COLOR = "#93a4bb";

/** Kompaktes Liniendiagramm der Gesamtstärke über alle Saisons - pro Vereins-
 * Zugehörigkeit eingefärbt, damit Wachstumsschübe/-einbrüche sich direkt einem
 * Kapitel der Karriere zuordnen lassen. Braucht mindestens 2 Saisons, sonst gibt
 * es schlicht keinen "Verlauf" zu zeigen. */
export function OverallScoreChart({ player }: { player: Player }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Der Verlauf soll erst mit dem Profidebüt beginnen, nicht mit der
  // Jugendakademie (siehe `PRO_DEBUT_AGE`) - die Jugendjahre haben eine ganz
  // andere Wertespanne (deutlich niedrigere Gesamtstärke) und gehören
  // erzählerisch nicht zur eigentlichen Profikarriere, die dieses Diagramm zeigt.
  const history = player.seasonHistory.filter((s) => s.age >= PRO_DEBUT_AGE);
  if (history.length < 2) return null;

  const tenures = buildClubTenures(player);
  // Farbe nach EINDEUTIGEM Vereinsnamen vergeben, nicht nach Zugehörigkeits-
  // Abschnitt: bei einer Rückkehr zu einem früheren Verein (z.B. "Heimkehr")
  // erzeugt buildClubTenures einen ZWEITEN, separaten Abschnitt mit demselben
  // Vereinsnamen - ohne diese Unterscheidung würde derselbe Verein in der Linie
  // an zwei Stellen unterschiedliche Farben tragen.
  const clubColor = new Map<string, string>();
  for (const t of tenures) {
    if (!clubColor.has(t.club)) {
      clubColor.set(t.club, CLUB_COLORS[clubColor.size] ?? FALLBACK_COLOR);
    }
  }

  const values = history.map((s) => s.overallRating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Etwas Luft über/unter den tatsächlichen Werten - eine Bewertungsskala ist von
  // Natur aus auf ~1-99 begrenzt und clustert meist in einer schmalen Bandbreite;
  // bei 0 zu starten würde jede Schwankung optisch verschwinden lassen (anders als
  // bei einem Anteils-/Mengenwert ist das hier vertretbar, siehe choosing-a-form.md).
  const pad = Math.max(2, Math.round((max - min) * 0.2));
  const yMin = Math.max(1, min - pad);
  const yMax = Math.min(99, max + pad);

  const W = 600;
  const H = 168;
  const padL = 28;
  const padR = 8;
  const padT = 22;
  const padB = 8;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const lastIndex = history.length - 1;
  const peakIndex = values.indexOf(max);
  const bandWidth = innerW / Math.max(1, lastIndex);

  const x = (i: number) => padL + (lastIndex === 0 ? innerW / 2 : (i / lastIndex) * innerW);
  const y = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const gridValues = [yMax, (yMin + yMax) / 2, yMin];

  return (
    <div className="panel score-chart-panel">
      <h3>Gesamtstärke-Verlauf</h3>
      <div className="score-chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="score-chart-svg"
          role="img"
          aria-label={`Verlauf der Gesamtstärke über ${history.length} Saisons, von ${values[0]} auf ${values[lastIndex]}, Höchstwert ${max}`}
        >
          {gridValues.map((gv, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} className="score-chart-grid" />
              <text x={padL - 6} y={y(gv)} className="score-chart-axis-label" textAnchor="end" dominantBaseline="middle">
                {Math.round(gv)}
              </text>
            </g>
          ))}

          {history.slice(1).map((s, idx) => {
            const i = idx + 1;
            const prev = history[i - 1];
            const color = clubColor.get(s.club) ?? FALLBACK_COLOR;
            const x1 = x(i - 1);
            const y1 = y(prev.overallRating);
            const x2 = x(i);
            const y2 = y(s.overallRating);
            const length = Math.hypot(x2 - x1, y2 - y1);
            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} L ${x2} ${y2} L ${x2} ${padT + innerH} L ${x1} ${padT + innerH} Z`}
                  fill={color}
                  opacity={0.1}
                />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  className="score-chart-segment"
                  style={{
                    strokeDasharray: length,
                    strokeDashoffset: length,
                    animationDelay: `${idx * 0.06}s`,
                  }}
                />
              </g>
            );
          })}

          {history.map((s, i) => {
            const color = clubColor.get(s.club) ?? FALLBACK_COLOR;
            const isPeak = i === peakIndex;
            const isLast = i === lastIndex;
            return (
              <g key={i}>
                {(isPeak || isLast) && (
                  <text x={x(i)} y={y(s.overallRating) - 10} textAnchor="middle" className="score-chart-point-label">
                    {s.overallRating}
                    {isPeak ? " ★" : ""}
                  </text>
                )}
                <circle cx={x(i)} cy={y(s.overallRating)} r={4} fill={color} className="score-chart-dot" style={{ animationDelay: `${i * 0.06}s` }} />
                <rect
                  x={x(i) - bandWidth / 2}
                  y={padT}
                  width={bandWidth}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  onMouseEnter={() => setActiveIndex(i)}
                  onFocus={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex((cur) => (cur === i ? null : cur))}
                  onBlur={() => setActiveIndex((cur) => (cur === i ? null : cur))}
                  className="score-chart-hit"
                  aria-label={`${s.seasonLabel}: Gesamtstärke ${s.overallRating} bei ${s.club}`}
                />
              </g>
            );
          })}

          {activeIndex !== null && (
            <line x1={x(activeIndex)} x2={x(activeIndex)} y1={padT} y2={padT + innerH} className="score-chart-crosshair" />
          )}
        </svg>

        {activeIndex !== null && (
          <div
            className="score-chart-tooltip"
            style={{
              left: `${(x(activeIndex) / W) * 100}%`,
              top: `${(y(history[activeIndex].overallRating) / H) * 100}%`,
            }}
          >
            <strong>{history[activeIndex].overallRating}</strong>
            <span>
              {history[activeIndex].seasonLabel} · {history[activeIndex].club} · Alter {history[activeIndex].age}
            </span>
          </div>
        )}
      </div>

      {tenures.length > 1 && (
        <div className="score-chart-legend">
          {tenures.map((t, i) => (
            <div key={i} className="score-chart-legend-item">
              <span className="score-chart-swatch" style={{ background: clubColor.get(t.club) ?? FALLBACK_COLOR }} />
              <span>
                {t.club} <span className="muted">({t.fromAge}-{t.toAge})</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
