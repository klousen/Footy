import { Fragment, useState } from "react";
import type { Player } from "../engine/types";
import { buildClubTenures, PRO_DEBUT_AGE } from "../engine/careerEngine";
import { overallTier } from "../engine/labels";

// Sechs Gesamtstärke-Tiers (siehe `overallTier` in labels.ts) als Hintergrundbänder
// im Chart UND als Spalten der Stationsliste darunter - siehe Nachtrag
// "Karriereverlauf-Chart: Konzeptwechsel, nicht Anpassung": die Bänder zeigen, WANN
// im Karriereverlauf welche Stufe erreicht wurde, statt (wie zuvor) nach Verein
// einzufärben - diese Info liefert die Stationsliste direkt darunter ohnehin schon.
const TIER_BANDS: { min: number; max: number; className: string; label: string; range: string }[] = [
  { min: 0, max: 50, className: "amateur", label: "Amateur", range: "0-49" },
  { min: 50, max: 60, className: "bronze", label: "Ausbaufähig", range: "50-59" },
  { min: 60, max: 70, className: "silver", label: "Solide", range: "60-69" },
  { min: 70, max: 80, className: "gold", label: "Star", range: "70-79" },
  { min: 80, max: 90, className: "elite", label: "Weltklasse", range: "80-89" },
  { min: 90, max: 99, className: "icon", label: "Ikone", range: "90-99" },
];

// Referenziert dieselben Custom Properties wie die `.tier-*`-Textklassen (siehe
// app.css) statt eigener Farbwerte - silver/gold/elite nutzen bewusst die
// bestehenden --silver/--gold/--gold-bright-Token, amateur/bronze/icon die
// dedizierten --tier-*-Token (siehe Handoff "Karriereende-Logik neu gewichten"
// Abschnitt 3: ein gemeinsames Farbvokabular, keine neuen Farben einführen).
const TIER_COLOR_VAR: Record<string, string> = {
  amateur: "var(--tier-amateur)",
  bronze: "var(--tier-bronze)",
  silver: "var(--silver)",
  gold: "var(--gold)",
  elite: "var(--gold-bright)",
  icon: "var(--tier-icon)",
};

/** Karriereverlauf: Liniendiagramm der Gesamtstärke über alle Saisons MIT
 * Tier-Bändern im Hintergrund + darunter die Stationsliste mit OVR-Übergängen
 * je Verein - EIN Panel (siehe Nachtrag "Karriereverlauf-Chart"), nicht mehr
 * zwei getrennte wie zuvor. Braucht mindestens 2 Saisons, sonst gibt es
 * schlicht keinen "Verlauf" zu zeigen. */
export function OverallScoreChart({ player }: { player: Player }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Der Verlauf soll erst mit dem Profidebüt beginnen, nicht mit der
  // Jugendakademie (siehe `PRO_DEBUT_AGE`) - die Jugendjahre haben eine ganz
  // andere Wertespanne (deutlich niedrigere Gesamtstärke) und gehören
  // erzählerisch nicht zur eigentlichen Profikarriere, die dieses Diagramm zeigt.
  const history = player.seasonHistory.filter((s) => s.age >= PRO_DEBUT_AGE);
  if (history.length < 2) return null;
  const tenures = buildClubTenures(player);

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
  const padB = 20; // Platz für die Vereinswechsel-Ticks unter der Achse
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const lastIndex = history.length - 1;
  const peakIndex = values.indexOf(max);
  const bandWidth = innerW / Math.max(1, lastIndex);

  const x = (i: number) => padL + (lastIndex === 0 ? innerW / 2 : (i / lastIndex) * innerW);
  const y = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const axisBottom = padT + innerH;

  // Zehner-Grenzen innerhalb des sichtbaren Bereichs für die Y-Achsen-Beschriftung
  // (siehe Nachtrag: "Y-Achse mit den Zehner-Grenzen beschriftet" statt der
  // früheren drei beliebig verteilten Gitterlinien).
  const axisTicks: number[] = [];
  for (let v = Math.ceil(yMin / 10) * 10; v < yMax; v += 10) {
    if (v > yMin) axisTicks.push(v);
  }

  // Tier-Bänder auf den sichtbaren Wertebereich geclippt.
  const bands = TIER_BANDS.map((b) => ({ ...b, top: Math.min(b.max, yMax), bottom: Math.max(b.min, yMin) })).filter(
    (b) => b.top > b.bottom
  );

  // Vereinswechsel-Ticks unter der X-Achse - bewusst OHNE Label (die Vereinsnamen
  // stehen bereits in der Stationsliste darunter, siehe Nachtrag Punkt 2).
  const changeIndices: number[] = [];
  for (let i = 1; i < history.length; i++) {
    if (history[i].club !== history[i - 1].club) changeIndices.push(i);
  }

  const peakTier = overallTier(max);

  return (
    <div className="panel score-chart-panel">
      <h3>Karriereverlauf</h3>
      <div className="score-chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="score-chart-svg"
          role="img"
          aria-label={`Verlauf der Gesamtstärke über ${history.length} Saisons, von ${values[0]} auf ${values[lastIndex]}, Höchstwert ${max}`}
        >
          {bands.map((b, i) => (
            <rect key={i} x={padL} y={y(b.top)} width={innerW} height={Math.max(0, y(b.bottom) - y(b.top))} fill={TIER_COLOR_VAR[b.className]} opacity={0.09} />
          ))}
          {bands.slice(0, -1).map((b) => (
            <line key={b.className} x1={padL} x2={W - padR} y1={y(b.bottom)} y2={y(b.bottom)} className="score-chart-grid" />
          ))}
          <line x1={padL} x2={W - padR} y1={axisBottom} y2={axisBottom} className="score-chart-grid" />

          {axisTicks.map((v) => (
            <text key={v} x={padL - 6} y={y(v)} className="score-chart-axis-label" textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          ))}

          {history.slice(1).map((s, idx) => {
            const i = idx + 1;
            const prev = history[i - 1];
            const x1 = x(i - 1);
            const y1 = y(prev.overallRating);
            const x2 = x(i);
            const y2 = y(s.overallRating);
            const length = Math.hypot(x2 - x1, y2 - y1);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="score-chart-segment"
                style={{ strokeDasharray: length, strokeDashoffset: length, animationDelay: `${idx * 0.06}s` }}
              />
            );
          })}

          {history.map((s, i) => {
            const dotTier = overallTier(s.overallRating);
            const isPeak = i === peakIndex;
            const isLast = i === lastIndex;
            return (
              <g key={i}>
                {isPeak && (
                  <>
                    <line
                      x1={x(i)}
                      x2={x(i)}
                      y1={y(s.overallRating) - 16}
                      y2={y(s.overallRating) - 4}
                      className="score-chart-peak-mark"
                    />
                    <text
                      x={x(i)}
                      y={y(s.overallRating) - 20}
                      textAnchor="middle"
                      className="score-chart-point-label"
                      style={{ fill: TIER_COLOR_VAR[peakTier.className] }}
                    >
                      {s.overallRating}
                    </text>
                  </>
                )}
                {!isPeak && isLast && (
                  <text x={x(i)} y={y(s.overallRating) - 10} textAnchor="middle" className="score-chart-point-label">
                    {s.overallRating}
                  </text>
                )}
                <circle
                  cx={x(i)}
                  cy={y(s.overallRating)}
                  r={isPeak ? 4 : 3}
                  fill={TIER_COLOR_VAR[dotTier.className]}
                  className="score-chart-dot"
                  style={{ animationDelay: `${i * 0.06}s` }}
                />
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

          {changeIndices.map((i) => (
            <line key={i} x1={x(i)} x2={x(i)} y1={axisBottom + 3} y2={axisBottom + 8} className="score-chart-tick" />
          ))}

          <text x={padL} y={H - 4} className="score-chart-axis-label">
            {history[0].age} J.
          </text>
          <text x={W - padR} y={H - 4} textAnchor="end" className="score-chart-axis-label">
            {history[lastIndex].age} J.
          </text>

          {activeIndex !== null && <line x1={x(activeIndex)} x2={x(activeIndex)} y1={padT} y2={axisBottom} className="score-chart-crosshair" />}
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

      {/* Tier-Legende - erscheint genau einmal im ganzen Screen (siehe Nachtrag). */}
      <div className="tier-key">
        {TIER_BANDS.map((b) => (
          <span key={b.className}>
            <i style={{ background: TIER_COLOR_VAR[b.className] }} />
            {b.label} {b.range}
          </span>
        ))}
      </div>

      {/* Stationsliste mit OVR-Übergängen (siehe Nachtrag Punkt 2) - ersetzt die
          frühere reine "Ø Pkt."-Darstellung. Ø Punkte bleibt als kleinere
          Zusatzinfo erhalten (`.st .p`), tier-eingefärbte OVR-Übergänge sind neu
          (`.st .o`, aus den in `buildClubTenures` mitgeführten
          `fromOverall`/`toOverall`). */}
      {tenures.length > 0 && (
        <div className="st">
          {tenures.map((t, i) => {
            const fromTier = overallTier(t.fromOverall);
            const toTier = overallTier(t.toOverall);
            return (
              <Fragment key={i}>
                <div className="a">{t.fromAge === t.toAge ? `${t.fromAge}` : `${t.fromAge}-${t.toAge}`}</div>
                <div className="c">
                  {t.club}
                  {t.onLoan && (
                    <span className="tenure-loan-tag" title="Leihe" aria-label="Leihe">
                      {" "}
                      (L)
                    </span>
                  )}
                  {t.promoted && (
                    <span className="tenure-arrow tenure-arrow-up" title="Aufstieg" aria-label="Aufstieg">
                      ↑
                    </span>
                  )}
                  {t.relegated && (
                    <span className="tenure-arrow tenure-arrow-down" title="Abstieg" aria-label="Abstieg">
                      ↓
                    </span>
                  )}
                </div>
                <div className="p">Ø {t.avgScore}</div>
                <div className="o">
                  <span style={{ color: TIER_COLOR_VAR[fromTier.className] }}>{t.fromOverall}</span>
                  <span className="arw">→</span>
                  <span style={{ color: TIER_COLOR_VAR[toTier.className] }}>{t.toOverall}</span>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
