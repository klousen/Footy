import type { Traits } from "../engine/types";
import { TRAIT_LABEL, TRAIT_ORDER } from "./labels";

export function TraitBars({ traits }: { traits: Traits }) {
  return (
    <div className="attr-bars">
      {TRAIT_ORDER.map((key) => {
        const value = traits[key];
        return (
          <div className="attr-row" key={key}>
            <span className="attr-label">{TRAIT_LABEL[key]}</span>
            <div className="attr-track">
              <div className="attr-fill trait-fill" style={{ width: `${value}%` }} />
            </div>
            <span className="attr-value">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
