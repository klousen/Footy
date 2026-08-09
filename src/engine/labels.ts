import type { AttributeKey, CareerPhenotype, RelationshipStatus, TraitKey, TransferDecisionType } from "./types";

export const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  technik: "Technik",
  tempo: "Tempo",
  physis: "Physis",
  mentalitaet: "Mentalität",
  intelligenz: "Intelligenz",
  charisma: "Charisma",
};

export const ATTRIBUTE_ORDER: AttributeKey[] = [
  "technik",
  "tempo",
  "physis",
  "mentalitaet",
  "intelligenz",
  "charisma",
];

export function formatMoney(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} Mio €`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)} Tsd €`;
  return `${Math.round(v)} €`;
}

/** Fasst eine Titel-Liste (mit Wiederholungen, z.B. dreimal "Landespokal") zu
 * "Landespokal (3x), Meisterschale" zusammen - erste Nennung bestimmt die
 * Reihenfolge, damit die Liste bei jedem Aufruf stabil bleibt statt bei jedem
 * Rendern neu zu sortieren. Einzelne Titel (nur 1x) bekommen kein "(1x)"-Suffix. */
export function formatTrophyList(trophies: string[]): string {
  if (trophies.length === 0) return "keine";
  const counts = new Map<string, number>();
  for (const t of trophies) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} (${count}x)` : name)).join(", ");
}

export const CATEGORY_LABEL: Record<string, string> = {
  training: "Training",
  lifestyle: "Alltag",
  medien: "Medien",
  sponsoring: "Sponsoring",
  transfer: "Transfer",
  vertrag: "Vertrag",
  verletzung: "Verletzung",
  taktik: "Spielgeschehen",
  nationalmannschaft: "Nationalmannschaft",
  jugend: "Jugend",
  beziehung: "Beziehung & Familie",
  meilenstein: "Meilenstein",
  leihe: "Leihjahr",
};

export const RELATIONSHIP_LABEL: Record<RelationshipStatus, string> = {
  single: "Single",
  in_beziehung: "In einer Beziehung",
  verlobt: "Verlobt",
  verheiratet: "Verheiratet",
};

export const TRAIT_LABEL: Record<TraitKey, string> = {
  arbeitsmoral: "Arbeitsmoral",
  disziplin: "Disziplin",
  medienimage: "Medienimage",
  fuehrung: "Führungsstärke",
};

export const TRAIT_ORDER: TraitKey[] = ["arbeitsmoral", "disziplin", "medienimage", "fuehrung"];

export const SQUAD_ROLE_RANK: Record<string, number> = {
  Ausbildungsspieler: 0,
  Ersatzbank: 1,
  Ergänzungsspieler: 2,
  Rotation: 3,
  Stammspieler: 4,
};

/** Anzeige-Labels für `CareerPhenotype` (siehe "CAREER NARRATIVE & DECISION IMPACT
 * SYSTEM" Teil C, `detectCareerPhenotype` in careerEngine.ts). */
export const CAREER_PHENOTYPE_LABEL: Record<CareerPhenotype, string> = {
  WONDERKIND_DELIVERED: "Eingelöstes Versprechen",
  WONDERKIND_BUST: "Verpasstes Talent",
  LATE_BLOOMER: "Spätzünder",
  STEADY_PROFESSIONAL: "Verlässlicher Profi",
  ONE_CLUB_LEGEND: "Ein-Klub-Legende",
  JOURNEYMAN: "Wandervogel",
  NATIONAL_TEAM_ICON: "Nationalmannschafts-Ikone",
  NATIONAL_TEAM_SNUB: "Übersehenes Talent",
  TROPHY_COLLECTOR: "Titelsammler",
  NEARLY_MAN: "Fast-Mann",
  INJURY_PRONE_SURVIVOR: "Kämpfer gegen Verletzungspech",
  LATE_CAREER_RESURGENCE: "Zweiter Frühling",
  BOOM_OR_BUST_MOVER: "Alles-oder-nichts-Wechsler",
  CEILING_BREAKER: "Über sich hinausgewachsen",
};

export const CAREER_PHENOTYPE_DESCRIPTION: Record<CareerPhenotype, string> = {
  WONDERKIND_DELIVERED: "Das Jugendtalent hat sich bestätigt - aus dem frühen Versprechen wurde echte Weltklasse.",
  WONDERKIND_BUST: "Das Talent war unübersehbar - der ganz große Durchbruch ist trotzdem ausgeblieben.",
  LATE_BLOOMER: "Ein schwacher Karrierestart, dann eine echte Leistungsexplosion in der zweiten Karrierehälfte.",
  STEADY_PROFESSIONAL: "Über die ganze Karriere hinweg solide, konstant, ohne große Ausschläge nach oben oder unten.",
  ONE_CLUB_LEGEND: "Der gesamten aktiven Laufbahn treu geblieben - ein echtes Vereins-Urgestein.",
  JOURNEYMAN: "Viele Stationen, viele Neuanfänge - eine Karriere mit ständig wechselnden Vereinen.",
  NATIONAL_TEAM_ICON: "Über Jahre hinweg fester Bestandteil der Nationalmannschaft.",
  NATIONAL_TEAM_SNUB: "Elite-Niveau erreicht - eine Berufung zur Nationalmannschaft blieb trotzdem aus.",
  TROPHY_COLLECTOR: "Eine der ganz großen Titel-Sammlungen des Fußballs.",
  NEARLY_MAN: "Elite-Niveau erreicht, aber die ganz großen Titel fehlen in der Sammlung.",
  INJURY_PRONE_SURVIVOR: "Trotz langer Verletzungsgeschichte eine bemerkenswerte Karriere hingelegt.",
  LATE_CAREER_RESURGENCE: "Ein später Vereinswechsel brachte noch einmal spürbaren Aufschwung.",
  BOOM_OR_BUST_MOVER: "Eine Karriere voller großer, riskanter Entscheidungen - mal ging es steil bergauf, mal spürbar bergab.",
  CEILING_BREAKER: "Hat die eigenen Erwartungen in einzelnen Bereichen sogar übertroffen.",
};

/** Anzeige-Labels für `TransferDecisionType` (siehe `classifyTransferDecision` in
 * careerEngine.ts). */
export const TRANSFER_DECISION_LABEL: Record<TransferDecisionType, string> = {
  UPWARD_MOVE: "Aufstiegswechsel",
  LATERAL_MOVE: "Seitlicher Wechsel",
  DOWNWARD_MOVE: "Schritt zurück",
  PLAYING_TIME_MOVE: "Wechsel für Spielzeit",
  PRESTIGE_RISK_MOVE: "Prestige-Risiko",
  FINANCIAL_MOVE: "Finanziell motivierter Wechsel",
  STABILITY_DECISION: "Verbleib",
};

/**
 * FUT-artige Einordnung der Gesamtstärke (1-99) in klar erkennbare Stufen mit
 * eigener Farbgebung - macht Fortschritt auf einen Blick sichtbar, nicht nur
 * als nackte Zahl.
 */
export interface OverallTier {
  label: string;
  className: string;
}

export function overallTier(overall: number): OverallTier {
  if (overall >= 90) return { label: "Ikone", className: "icon" };
  if (overall >= 80) return { label: "Weltklasse", className: "elite" };
  if (overall >= 70) return { label: "Star", className: "gold" };
  if (overall >= 60) return { label: "Solide", className: "silver" };
  if (overall >= 50) return { label: "Ausbaufähig", className: "bronze" };
  return { label: "Amateur", className: "amateur" };
}
