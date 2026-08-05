import type { AttributeKey, RelationshipStatus } from "./types";

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
};

export const RELATIONSHIP_LABEL: Record<RelationshipStatus, string> = {
  single: "Single",
  in_beziehung: "In einer Beziehung",
  verlobt: "Verlobt",
  verheiratet: "Verheiratet",
};

export const SQUAD_ROLE_RANK: Record<string, number> = {
  Ausbildungsspieler: 0,
  Ersatzbank: 1,
  Ergänzungsspieler: 2,
  Rotation: 3,
  Stammspieler: 4,
};
