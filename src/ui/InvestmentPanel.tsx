import { availableInvestmentIds, INVESTMENT_DEFINITIONS, investmentCost } from "../engine/investments";
import type { Player, PersonalInvestmentId } from "../engine/types";
import { formatMoney } from "./labels";

// Kompaktes Aktivierungs-Panel statt eines großen Economy-Screens (siehe
// "investments.ts": Investments werden AKTIVIERT, nicht gekauft, max. 1
// gleichzeitig) - beim Öffnen bewusst nur die aktuell tatsächlich möglichen
// Optionen (siehe `availableInvestmentIds`), keine gesperrten/Cooldown-Einträge
// zur Auswahl.
export function InvestmentPanel({ player, onActivate, onClose }: { player: Player; onActivate: (id: PersonalInvestmentId) => void; onClose: () => void }) {
  const available = availableInvestmentIds(player);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Persönliches Umfeld</h3>
        </div>

        {player.activeInvestment ? (
          <div className="investment-active-banner">
            <strong>{INVESTMENT_DEFINITIONS[player.activeInvestment.id].label}</strong> aktiv · noch{" "}
            {player.activeInvestment.seasonsRemaining} Saison{player.activeInvestment.seasonsRemaining === 1 ? "" : "en"}
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
                  <button type="button" className="btn btn-outline-gold" disabled={!affordable} onClick={() => onActivate(id)}>
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
