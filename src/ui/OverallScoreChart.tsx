import { Fragment, useState } from "react";
import type { Player } from "../engine/types";
import { buildClubTenures, PRO_DEBUT_AGE, tenureTrophyIcons, type TrophyIconKind } from "../engine/careerEngine";
import { overallTier } from "../engine/labels";

// SVG-Pfaddaten 1:1 aus footca-karriereende-v4.html (<symbol id="i-...">) übernommen,
// viewBox 0 0 24 24 - für die Trophäen-Icons in der Stationsliste (siehe
// `tenureTrophyIcons` in careerEngine.ts, Master-Handoff Abschnitt 6b).
const TROPHY_ICON_PATHS: Record<Exclude<TrophyIconKind, "euro">, string[]> = {
  champions: [
    "M8 3.4h8v4.9a4 4 0 0 1-8 0V3.4Z",
    "M8 4.6C5.1 4.6 3.4 6.2 3.4 8.3c0 2 1.5 3.3 3.4 3.5M16 4.6c2.9 0 4.6 1.6 4.6 3.7 0 2-1.5 3.3-3.4 3.5",
    "M12 12.3v4.4M8.9 20.6h6.2l-.6-3.9H9.5l-.6 3.9Z",
  ],
  meister: ["M12 2.6 4.6 5.4v6.1c0 4.6 3 8.2 7.4 9.9 4.4-1.7 7.4-5.3 7.4-9.9V5.4L12 2.6Z", "m12 8.1 1.3 2.7 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4L12 8.1Z"],
  pokal: ["M7 3.6h10v5.1a5 5 0 0 1-10 0V3.6Z", "M7 5.2H4.4v1.6A3.2 3.2 0 0 0 7 9.9M17 5.2h2.6v1.6a3.2 3.2 0 0 1-2.6 3.1", "M12 13.7v3.2M8.6 20.4h6.8l-.7-3.5H9.3l-.7 3.5Z"],
  aufstieg: ["M12 20V5.2M6.2 11 12 5.2 17.8 11"],
  auszeichnung: ["m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3.6Z"],
};

/** Ein einzelnes Trophäen-Icon für die Stationsliste (siehe `tenureTrophyIcons`).
 * "euro" ist ein Sonderfall (gestrichelter Kreis + Vollkreis statt Pfaden, wie im
 * Mockup `#i-euro`), alle anderen zeichnen ihre `TROPHY_ICON_PATHS`. */
function TrophyStationIcon({ kind }: { kind: TrophyIconKind }) {
  if (kind === "euro") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        <circle cx={12} cy={12} r={8.4} strokeDasharray="1.6 3.1" />
        <circle cx={12} cy={12} r={4.4} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={kind === "aufstieg" ? 1.6 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      {TROPHY_ICON_PATHS[kind].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

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
  // Y-Achse auf die Zehner-Grenzen um Karriere-Tiefstwert/-Bestwert gerundet (siehe
  // Master-Handoff "Karriereende-Screen v4" Abschnitt 6a: "Bereich dynamisch von der
  // nächsten 10er-Grenze unter dem Karriere-Tiefstwert bis über den Bestwert,
  // mindestens 3 Bänder") - NICHT mehr eine proportionale Polsterung wie zuvor.
  let yMin = Math.max(0, Math.floor(min / 10) * 10);
  let yMax = Math.min(99, Math.ceil(max / 10) * 10);
  // Mindestens 3 Tier-Bänder sichtbar, auch bei einer sehr engen Wertespanne (z.B.
  // kaum Wachstum über die ganze Karriere) - sonst zu wenig visueller Kontext.
  if (yMax - yMin < 30) {
    yMax = Math.min(99, yMin + 30);
    if (yMax - yMin < 30) yMin = Math.max(0, yMax - 30);
  }

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

  // Zehner-Grenzen für die Y-Achsen-Beschriftung, INKLUSIVE der beiden Ränder
  // (siehe Mockup: 40/50/60/70 bei yMin=40/yMax=70 - alle vier, nicht nur die
  // beiden mittleren).
  const axisTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += 10) {
    axisTicks.push(v);
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
          {/* Obere UND untere Randlinie (siehe Mockup: alle vier Zehner-Grenzen
              40/50/60/70 bekommen eine Linie, nicht nur die inneren Bandgrenzen). */}
          <line x1={padL} x2={W - padR} y1={padT} y2={padT} className="score-chart-grid" />
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
                  {/* Aufstieg wird jetzt über das Trophäen-Icon-System unten abgedeckt
                      (siehe `tenureTrophyIcons`) statt eines eigenen ↑-Pfeils - der
                      wäre doppelt gemoppelt. Abstieg hat keine Icon-Entsprechung
                      (siehe Master-Handoff Abschnitt 6b: nur die sechs benannten
                      Kategorien), behält deshalb seinen eigenen Pfeil. */}
                  {t.relegated && (
                    <span className="tenure-arrow tenure-arrow-down" title="Abstieg" aria-label="Abstieg">
                      ↓
                    </span>
                  )}
                  {tenureTrophyIcons(t).length > 0 && (
                    <span className="tr">
                      {tenureTrophyIcons(t).map((ic) => (
                        <span key={ic.kind} className="tr-item" title={ic.kind}>
                          <TrophyStationIcon kind={ic.kind} />
                          {ic.count > 1 && <span className="tr-count">×{ic.count}</span>}
                        </span>
                      ))}
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
