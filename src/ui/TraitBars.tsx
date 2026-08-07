import type { Traits } from "../engine/types";
import { TRAIT_LABEL, TRAIT_ORDER } from "./labels";
import { DeltaBar } from "./DeltaBar";

export function TraitBars({ traits, compare }: { traits: Traits; compare?: Traits }) {
  return (
    <div className="attr-bars">
      {TRAIT_ORDER.map((key) => (
        <DeltaBar key={key} label={TRAIT_LABEL[key]} value={traits[key]} compare={compare?.[key]} variant="char" />
      ))}
    </div>
  );
}
