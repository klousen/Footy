import { useState } from "react";
import type { EventChoice, GameEvent } from "../engine/types";
import { ATTRIBUTE_LABEL } from "../engine/labels";

/**
 * Taktiktafel-Auswahlbildschirm für `GameEvent.tactical` (siehe "Handoff:
 * Taktische Entscheidungs-Events"). Rendert NUR die Auswahlphase (Feld +
 * Optionen + Bestätigen) - der Ergebnisbildschirm danach ist bewusst NICHT
 * eigens gebaut, sondern das ganz normale `.feedback-panel` aus `EventCard`
 * (siehe Handoff §7 "Ergebnis-Screen folgt 1:1 dem bestehenden Sofort-
 * Feedback-Muster" - Wiederverwendung statt Duplikat).
 *
 * ENTFERNBARKEIT: diese Datei + der `event.tactical`-Zweig in `EventCard.tsx`
 * sind der komplette UI-Fußabdruck des Features - siehe Kommentar in
 * tacticalEvents.ts für die vollständige Rückbau-Anleitung.
 */

const BOARD_W = 300;
const BOARD_H = 400;

const RISK_LABEL: Record<string, string> = {
  low: "Risiko niedrig",
  mid: "Risiko mittel",
  high: "Risiko hoch",
};

interface PitchGeometry {
  flip: boolean;
  cx: number;
  goalLineY: number;
  halfwayY: number;
  penTop: number;
  penW: number;
  penH: number;
  sixYardTop: number;
  sixYardW: number;
  sixYardH: number;
  penSpotY: number;
  arcEdgeY: number;
  arcW: number;
  arcH: number;
  arcSweep: 0 | 1;
  goalW: number;
  goalH: number;
  goalOuterY: number;
  cornerR: number;
  cSweep: 0 | 1;
  cSweepFar: 0 | 1;
  centerCircleR: number;
  centerSpotR: number;
  dir: 1 | -1;
}

/**
 * Feldgeometrie (siehe Handoff §2) - reale Feldproportionen (Strafraum
 * 40,3x16,5m, Torraum 18,32x5,5m usw.), 1:1 aus `buildBoard()` im Mockup
 * `taktik-popup-mockup-v5-proportionen.html` übernommen (bereits abgenommene
 * Referenzimplementierung), nur als React-SVG-Elemente statt HTML-String.
 * KEIN bestehendes Pitch-System im Projekt wiederverwendet (siehe
 * Handoff-Korrektur 1) - komplett neue, in sich geschlossene Berechnung.
 */
function computePitchGeometry(goalPosition: "top" | "bottom"): PitchGeometry {
  const W = BOARD_W;
  const flip = goalPosition === "bottom";
  const penW = (40.3 / 90) * W;
  const penH = penW / (40.3 / 16.5);
  const sixYardW = (18.3 / 40.3) * penW;
  const sixYardH = (5.5 / 16.5) * penH;
  const penSpotOffset = (11 / 16.5) * penH;
  const arcW = (19 / 40.3) * penW;
  const arcH = (4 / 16.5) * penH;
  const goalW = (7.3 / 90) * W;
  const goalH = goalW / (7.3 / 3.6);
  const cornerR = (4 / 90) * W;
  const centerCircleR = ((18.3 / 90) * W) / 2;
  const centerSpotR = ((1.6 / 90) * W) / 2;

  const margin = 8;
  const goalLineY = flip ? BOARD_H - margin : margin;
  const dir: 1 | -1 = flip ? -1 : 1;
  const cx = W / 2;
  const sixYardTop = flip ? goalLineY - sixYardH : goalLineY;
  const penTop = flip ? goalLineY - penH : goalLineY;
  const penSpotY = goalLineY - dir * penSpotOffset;
  const halfwayY = flip ? margin : BOARD_H - margin;
  const arcEdgeY = flip ? penTop : penTop + penH;
  const goalOuterY = goalLineY - dir * goalH;

  return {
    flip,
    cx,
    goalLineY,
    halfwayY,
    penTop,
    penW,
    penH,
    sixYardTop,
    sixYardW,
    sixYardH,
    penSpotY,
    arcEdgeY,
    arcW,
    arcH,
    arcSweep: flip ? 0 : 1,
    goalW,
    goalH,
    goalOuterY,
    cornerR,
    cSweep: flip ? 1 : 0,
    cSweepFar: flip ? 0 : 1,
    centerCircleR,
    centerSpotR,
    dir,
  };
}

function PitchMarkings({ goalPosition }: { goalPosition: "top" | "bottom" }) {
  const g = computePitchGeometry(goalPosition);
  const W = BOARD_W;
  const H = BOARD_H;
  const stripeH = 24;
  const stripeCount = Math.ceil(H / stripeH);
  const stripes = Array.from({ length: stripeCount }, (_, n) => n).filter((n) => n % 2 === 0);
  const netId = `tb-net-${goalPosition}`;
  const L = "var(--tb-white-lines)";

  return (
    <>
      <rect x={0} y={0} width={W} height={H} fill="var(--tb-grass-dark)" />
      {stripes.map((n) => (
        <rect key={n} x={0} y={n * stripeH} width={W} height={stripeH} fill="var(--tb-grass-light)" />
      ))}
      <line x1={4} y1={0} x2={4} y2={H} stroke={L} strokeWidth={2} />
      <line x1={W - 4} y1={0} x2={W - 4} y2={H} stroke={L} strokeWidth={2} />
      <line x1={4} y1={g.goalLineY} x2={W - 4} y2={g.goalLineY} stroke={L} strokeWidth={2.5} />
      <path
        d={`M 4 ${g.goalLineY - g.dir * g.cornerR} A ${g.cornerR} ${g.cornerR} 0 0 ${g.cSweep} ${4 + g.cornerR} ${g.goalLineY}`}
        fill="none"
        stroke={L}
        strokeWidth={1.5}
      />
      <path
        d={`M ${W - 4} ${g.goalLineY - g.dir * g.cornerR} A ${g.cornerR} ${g.cornerR} 0 0 ${g.cSweepFar} ${W - 4 - g.cornerR} ${g.goalLineY}`}
        fill="none"
        stroke={L}
        strokeWidth={1.5}
      />
      <rect x={g.cx - g.penW / 2} y={g.penTop} width={g.penW} height={g.penH} fill="none" stroke={L} strokeWidth={1.8} />
      <rect x={g.cx - g.sixYardW / 2} y={g.sixYardTop} width={g.sixYardW} height={g.sixYardH} fill="none" stroke={L} strokeWidth={1.8} />
      <circle cx={g.cx} cy={g.penSpotY} r={2.4} fill={L} />
      <path
        d={`M ${g.cx - g.arcW / 2} ${g.arcEdgeY} A ${g.arcW / 1.9} ${g.arcH * 2.3} 0 0 ${g.arcSweep} ${g.cx + g.arcW / 2} ${g.arcEdgeY}`}
        fill="none"
        stroke={L}
        strokeWidth={1.8}
      />
      <defs>
        <pattern id={netId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6} stroke="var(--tb-goal-net)" strokeWidth={0.6} />
          <line x1={0} y1={0} x2={6} y2={0} stroke="var(--tb-goal-net)" strokeWidth={0.6} />
        </pattern>
      </defs>
      <rect
        x={g.cx - g.goalW / 2}
        y={Math.min(g.goalOuterY, g.goalLineY)}
        width={g.goalW}
        height={g.goalH}
        fill={`url(#${netId})`}
        stroke={L}
        strokeWidth={1.5}
      />
      <line x1={4} y1={g.halfwayY} x2={W - 4} y2={g.halfwayY} stroke={L} strokeWidth={2} />
      <circle cx={g.cx} cy={g.halfwayY} r={g.centerCircleR} fill="none" stroke={L} strokeWidth={1.5} opacity={0.85} />
      <circle cx={g.cx} cy={g.halfwayY} r={g.centerSpotR} fill={L} />
    </>
  );
}

export function TacticalBoard({ event, onChoose }: { event: GameEvent; onChoose: (choice: EventChoice) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tactical = event.tactical;
  const choices = event.choices.filter((c) => c.tacticalOption);
  if (!tactical || tactical.displayMode !== "board" || choices.length === 0) return null;
  const selected = choices.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="tactical-board">
      <div className="tactical-board-label">
        <span>TAKTIKTAFEL</span>
        <span className="tactical-board-hint">{selected ? selected.label : "Option wählen"}</span>
      </div>
      <div className="tactical-board-frame">
        <svg className="tactical-board-svg" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} preserveAspectRatio="xMidYMid meet">
          <PitchMarkings goalPosition={tactical.goalPosition} />
          {tactical.players.map((p, i) => (
            <g key={i}>
              <circle className={`tactical-player ${p.type}`} cx={p.x} cy={p.y} r={8} />
              {p.label && (
                <text className={`tactical-player-num ${p.type}`} x={p.x} y={p.y + 0.5}>
                  {p.label}
                </text>
              )}
            </g>
          ))}
          {choices.map((c) => {
            const opt = c.tacticalOption!;
            return (
              <path
                key={c.id}
                d={opt.boardPath ?? ""}
                className={`tactical-arrow risk-${opt.risk}${selectedId === c.id ? " selected" : ""}`}
                onClick={() => setSelectedId(c.id)}
              />
            );
          })}
        </svg>
      </div>
      <div className="tactical-options-list">
        {choices.map((c) => {
          const opt = c.tacticalOption!;
          return (
            <button
              key={c.id}
              type="button"
              className={`tactical-option-row${selectedId === c.id ? " selected" : ""}`}
              onClick={() => setSelectedId(c.id)}
            >
              <span className={`tactical-option-swatch risk-${opt.risk}`} title={RISK_LABEL[opt.risk]} />
              <span className="tactical-option-text">
                <span className="tactical-option-label">{c.label}</span>
                {c.detail && <span className="tactical-option-desc">{c.detail}</span>}
              </span>
              <span className="tactical-option-attrs">{opt.relevantAttributes.map((k) => ATTRIBUTE_LABEL[k]).join(" · ")}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={`btn btn-primary tactical-confirm-btn${selected ? " enabled" : ""}`}
        disabled={!selected}
        onClick={() => selected && onChoose(selected)}
      >
        Entscheidung bestätigen
      </button>
    </div>
  );
}
