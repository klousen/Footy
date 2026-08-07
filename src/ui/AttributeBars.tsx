import type { Attributes } from "../engine/types";
import { ATTRIBUTE_LABEL, ATTRIBUTE_ORDER } from "./labels";
import { DeltaBar } from "./DeltaBar";

export function AttributeBars({ attributes, compare }: { attributes: Attributes; compare?: Attributes }) {
  return (
    <div className="attr-bars">
      {ATTRIBUTE_ORDER.map((key) => (
        <DeltaBar key={key} label={ATTRIBUTE_LABEL[key]} value={attributes[key]} compare={compare?.[key]} />
      ))}
    </div>
  );
}
