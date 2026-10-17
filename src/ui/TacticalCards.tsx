import { useState } from "react";
import type { EventChoice, GameEvent } from "../engine/types";
import { ATTRIBUTE_LABEL } from "../engine/labels";

/**
 * Card-Liste-Auswahlbildschirm für `GameEvent.tactical.displayMode === 'cards'`
 * (siehe Handoff §6b "Card-Liste-Layout", Welle 3) - das Gegenstück zu
 * `TacticalBoard.tsx` für nicht-räumliche taktische Entscheidungen (Elfmeter,
 * Freistoß, Kapitänsbinde usw.): kein Spielfeld, nur Optionskarten. Optionen/
 * Outcomes/Ergebnis-Screen/Erfolgslogik sind identisch zu `TacticalBoard.tsx`
 * (dieselben `tacticalOption`-Daten, derselbe `resolveTacticalOutcome`-Pfad in
 * App.tsx) - nur die Auswahl-UI ist reduziert. Reuse-Hinweis: nutzt bewusst
 * dieselben `.tactical-option-*`-CSS-Klassen wie `TacticalBoard.tsx`, keine
 * neuen Styles nötig.
 */
const RISK_LABEL: Record<string, string> = {
  low: "Risiko niedrig",
  mid: "Risiko mittel",
  high: "Risiko hoch",
};

export function TacticalCards({ event, onChoose }: { event: GameEvent; onChoose: (choice: EventChoice) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const choices = event.choices.filter((c) => c.tacticalOption);
  if (!event.tactical || event.tactical.displayMode !== "cards" || choices.length === 0) return null;
  const selected = choices.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="tactical-cards">
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
