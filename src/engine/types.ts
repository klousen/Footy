// Kern-Datenmodelle für die Karriere-Simulation

import type { CountryId } from "./leagues";

export type AttributeKey =
  | "technik"
  | "tempo"
  | "physis"
  | "mentalitaet"
  | "intelligenz"
  | "charisma";

export type Attributes = Record<AttributeKey, number>;

export type Position = "TW" | "IV" | "AV" | "ZM" | "FS" | "ST";

export const POSITION_LABEL: Record<Position, string> = {
  TW: "Torwart",
  IV: "Innenverteidiger",
  AV: "Außenverteidiger",
  ZM: "Zentrales Mittelfeld",
  FS: "Flügelspieler",
  ST: "Stürmer",
};

// Gewichtung der Attribute für die Gesamtstärke je Position (summiert zu 1)
export const POSITION_WEIGHTS: Record<Position, Attributes> = {
  TW: { technik: 0.2, tempo: 0.1, physis: 0.25, mentalitaet: 0.3, intelligenz: 0.1, charisma: 0.05 },
  IV: { technik: 0.15, tempo: 0.15, physis: 0.3, mentalitaet: 0.2, intelligenz: 0.15, charisma: 0.05 },
  AV: { technik: 0.2, tempo: 0.25, physis: 0.2, mentalitaet: 0.15, intelligenz: 0.15, charisma: 0.05 },
  ZM: { technik: 0.25, tempo: 0.15, physis: 0.15, mentalitaet: 0.2, intelligenz: 0.2, charisma: 0.05 },
  FS: { technik: 0.3, tempo: 0.3, physis: 0.1, mentalitaet: 0.1, intelligenz: 0.15, charisma: 0.05 },
  ST: { technik: 0.3, tempo: 0.25, physis: 0.2, mentalitaet: 0.15, intelligenz: 0.05, charisma: 0.05 },
};

export type LeagueTier = 1 | 2;

/** Ein realer Verein (nur als Stadtname dargestellt) innerhalb einer Liga-Pyramide. */
export interface ClubState {
  id: string; // stabile ID, überlebt Auf-/Abstieg
  city: string; // Anzeigename, ggf. mit "I"/"II" bei mehreren Vereinen derselben Stadt
  tier: LeagueTier;
  strength: number; // 0-100 Vereinsstärke
}

/** Die komplette Liga-Pyramide (Liga 1 + Liga 2) eines gewählten Landes. */
export interface LeagueState {
  countryId: CountryId;
  countryName: string;
  flag: string;
  tier1Name: string;
  tier2Name: string;
  swapCount: number;
  tier1: ClubState[];
  tier2: ClubState[];
}

/** Momentaufnahme des aktuellen Vereins des Spielers. */
export interface Club {
  clubId: string; // Referenz auf ClubState.id in der LeagueState
  name: string; // = ClubState.city
  country: string; // Landesname zur Anzeige
  tier: LeagueTier;
  strength: number; // 0-100 Vereinsstärke
}

export interface Contract {
  club: string;
  yearsLeft: number;
  wagePerYear: number; // in €
  releaseClause?: number;
  squadRole: SquadRole;
}

export type SquadRole =
  | "Stammspieler"
  | "Rotation"
  | "Ergänzungsspieler"
  | "Ausbildungsspieler"
  | "Ersatzbank";

export interface Injury {
  label: string;
  weeksOut: number;
}

export type CareerStage =
  | "jugend" // 14-17
  | "durchbruch" // 18-22
  | "etabliert" // 23-29
  | "veteran" // 30-34
  | "spaetphase"; // 35+

export interface SeasonStats {
  seasonLabel: string; // z.B. "Saison 2031/32"
  age: number;
  club: string;
  leagueTier: LeagueTier;
  leagueName: string;
  matches: number;
  goals: number;
  assists: number;
  avgRating: number; // 1-10
  leaguePosition: number;
  trophies: string[];
  yellowCards: number;
  redCards: number;
  promoted: boolean;
  relegated: boolean;
}

export interface LogEntry {
  season: number;
  age: number;
  text: string;
  kind: "info" | "positive" | "negative" | "milestone";
}

export interface EffectDelta {
  attributes?: Partial<Attributes>;
  morale?: number;
  fitness?: number;
  reputation?: number;
  wealth?: number;
  injuryWeeksOut?: number;
  injuryLabel?: string;
  educationPoints?: number;
  clubRelation?: number;
  /** Setzt explizit, ob der Spieler offen für einen Vereinswechsel ist. */
  wantsTransfer?: boolean;
  logText?: string;
  logKind?: LogEntry["kind"];
}

/** Sofortiges Feedback nach einer Entscheidung - Text + lesbare Auswirkungen. */
export interface ChoiceFeedback {
  choiceId: string;
  text: string;
  kind: LogEntry["kind"];
  deltaLines: string[];
}

export interface EventChoice {
  id: string;
  label: string;
  detail?: string;
  effects: EffectDelta;
  /** Für Nachfolge-Konsequenzen, die erst später ausgewertet werden (z.B. Trainingsergebnis) */
  followUpChance?: { chance: number; success: EffectDelta; failure: EffectDelta };
}

export type EventCategory =
  | "training"
  | "lifestyle"
  | "medien"
  | "sponsoring"
  | "transfer"
  | "vertrag"
  | "verletzung"
  | "taktik"
  | "nationalmannschaft"
  | "jugend"
  | "meilenstein";

export interface GameEvent {
  id: string;
  templateId: string;
  category: EventCategory;
  title: string;
  description: string;
  choices: EventChoice[];
}

export interface EventTemplate {
  id: string;
  category: EventCategory;
  minAge: number;
  maxAge: number;
  weight: number;
  unique?: boolean;
  condition?: (player: Player) => boolean;
  build: (player: Player, ctx: { rng: () => number }) => Omit<GameEvent, "id" | "templateId">;
}

export interface Player {
  name: string;
  country: CountryId;
  position: Position;
  birthAge: number; // Startalter 14
  age: number;
  attributes: Attributes;
  potential: Attributes; // verborgene Obergrenze
  morale: number; // 0-100
  fitness: number; // 0-100
  reputation: number; // 0-100 (Bekanntheit)
  wealth: number; // €
  education: number; // 0-100, beeinflusst Post-Karriere & Intelligenz-Wachstum
  clubRelation: number; // 0-100, Verhältnis zum aktuellen Verein
  club: Club;
  contract: Contract;
  injury: Injury | null;
  stage: CareerStage;
  careerTotals: {
    matches: number;
    goals: number;
    assists: number;
    trophies: string[];
    yellowCards: number;
    redCards: number;
    caps: number; // Nationalmannschaftseinsätze
  };
  nationalTeamCaps: number;
  seasonHistory: SeasonStats[];
  log: LogEntry[];
  retired: boolean;
  postCareerPath?: string;
  wantsTransfer: boolean;
  /** Saisons seit dem letzten Transferangebot-Event (Cooldown-Zähler). */
  seasonsSinceTransferEvent: number;
  /** Aufeinanderfolgende Saisons auf/nahe der Bank (für Bankphasen-Mechanik). */
  consecutiveBenchSeasons: number;
}

export interface GameState {
  player: Player | null;
  leagueState: LeagueState | null;
  seasonNumber: number; // 1 = erste Saison
  screen: Screen;
  pendingEvents: GameEvent[];
  currentEvent: GameEvent | null;
  /** Sofort-Feedback zur zuletzt getroffenen Entscheidung, bevor es weitergeht. */
  feedback: ChoiceFeedback | null;
  lastSeasonStats: SeasonStats | null;
  usedTemplateIds: string[];
  legacyScore?: number;
  legacyTier?: string;
  epilogue?: string;
}

export type Screen =
  | "start"
  | "country"
  | "create"
  | "youthOffer"
  | "dashboard"
  | "event"
  | "seasonSummary"
  | "careerEnd";
