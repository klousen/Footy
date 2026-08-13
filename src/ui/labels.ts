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
  describeCareerPhenotype,
  TRANSFER_DECISION_LABEL,
  TRANSFER_DECISION_MEANING,
  describeCareerMomentum,
  describeSeasonNarrative,
  turningPointForSeason,
  TREND_LABEL,
  TITLE_TYPE_VISUAL,
  titleWinHeadline,
  titleWinGoldText,
  hasWonAnyTitleBefore,
  titleWinBaseSubline,
  titleWinEyebrow,
  titleWinReferenceSentence,
  titleWinRoleLabel,
  titleWinMinutesText,
  titleWinContribLabel,
  titleWinStatBoxes,
} from "../engine/labels";
export type { OverallTier, NarrativeMomentumText } from "../engine/labels";

import type { AttributeKey } from "../engine/types";

/** Dieselben vier Kombinationen wie bei der "Frühe Stärke"-Wahl in der
 * Charaktererstellung (siehe `CreatePlayer.tsx`) - EINE gemeinsame Quelle,
 * damit z.B. das Spezialtraining-Investment (siehe `InvestmentPanel.tsx`)
 * exakt dieselbe Auswahl anbietet statt einer eigenen, abweichenden Liste. */
export const EARLY_FOCUS_OPTIONS: { value: AttributeKey; hint: string }[] = [
  { value: "technik", hint: "Ballgefühl, Dribbling, Präzision" },
  { value: "tempo", hint: "Antritt, Sprintstärke" },
  { value: "physis", hint: "Kraft, Zweikampf, Ausdauer" },
  { value: "mentalitaet", hint: "Nervenstärke, Wille" },
];
