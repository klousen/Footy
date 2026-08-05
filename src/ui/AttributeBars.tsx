import type { Attributes } from "../engine/types";
import { ATTRIBUTE_LABEL, ATTRIBUTE_ORDER } from "./labels";

export function AttributeBars({ attributes, compare }: { attributes: Attributes; compare?: Attributes }) {
  return (
    <div className="attr-bars">
      {ATTRIBUTE_ORDER.map((key) => {
        const value = attributes[key];
        const prev = compare?.[key];
        const diff = prev !== undefined ? value - prev : 0;
        return (
          <div className="attr-row" key={key}>
            <span className="attr-label">{ATTRIBUTE_LABEL[key]}</span>
            <div className="attr-track">
              <div className="attr-fill" style={{ width: `${value}%` }} />
            </div>
            <span className="attr-value">
              {value}
              {diff !== 0 && (
                <span className={diff > 0 ? "attr-diff up" : "attr-diff down"}>
                  {diff > 0 ? ` +${diff}` : ` ${diff}`}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
