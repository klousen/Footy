import { useState } from "react";
import { availableInvestmentIds, INVESTMENT_DEFINITIONS, investmentCost, SPECIAL_TRAINING_FOCUS_ATTRIBUTES } from "../engine/investments";
import type { AttributeKey, Player, PersonalInvestmentId } from "../engine/types";
import { ATTRIBUTE_LABEL, EARLY_FOCUS_OPTIONS, formatMoney } from "./labels";

// Kompaktes Aktivierungs-Panel statt eines großen Economy-Screens (siehe
// "investments.ts": Investments werden AKTIVIERT, nicht gekauft, max. 1
// gleichzeitig) - beim Öffnen bewusst nur die aktuell tatsächlich möglichen
// Optionen (siehe `availableInvestmentIds`), keine gesperrten/Cooldown-Einträge
// zur Auswahl.
export function InvestmentPanel({
  player,
  onActivate,
  onClose,
}: {
  player: Player;
  onActivate: (id: PersonalInvestmentId, targetAttribute?: AttributeKey) => void;
  onClose: () => void;
}) {
  const available = availableInvestmentIds(player);
  // Fokusattribut fürs Spezialtraining: dieselben vier Kombinationen wie bei der
  // "Frühe Stärke"-Wahl der Charaktererstellung (siehe `EARLY_FOCUS_OPTIONS` -
  // ein gemeinsamer Auswahl-Pool statt einer eigenen Liste hier, wie vom Nutzer
  // gewünscht). Vorbelegt mit dem festen `player.focusAttribute`, sofern das
  // eine der vier wählbaren Optionen ist - sonst mit der ersten Option.
  const [specialTrainingFocus, setSpecialTrainingFocus] = useState<AttributeKey>(
    SPECIAL_TRAINING_FOCUS_ATTRIBUTES.includes(player.focusAttribute) ? player.focusAttribute : EARLY_FOCUS_OPTIONS[0].value
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Persönliches Umfeld</h3>
        </div>

        {player.activeInvestment ? (
          <div className="investment-active-banner">
            <strong>{INVESTMENT_DEFINITIONS[player.activeInvestment.id].label}</strong>
            {player.activeInvestment.id === "spezialtraining" &&
              ` (Fokus: ${ATTRIBUTE_LABEL[player.activeInvestment.targetAttribute ?? player.focusAttribute]})`}{" "}
            aktiv · noch {player.activeInvestment.seasonsRemaining} Saison{player.activeInvestment.seasonsRemaining === 1 ? "" : "en"}
            <p className="muted">Erst nach Ablauf (und Cooldown) lässt sich ein neues Investment aktivieren.</p>
          </div>
        ) : available.length === 0 ? (
          <p className="muted">Aktuell ist kein Investment verfügbar - entweder noch nicht freigeschaltet oder im Cooldown.</p>
        ) : (
          <div className="investment-list">
            {available.map((id) => {
              const def = INVESTMENT_DEFINITIONS[id];
              const cost = investmentCost(id, player);
              const affordable = player.wealth >= cost;
              const isSpecialTraining = id === "spezialtraining";
              return (
                <div key={id} className="investment-card">
                  <div className="investment-card-head">
                    <span className="investment-label">{def.label}</span>
                    <span className={affordable ? "investment-cost" : "investment-cost investment-cost-unaffordable"}>{formatMoney(cost)}</span>
                  </div>
                  <p className="muted investment-effect">{def.effectSummary}</p>
                  <p className="investment-meta">
                    {def.durationSeasons} Saison{def.durationSeasons === 1 ? "" : "en"} aktiv · danach {def.cooldownSeasons} Saison
                    {def.cooldownSeasons === 1 ? "" : "en"} Cooldown
                  </p>

                  {isSpecialTraining && (
                    <div className="field investment-focus-field">
                      <span>Fokusattribut</span>
                      <div className="option-grid option-grid-compact">
                        {EARLY_FOCUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={"option-card" + (specialTrainingFocus === opt.value ? " selected" : "")}
                            onClick={() => setSpecialTrainingFocus(opt.value)}
                          >
                            <strong>{ATTRIBUTE_LABEL[opt.value]}</strong>
                            <span>{opt.hint}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-outline-gold"
                    disabled={!affordable}
                    onClick={() => onActivate(id, isSpecialTraining ? specialTrainingFocus : undefined)}
                  >
                    {affordable ? "Aktivieren" : "Zu teuer"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}
