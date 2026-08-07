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

// Gewichtung der Attribute für die Gesamtstärke je Position (summiert zu 1).
// Bewusst klar entlang der Rolle differenziert: Abwehrspieler (TW/IV, etwas
// abgeschwächt auch AV) leben von Physis + Mentalität ("Stabilität"/Nervenstärke
// - die Attribute, die auch defensiv am meisten zählen), Offensivspieler (FS/ST)
// von Technik + Tempo. Das spiegelt sich zusätzlich im `attackWeight` in
// `simulateSeason` wider, der die Tor-/Assistwahrscheinlichkeit stark nach
// Position staffelt (TW 0.02 bis ST 1.0) - Angreifer sind dort schon die
// klare Torgefahr, Verteidiger tragen ihren Wert stattdessen fast komplett
// über diese OVR-Gewichtung statt über Scorerpunkte bei.
/**
 * Reine, Player-unabhängige Gesamtstärken-Berechnung (siehe `overallRating` in
 * careerEngine.ts für den Player-Wrapper) - lebt bewusst hier in types.ts statt
 * in careerEngine.ts, damit auch events.ts sie nutzen kann (z.B. für die
 * Nationalmannschafts-Berufungslogik), ohne einen zirkulären Import von
 * careerEngine.ts zu erzeugen.
 */
export function overallRatingFromAttributes(attributes: Attributes, position: Position): number {
  const weights = POSITION_WEIGHTS[position];
  let sum = 0;
  for (const key of Object.keys(weights) as AttributeKey[]) {
    sum += attributes[key] * weights[key];
  }
  return Math.round(sum);
}

export const POSITION_WEIGHTS: Record<Position, Attributes> = {
  TW: { technik: 0.15, tempo: 0.05, physis: 0.25, mentalitaet: 0.35, intelligenz: 0.15, charisma: 0.05 },
  IV: { technik: 0.12, tempo: 0.13, physis: 0.33, mentalitaet: 0.25, intelligenz: 0.12, charisma: 0.05 },
  AV: { technik: 0.18, tempo: 0.22, physis: 0.23, mentalitaet: 0.19, intelligenz: 0.13, charisma: 0.05 },
  ZM: { technik: 0.24, tempo: 0.14, physis: 0.16, mentalitaet: 0.21, intelligenz: 0.2, charisma: 0.05 },
  FS: { technik: 0.32, tempo: 0.32, physis: 0.08, mentalitaet: 0.08, intelligenz: 0.15, charisma: 0.05 },
  ST: { technik: 0.32, tempo: 0.27, physis: 0.17, mentalitaet: 0.12, intelligenz: 0.07, charisma: 0.05 },
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
  /** Land mit echtem Relegationsspiel (siehe `CountryDef.hasRelegationPlayoff` in
   * leagues.ts und `simulateLeaguePromotionRelegation`) - von `swapCount` Plätzen ist
   * dann nur `swapCount - 1` direkt sicher, der letzte wird ausgespielt. */
  hasRelegationPlayoff: boolean;
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


/**
 * Torhüter (position === "TW") durchlaufen bewusst NIE "Rotation" oder
 * "Ergänzungsspieler" - anders als bei Feldspielern gibt es zwischen Vereinen
 * praktisch keine geteilte Spielzeit auf der Position, ein Torwart ist entweder
 * die gesetzte Nummer 1 ("Stammspieler") oder sitzt (fast) die ganze Saison als
 * Nummer 2/3 auf der Bank ("Ersatzbank") - siehe `squadRoleForOverall`/
 * `currentSquadRole` in careerEngine.ts (dort auf diese zwei Stufen begrenzt für
 * TW) und `goalkeeperRoleLabel` für die "Nummer 1"/"Nummer 2"-Anzeige.
 */
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

/** Ergebnis der europäischen Wettbewerbsteilnahme einer Saison (siehe `europeanCup.ts`)
 * - nur gesetzt, wenn sich der (Erstliga-)Verein sportlich qualifiziert hat. `champion`
 * ist zusätzlich redundant in `SeasonStats.trophies` enthalten, damit Achievements/
 * Score/Sharepic den Titel automatisch mitzählen, ohne jede Stelle einzeln anzupassen. */
export interface EuropeanCupResult {
  competition: "CL" | "EL";
  /** "Ligaphase" | "Achtelfinale" | "Viertelfinale" | "Halbfinale" | "Finale" | "Champion" -
   * die letzte Runde, die erreicht (bei "Champion": gewonnen) wurde. */
  stageReached: string;
  champion: boolean;
}

/** Ergebnis der nationalen Pokal-Teilnahme einer Saison (siehe `nationalCup.ts`) - anders
 * als bei CL/EL gibt es hier KEINE Qualifikation: JEDER Liga-1- und Liga-2-Verein des
 * Landes nimmt automatisch teil, daher (anders als `EuropeanCupResult`) nie `null`.
 * `underdog` markiert, ob der Sieg (falls `champion`) gegen die eigentliche Favoritenrolle
 * gelang - nur DANN gibt es das zugehörige Event (siehe `events.ts`). */
export interface NationalCupResult {
  stageReached: string;
  champion: boolean;
  underdog: boolean;
}

/** Eine Zeile im Tabellen-Ausschnitt am Saisonende (siehe `buildTableSnapshot` in
 * leagueEngine.ts) - keine echte Spiel-für-Spiel-Simulation, sondern eine
 * rang-basierte Annäherung, die um `leaguePosition` herum plausible Werte liefert. */
export interface TableRow {
  clubId: string;
  club: string;
  position: number;
  isPlayerClub: boolean;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
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
  /** NUR für Torhüter (position === "TW") relevant, sonst 0: Anzahl zu-null-gespielter
   * Spiele diese Saison (siehe `simulateSeason`) - das torwartspezifische Gegenstück
   * zu Toren/Vorlagen bei Feldspielern. */
  cleanSheets: number;
  /** NUR für Torhüter relevant, sonst 0: Paradenquote dieser Saison in Prozent (0-100). */
  savePercentage: number;
  /** NUR für Torhüter relevant, sonst 0: im Ligaspiel gehaltene Elfmeter diese Saison
   * (separat vom Elfmeterschießen-Event "torwart_elfmeterheld") - seltener Bonusmoment,
   * der die Bewertung/Bekanntheit zusätzlich anhebt. */
  penaltiesSaved: number;
  /** Länderspiel-Einsätze in dieser Saison (Differenz zu `Player.capsAtSeasonStart`). */
  capsThisSeason: number;
  avgRating: number; // 1-10
  leaguePosition: number;
  trophies: string[];
  yellowCards: number;
  redCards: number;
  promoted: boolean;
  relegated: boolean;
  /** Nur gesetzt, wenn der Verein an einem echten Relegationsspiel beteiligt war
   * (siehe `CountryDef.hasRelegationPlayoff`/`simulateLeaguePromotionRelegation`) -
   * unabhängig davon, ob sich dadurch die Liga-Zugehörigkeit geändert hat. */
  relegationPlayoff?: "gehalten" | "verpasst" | "aufgestiegen" | "abgestiegen";
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
  /** Tabellen-Ausschnitt (3 Vereine über/unter dem eigenen) für den Saisonrückblick. */
  tableSnapshot: TableRow[];
  /** Champions-/Europa-League-Teilnahme dieser Saison, `null` wenn nicht qualifiziert
   * (siehe `europeanCup.ts`). */
  europeanCup: EuropeanCupResult | null;
  /** Nationaler Pokal dieser Saison (siehe `nationalCup.ts`) - nie `null`, jeder Liga-1-/
   * Liga-2-Verein nimmt automatisch teil. */
  nationalCup: NationalCupResult;
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
  /** Merkt sich den Namen einer/eines Ex-Partnerin/-Partners nach einer Trennung
   * durch Auslandswechsel (siehe `beziehung_auslandswechsel_risiko`) - Grundlage
   * für "beziehung_alte_liebe_zurueck" nach der Rückkehr in die Heimat.
   * `null` setzt explizit zurück (z.B. nach Auflösung dieses Handlungsstrangs). */
  exPartnerName?: string | null;
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
  /** Markiert ein entscheidendes Pokal-Aus in dieser Saison (siehe `pokal_kraftakt`) -
   * verhindert, dass `simulateSeason` trotzdem einen Pokaltitel für dieselbe Saison
   * auswürfelt (siehe `Player.cupExitThisSeason`). */
  cupExit?: boolean;
  /** Springt direkt vom Jugendspieler (Ausbildungsspieler) in einen echten Profikader-
   * Vertrag (siehe "jugend_amateurentdeckung_1") - ohne den regulären Weg über das
   * Profidebüt-Event am 18. Geburtstag. Setzt Kaderrolle, Vertrag und Gehalt direkt. */
  earlyProDebut?: boolean;
  /** Setzt einen karriereprägenden Moment (siehe `Player.definingMoment`). */
  definingMoment?: { positive: boolean; text: string };
  /** Setzt `Player.edeljokerLocked` dauerhaft (siehe dort). */
  edeljokerLocked?: boolean;
  /** Setzt/verlängert `Player.formSlumpSeasons` (siehe dort). */
  formSlumpSeasons?: number;
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
  /**
   * Templates mit derselben `exclusiveGroup` können nie in derselben Saison
   * beide gezogen werden (siehe `pickSeasonTemplateIds`) - verhindert z.B.,
   * dass zwei "neue Beziehung"-Events in derselben Saison feuern, obwohl
   * beide beim Auswählen (Saisonbeginn) noch unabhängig voneinander gültig
   * waren (der Spieler war zu dem Zeitpunkt noch bei beiden "single").
   */
  exclusiveGroup?: string;
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
    /** NUR für Torhüter relevant, sonst 0: siehe `SeasonStats.cleanSheets`. */
    cleanSheets: number;
    /** NUR für Torhüter relevant, sonst 0: siehe `SeasonStats.penaltiesSaved`. */
    penaltiesSaved: number;
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
  /** True, sobald mindestens einmal in ein anderes Land als `homeCountryId` gewechselt
   * wurde - Grundlage für das "Ligalegende"-Achievement (ganze Karriere in einem Land). */
  playedAbroad: boolean;
  /** True, solange ein Leihgeschäft läuft (siehe `ClubOfferReason` "loan"/"loan-return")
   * - erzwingt im folgenden Sommertransferfenster die automatische Rückkehr. */
  loanActive: boolean;
  /** Herkunftsverein, zu dem nach einer laufenden Leihe zurückgekehrt wird - null
   * außerhalb einer laufenden Leihe. */
  loanReturnClub: { clubId: string; name: string; country: string; tier: LeagueTier; strength: number } | null;
  /** Land des `loanReturnClub` - getrennt gespeichert, da `Club.country` nur der
   * Anzeigename ist, hier aber die echte `CountryId` für den League-Lookup gebraucht wird. */
  loanReturnCountryId: CountryId | null;
  /** Aufsummierte Verletzungswochen über die gesamte Karriere. */
  totalInjuryWeeks: number;
  /** Wird per `EffectDelta.cupExit` gesetzt (siehe `pokal_kraftakt`) und von
   * `simulateSeason` konsumiert/zurückgesetzt - verhindert einen ausgewürfelten
   * Pokaltitel in derselben Saison, in der man entscheidend im Pokal ausgeschieden ist. */
  cupExitThisSeason: boolean;
  relationshipStatus: RelationshipStatus;
  partnerName: string | null;
  /** Name der/des Ex-Partnerin/-Partners nach einer Trennung durch Auslandswechsel -
   * siehe `EffectDelta.exPartnerName` und "beziehung_alte_liebe_zurueck". */
  exPartnerName: string | null;
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
  /** Ein karriereprägender Moment (siehe "historisches_spiel_1") - für die Erwähnung
   * im Karriereende-Epilog (siehe `buildEpilogue`). */
  definingMoment: { positive: boolean; text: string } | null;
  /** Einmal dauerhaft gesetzt (siehe "edeljoker_1"): der Trainer nutzt den Spieler
   * gezielt als Einwechselspieler statt als Stammspieler - deckelt die Kaderrolle
   * in `resolveClubSituation` dauerhaft bei "Rotation", selbst wenn die reine
   * Gesamtstärke eigentlich für "Stammspieler" reichen würde. */
  edeljokerLocked: boolean;
  /** Solange > 0, drückt ein Formtief (siehe "sommermaerchen_delle_1") zusätzlich
   * auf die Saison-Bewertung in `simulateSeason` - klingt über die Saisons ab. */
  formSlumpSeasons: number;
  /** "Zweiter Frühling": solange > 0, sind Templates mit `exclusiveGroup:
   * "beziehung_start"` in `pickSeasonTemplateIds` deutlich wahrscheinlicher -
   * wird nach einer Trennung OHNE Kinder gesetzt (siehe `applyEffects`), klingt
   * über die Saisons ab. */
  secondSpringSeasons: number;
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
  /**
   * Leichter, dauerhaft persistierter Struktur-Drift je Land (siehe `europeanCup.ts`,
   * `advanceEuropeanLeagueDrift`) - EIN Fließkommawert pro Land (nicht pro Verein),
   * der sich jede Saison für alle 10 Länder minimal verschiebt (Investoren-Geld,
   * Substanzverlust etc.), damit sich die aus den Vereinsstärken abgeleiteten
   * Liga-Stärken (`deriveLeagueStrengths`) über viele Saisons langsam verschieben
   * können, statt Saison für Saison unabhängig neu zu würfeln. Bewusst kein
   * persistentes Elo pro Einzelverein aller 10 Ligen (das würde ~300 Vereine über
   * die gesamte Karriere simulieren, die der Spieler nie zu Gesicht bekommt).
   */
  europeanLeagueDrift: Partial<Record<CountryId, number>>;
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
