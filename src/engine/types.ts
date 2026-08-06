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

export type RelationshipStatus = "single" | "in_beziehung" | "verlobt" | "verheiratet";

/**
 * Charakterwerte, die sich aus vergangenen Entscheidungen ergeben (0-100, 50 = neutral).
 * Anders als die sportlichen Attribute wirken sie sich nicht auf die Gesamtstärke aus,
 * sondern auf Wachstum, Saison-Simulation, Vereinsbeziehung und darauf, welche
 * zukünftigen Events überhaupt freigeschaltet werden - das "Gedächtnis" der Karriere.
 */
export type TraitKey = "arbeitsmoral" | "disziplin" | "medienimage" | "fuehrung";

export type Traits = Record<TraitKey, number>;

export interface ScoreFactor {
  label: string;
  points: number;
}

/** Ein zusammenhängender Zeitraum bei einem Verein - abgeleitet aus `seasonHistory`
 * für den kompakten Karriereverlauf am Karriereende (siehe `buildClubTenures`). */
export interface ClubTenure {
  club: string;
  fromAge: number;
  toAge: number;
  seasons: number;
  avgScore: number;
  /** Ob der Verein während dieser Zugehörigkeit mindestens einmal auf-/abgestiegen ist. */
  promoted: boolean;
  relegated: boolean;
}

export interface SeasonStats {
  seasonLabel: string; // z.B. "Saison 2031/32"
  age: number;
  club: string;
  /** Gesamtstärke während dieser Saison (vor dem Wachstum am Saisonende). */
  overallRating: number;
  leagueTier: LeagueTier;
  leagueName: string;
  matches: number;
  /** Tatsächlich gespielte Minuten diese Saison (siehe `possibleMinutes` für die Team-Gesamtminuten). */
  minutesPlayed: number;
  /** Maximal mögliche Minuten des Teams diese Saison (Team-Spiele × 90) - Vergleichsbasis für die Einsatzquote. */
  possibleMinutes: number;
  goals: number;
  assists: number;
  /** Länderspiel-Einsätze in dieser Saison (Differenz zu `Player.capsAtSeasonStart`). */
  capsThisSeason: number;
  avgRating: number; // 1-10
  leaguePosition: number;
  trophies: string[];
  yellowCards: number;
  redCards: number;
  promoted: boolean;
  relegated: boolean;
  /** Gehalt + Leistungsboni, die in dieser Saison ausgezahlt wurden. */
  income: number;
  /** Bekanntheits-Zuwachs in dieser Saison (für die Saison-Bilanz). */
  reputationGain: number;
  /** Mehrfaktorielle Saison-Bilanz. */
  score: number;
  scoreTier: string;
  scoreFactors: ScoreFactor[];
  /** In dieser Saison neu freigeschaltete Erfolge - für kontextualisiertes Feedback direkt im Saisonrückblick. */
  newAchievements: Achievement[];
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
  /** Multipliziert das aktuelle Jahresgehalt (z.B. 1.35 für +35%). */
  wageMultiplier?: number;
  relationshipStatus?: RelationshipStatus;
  /** `null` setzt explizit "keine Partnerschaft mehr" (Trennung). */
  partnerName?: string | null;
  childrenDelta?: number;
  /** Länderspiel-Einsätze (Nationalmannschaft), addiert auf `Player.nationalTeamCaps`. */
  capsDelta?: number;
  /** Länderspieltore, addiert auf `Player.nationalTeamGoals`. */
  goalsDelta?: number;
  /** Schützt die Kaderrolle für N weitere Saisons vor dem Abrutschen unter "Rotation". */
  roleProtectionSeasons?: number;
  /** Stärkere Variante von `roleProtectionSeasons`: garantiert für N Saisons mindestens
   * "Stammspieler" (z.B. vertraglich vereinbarte Stammplatzgarantie) - wirkt sich über
   * die Kaderrolle direkt auf Einsatzminuten, Tore/Vorlagen etc. aus. */
  startingRoleGuaranteeSeasons?: number;
  /** Ernennt zum Kapitän der Nationalmannschaft. */
  nationalTeamCaptain?: boolean;
  /** Setzt die Kaderrolle sofort direkt (z.B. Durchbruch nach einer Bewährungschance). */
  squadRoleOverride?: SquadRole;
  /** Verändert Charakterwerte (Arbeitsmoral, Disziplin, Medienimage, Führung). */
  traitDeltas?: Partial<Record<TraitKey, number>>;
  /**
   * Startet, verlängert oder beendet eine mehrjährige Ereignis-Reihe. Ist
   * `nextTemplateId` gesetzt, wird diese Stufe nach `delaySeasons` Saisons
   * garantiert (nicht zufällig) eingespielt - sonst gilt die Reihe als
   * abgeschlossen. `data` transportiert Kontext (z.B. den Namen eines
   * Rivalen) unverändert in die Build-Funktion der nächsten Stufe.
   */
  storyline?: {
    storylineId: string;
    label: string;
    stage: number;
    totalStages: number;
    nextTemplateId?: string;
    delaySeasons?: number;
    data?: Record<string, string>;
  };
  logText?: string;
  logKind?: LogEntry["kind"];
}

/** Eine laufende, mehrjährige Ereignis-Reihe (siehe `EffectDelta.storyline`). */
export interface StoryThread {
  storylineId: string;
  label: string;
  stage: number;
  totalStages: number;
  nextTemplateId: string;
  dueSeason: number;
  data?: Record<string, string>;
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
  | "beziehung"
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
  /**
   * Wird nur als garantierte Fortsetzung einer Storyline eingespielt (siehe
   * `StoryThread`), nie über die normale zufällige Auswahl - taucht daher
   * nicht in `eligibleTemplates()` auf.
   */
  storylineOnly?: boolean;
  build: (
    player: Player,
    ctx: { rng: () => number; storyData?: Record<string, string> }
  ) => Omit<GameEvent, "id" | "templateId">;
}

export interface Player {
  name: string;
  country: CountryId;
  /** Ursprüngliches Heimatland - bleibt über die gesamte Karriere unverändert, auch
   * wenn `country` durch Auslandswechsel wechselt (siehe `applyClubOfferChoice`).
   * Grundlage dafür, eine Rückkehr ins Heimatland als "Heimkehr" statt als
   * normalen Auslandswechsel zu erkennen. */
  homeCountryId: CountryId;
  position: Position;
  birthAge: number; // Startalter 14
  age: number;
  attributes: Attributes;
  potential: Attributes; // verborgene Obergrenze
  /** Fraktionaler Wachstums-/Abbau-Rest je Attribut, der beim Runden auf ganze
   * Punkte übrig bleibt und in die nächste Saison mitgenommen wird (siehe `ageUpPlayer`). */
  growthCarry: Partial<Record<AttributeKey, number>>;
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
  /** Tore für die Nationalmannschaft - separat von den Vereinstoren getrackt. */
  nationalTeamGoals: number;
  /** Länderspiel-Stand zu Beginn der laufenden Saison - Basis, um `capsThisSeason` je Saison zu ermitteln. */
  capsAtSeasonStart: number;
  seasonHistory: SeasonStats[];
  log: LogEntry[];
  retired: boolean;
  postCareerPath?: string;
  wantsTransfer: boolean;
  /** Saisons seit dem letzten Transferangebot-Event (Cooldown-Zähler). */
  seasonsSinceTransferEvent: number;
  /** Aufeinanderfolgende Saisons auf/nahe der Bank (für Bankphasen-Mechanik). */
  consecutiveBenchSeasons: number;
  /** Solange > 0, rutscht die Kaderrolle nicht unter "Rotation" ab (Bewährungschance). */
  roleProtectionSeasons: number;
  /** Solange > 0, ist mindestens "Stammspieler" garantiert (vertragliche Stammplatzgarantie). */
  startingRoleGuaranteeSeasons: number;
  /** Wurde bereits Kapitän der Nationalmannschaft (schaltet u.a. ein Achievement frei). */
  nationalTeamCaptain: boolean;
  /** Anzahl tatsächlich vollzogener Vereinswechsel (für Legacy-Faktoren/Achievements). */
  clubChangesCount: number;
  /** Aufsummierte Verletzungswochen über die gesamte Karriere. */
  totalInjuryWeeks: number;
  relationshipStatus: RelationshipStatus;
  partnerName: string | null;
  children: number;
  /** Charakterwerte aus vergangenen Entscheidungen - siehe `TraitKey`. */
  traits: Traits;
  /** Laufende mehrjährige Ereignis-Reihen (Rivalität, Comeback, ...) - siehe `StoryThread`. */
  activeStorylines: StoryThread[];
  /** IDs abgeschlossener Ereignis-Reihen (verhindert erneuten Start derselben Geschichte). */
  completedStorylines: string[];
  /** Solange > 0, wächst das Wachstum durch das bessere Trainingsumfeld eines Top-Vereins schneller. */
  trainingBoostSeasons: number;
  /** IDs bereits freigeschalteter Erfolge - für die "neu"-Erkennung im Saisonrückblick. */
  unlockedAchievementIds: string[];
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
  positive: boolean;
}

export interface GameState {
  player: Player | null;
  /** Liga-Pyramide des Landes, in dem der Spieler aktuell unter Vertrag steht. */
  leagueState: LeagueState | null;
  /**
   * Gecachte Liga-Pyramiden anderer Länder - werden lazy beim ersten
   * Auslands-Angebot gebaut und bleiben danach stabil (kein Neu-Würfeln der
   * Vereinsstärken), damit ein gezeigtes Angebot exakt dem entspricht, was
   * man bei Annahme auch bekommt. Wechselt der Spieler ins Ausland, wandert
   * die bisherige Heimatliga hier hinein und die neue wird aktiv (`leagueState`).
   */
  foreignLeagues: Partial<Record<CountryId, LeagueState>>;
  seasonNumber: number; // 1 = erste Saison
  screen: Screen;
  /**
   * Noch nicht angezeigte Events der laufenden Saison - bewusst nur als IDs
   * vorgemerkt (nicht als fertig gebaute GameEvents), damit Beschreibungstexte
   * erst unmittelbar vor der Anzeige mit dem dann aktuellen Spielerstand (Verein
   * nach evtl. Wechsel etc.) erzeugt werden.
   */
  pendingEventIds: string[];
  currentEvent: GameEvent | null;
  /** Sofort-Feedback zur zuletzt getroffenen Entscheidung, bevor es weitergeht. */
  feedback: ChoiceFeedback | null;
  lastSeasonStats: SeasonStats | null;
  usedTemplateIds: string[];
  /** Saison, in der ein Template zuletzt gezogen wurde (für Wiederholungs-Cooldown). */
  recentTemplateSeasons: Record<string, number>;
  legacyScore?: number;
  legacyTier?: string;
  legacyFactors?: ScoreFactor[];
  achievements?: Achievement[];
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
