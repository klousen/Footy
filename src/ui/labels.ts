// Re-Export für UI-Komponenten - die eigentlichen Labels leben auf Engine-Ebene
// (src/engine/labels.ts), damit die Engine (z.B. Feedback-Zusammenfassungen)
// ebenfalls darauf zugreifen kann, ohne von der UI-Schicht abhängig zu sein.
export {
  ATTRIBUTE_LABEL,
  ATTRIBUTE_ORDER,
  formatMoney,
  CATEGORY_LABEL,
  RELATIONSHIP_LABEL,
  TRAIT_LABEL,
  TRAIT_ORDER,
  overallTier,
} from "../engine/labels";
export type { OverallTier } from "../engine/labels";
