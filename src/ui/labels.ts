// Re-Export für UI-Komponenten - die eigentlichen Labels leben auf Engine-Ebene
// (src/engine/labels.ts), damit die Engine (z.B. Feedback-Zusammenfassungen)
// ebenfalls darauf zugreifen kann, ohne von der UI-Schicht abhängig zu sein.
export {
  ATTRIBUTE_LABEL,
  ATTRIBUTE_ORDER,
  formatMoney,
  formatTrophyList,
  CATEGORY_LABEL,
  RELATIONSHIP_LABEL,
  TRAIT_LABEL,
  TRAIT_ORDER,
  overallTier,
  CAREER_PHENOTYPE_LABEL,
  CAREER_PHENOTYPE_DESCRIPTION,
  TRANSFER_DECISION_LABEL,
  TRANSFER_DECISION_MEANING,
  describeCareerMomentum,
  describeSeasonNarrative,
  turningPointForSeason,
} from "../engine/labels";
export type { OverallTier, NarrativeMomentumText } from "../engine/labels";
