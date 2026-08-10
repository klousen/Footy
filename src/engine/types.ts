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

/**
 * Ob der Spieler kurz vor dem karriereende steht (siehe `shouldOfferRetirement`
 * in careerEngine.ts für den Player-Wrapper, der App.tsx den Retirement-Entscheid
 * anbietet) - lebt bewusst auch hier in types.ts statt nur in careerEngine.ts,
 * damit z.B. `events.ts` spätcarriere-Events (wie "Lockruf des großen Geldes")
 * daran koppeln kann, OHNE die Auswahl in eine Saison zu legen, in der die
 * Karriere ohnehin gleich endet - sonst wirkt ein "letzter großer Zahltag"
 * kurz vor Karriereende sinnlos, weil kaum noch Zeit bleibt, ihn auszukosten
 * (Bugreport). Duplikation der Bedingung wäre fehleranfällig, ein zirkulärer
 * Import von careerEngine.ts nach events.ts dagegen nicht möglich.
 */
export function isNearRetirement(player: Player): boolean {
  if (player.age >= 39) return true;
  if (player.age < 32) return false;
  const overall = overallRatingFromAttributes(player.attributes, player.position);
  const weights = POSITION_WEIGHTS[player.position];
  let peakOverall = 0;
  for (const key of Object.keys(weights) as AttributeKey[]) {
    peakOverall += player.potential[key] * weights[key];
  }
  peakOverall = Math.round(peakOverall);
  return overall < peakOverall * 0.72 || player.fitness < 55;
}

/** Mindestalter für eine "Heimkehrer"-Rückkehr (siehe `detectClubHomecoming`). */
export const HOMECOMING_MIN_AGE = 25;
/** "Mehr als 2 Jahre" in den frühen Jahren (18-25) = mindestens 3 Saisons dort. */
export const HOMECOMING_MIN_EARLY_CAREER_SEASONS = 3;

/** Wie stark die Bindung an die frühere Station war (siehe `detectClubHomecoming`) -
 * rein NARRATIV (Textwahl bei Event/Karriereende/Dashboard-Threads), beeinflusst
 * bewusst KEINE Spielwerte (siehe ADD-ON-Vorgabe Abschnitt 6: "nicht linear immer
 * größere Gameplay-Boni"). Primär aus der Dauer der früheren Station abgeleitet
 * (>= `HOMECOMING_MIN_EARLY_CAREER_SEASONS` = "normal", ab 4 Saisons "stark", ab 6
 * "sehr stark"), eine sehr lange Abwesenheit (>= 8 Jahre) hebt die Stufe zusätzlich
 * um eine Stufe an (gedeckelt bei "sehr stark") - siehe Vorgabe-Beispieltabelle
 * Abschnitt 3, an die eigene (strengere) Mindestschwelle von 3 statt 2 Saisons
 * angepasst. */
export type HomecomingStrengthTier = "normal" | "stark" | "sehr stark";

/** Strukturierte Heimkehr-Information (siehe ADD-ON-Vorgabe Abschnitt 2/9) - einmal
 * berechnet in `detectClubHomecoming`, danach überall (Event-Text, `Player.homecomings`,
 * `CareerNarrativeState.homecoming`, Karriereende) weiterverwendet statt mehrfach neu
 * hergeleitet. */
export interface HomecomingInfo {
  clubId: string;
  clubName: string;
  /** Alter beim Beginn der FRÜHEREN Station bei diesem Verein (erste Saison dort). */
  firstSpellStartAge: number;
  /** Alter beim Ende der FRÜHEREN Station (letzte Saison dort vor der Rückkehr). */
  firstSpellEndAge: number;
  /** Gesamtzahl Saisons der früheren Station (nicht nur der Teil im 18-25-Fenster). */
  firstSpellSeasons: number;
  /** Vereinsstärke (0-100) in der letzten Saison der früheren Station. */
  previousClubStrength: number;
  /** Aktuelle Vereinsstärke zum Zeitpunkt der Rückkehr. */
  currentClubStrength: number;
  returnAge: number;
  yearsAway: number;
  strengthTier: HomecomingStrengthTier;
}

function homecomingStrengthTier(firstSpellSeasons: number, yearsAway: number): HomecomingStrengthTier {
  let tier: HomecomingStrengthTier = firstSpellSeasons >= 6 ? "sehr stark" : firstSpellSeasons >= 4 ? "stark" : "normal";
  if (yearsAway >= 8 && tier === "normal") tier = "stark";
  return tier;
}

/**
 * Erkennt eine echte "Heimkehr" zu einem Verein, an dem der Spieler in frühen
 * Jahren (18-25) schon einmal mehr als 2 Saisons gespielt hat und zu dem er
 * jetzt (Alter >= `HOMECOMING_MIN_AGE`) zurückkehrt - unabhängig davon, ob
 * dazwischen noch weitere Stationen lagen. `null`, wenn keine Heimkehr vorliegt,
 * sonst die vollständige `HomecomingInfo` (u.a. Anzahl Jahre seit der zuletzt
 * dort verbrachten Saison - auch spätere, nicht mehr "frühe" Saisons an diesem
 * Verein zählen für den Zeitpunkt mit, damit "X Jahre später" auch stimmt, wenn
 * der Spieler über das 25. Lebensjahr hinaus dortgeblieben ist, bevor er ihn
 * verließ). `currentClubStrength` erwartet die Zielvereinsstärke als Parameter
 * (zum Zeitpunkt der Prüfung ist `player.club` ggf. noch der ALTE Verein, siehe
 * Aufrufer in `applyClubOfferChoice`).
 *
 * Lebt bewusst hier in types.ts statt in careerEngine.ts (wie `isNearRetirement`
 * oben) - sowohl `applyClubOfferChoice` (careerEngine.ts, Wechsel-Auflösung) als
 * auch der Event-Text von `HOMECOMING_TEMPLATE_ID` (events.ts) brauchen dieselbe
 * Berechnung, ein zirkulärer Import events.ts -> careerEngine.ts ist aber nicht
 * möglich.
 */
export function detectClubHomecoming(player: Player, targetClubId: string, currentClubStrength?: number): HomecomingInfo | null {
  if (player.age < HOMECOMING_MIN_AGE) return null;
  const seasonsThere = player.seasonHistory.filter((s) => s.clubId === targetClubId);
  if (seasonsThere.length === 0) return null;
  const earlyCareerSeasons = seasonsThere.filter((s) => s.age >= 18 && s.age <= 25);
  if (earlyCareerSeasons.length < HOMECOMING_MIN_EARLY_CAREER_SEASONS) return null;
  const lastSeasonThere = seasonsThere.reduce((a, b) => (b.age > a.age ? b : a));
  const firstSeasonThere = seasonsThere.reduce((a, b) => (b.age < a.age ? b : a));
  const yearsSince = player.age - lastSeasonThere.age;
  // Gerade erst dort gewesen (z.B. Leih-Rückkehr im selben Zug) - kein echtes "wieder".
  if (yearsSince < 1) return null;
  return {
    clubId: targetClubId,
    clubName: lastSeasonThere.club,
    firstSpellStartAge: firstSeasonThere.age,
    firstSpellEndAge: lastSeasonThere.age,
    firstSpellSeasons: seasonsThere.length,
    previousClubStrength: lastSeasonThere.clubStrength,
    currentClubStrength: currentClubStrength ?? lastSeasonThere.clubStrength,
    returnAge: player.age,
    yearsAway: yearsSince,
    strengthTier: homecomingStrengthTier(seasonsThere.length, yearsSince),
  };
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
  /** Optionale, kurze Erklärung, WIE sich `points` ergibt (z.B. Rohwert vs.
   * Erwartungswert) - macht die Saison-/Legacy-Bilanz für sich verständlich,
   * ohne dass Spielende die Formel dahinter kennen müssen (siehe Bugreport
   * "hier ist total unklar was gemeint ist"). Wird NUR angezeigt, wenn gesetzt. */
  detail?: string;
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
  /** True nur für eine einzelne Leih-Saison (siehe `SeasonStats.onLoan`) - eine
   * solche Zugehörigkeit umfasst laut `buildClubTenures` IMMER genau eine Saison,
   * auch wenn direkt davor/danach weitere Saisons beim selben Verein liegen
   * (z.B. dauerhafter Verbleib nach der Leihe) - die Kennzeichnung gilt bewusst
   * nur für diese eine Saison, nicht rückwirkend für die ganze Vereinszeit. */
  onLoan?: boolean;
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
  /** Stabile Vereins-ID (siehe `Club.clubId`) - anders als `club` (Anzeigename)
   * robust gegen Namensgleichheit über Ländergrenzen hinweg. Grundlage für
   * `detectClubHomecoming` (siehe unten). */
  clubId: string;
  /** Vereinsstärke (0-100) während dieser Saison - Grundlage für den
   * "damals/heute"-Vergleich in `HomecomingInfo` (siehe `detectClubHomecoming`). */
  clubStrength: number;
  /** Gesamtstärke während dieser Saison (vor dem Wachstum am Saisonende). */
  overallRating: number;
  /** Attribut-/Charakterwerte zu Saisonbeginn (vor den Events dieser Saison) - reiner
   * Anzeige-Snapshot für die Delta-Balken (siehe `Player.attributesAtSeasonStart`). */
  attributesAtSeasonStart: Attributes;
  traitsAtSeasonStart: Traits;
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
  /** NUR für Innen-/Außenverteidiger relevant, sonst 0: im letzten Moment verhinderte
   * Großchancen diese Saison (Grätsche auf der Linie, Klärung im Strafraum, entscheidender
   * Zweikampf) - das defensive Gegenstück zu Toren/Vorlagen bzw. der TW-Paradenquote, siehe
   * `simulateSeason`/`computeSeasonScore`. */
  bigChancesPrevented: number;
  /** NUR für zentrales Mittelfeld relevant, sonst 0: spielentscheidende Ballgewinne +
   * Schlüsselpässe diese Saison (aus Technik + Intelligenz abgeleitet) - das
   * Mittelfeld-Gegenstück zu `bigChancesPrevented` bei Innen-/Außenverteidigern bzw.
   * der TW-Paradenquote, siehe `simulateSeason`. */
  progressiveActions: number;
  /** Länderspiel-Einsätze in dieser Saison (Differenz zu `Player.capsAtSeasonStart`). */
  capsThisSeason: number;
  avgRating: number; // 1-10
  /**
   * Positionsabhängig normalisierte Leistungsbewertung dieser Saison (0-100,
   * siehe `computeSeasonPerformanceScore` in careerEngine.ts) - im Unterschied zu
   * `avgRating` (roher Notenschnitt) hier explizit die tatsächliche sportliche
   * Leistung UNABHÄNGIG von Torbeteiligungen normalisiert: ein Innenverteidiger
   * oder Torhüter kann über seine positionseigenen Metriken (verhinderte
   * Großchancen bzw. Paradenquote/Gegentore) denselben Höchstwert erreichen wie
   * ein Stürmer über Tore/Vorlagen. Grundlage für Peak-/Legacy-Berechnung, damit
   * "wie groß war die Karriere" nicht strukturell Torschützen bevorzugt.
   */
  performanceScore: number;
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
  /** True, wenn diese Saison ein narratives Leihjahr war (siehe `Player.loanNarrative`,
   * loanStory.ts) - Grundlage für das "(L)"-Kürzel im Karriereverlauf am Karriereende
   * (siehe `buildClubTenures`/`ClubTenure.onLoan`), gilt bewusst NUR für diese eine
   * Saison, nicht für spätere Saisons beim selben Verein (z.B. bei dauerhaftem Verbleib
   * nach der Leihe). */
  onLoan: boolean;
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
  /**
   * EXPLIZITER Ceiling Break (siehe "CAREER NARRATIVE ... TECHNISCHE VERANKERUNG"
   * Abschnitt 20/24) - der EINZIGE Weg, wie `player.potential` je über den zu
   * Karrierestart gewürfelten Wert hinaus steigen kann. Hebt `potential[key]` UND
   * `attributes[key]` je um den angegebenen Betrag an (siehe `applyEffects`),
   * protokolliert den Moment in `Player.ceilingBreaks`. Bewusst nur von einem
   * einzigen, sehr seltenen Event gesetzt (siehe "ceiling_break_moment" in
   * events.ts) - NICHT der Normalfall eines Attribut-Effekts (die deckeln jetzt
   * regulär am `potential`, siehe `applyEffects`).
   */
  ceilingBreak?: Partial<Record<AttributeKey, number>>;
  logText?: string;
  logKind?: LogEntry["kind"];
}

/** EIN protokollierter Ceiling Break (siehe `EffectDelta.ceilingBreak`). */
export interface CeilingBreakEntry {
  season: number;
  age: number;
  attribute: AttributeKey;
  amount: number;
}

/**
 * EIN aktiver, laufend geführter Narrative-Thread (siehe "TECHNISCHE VERANKERUNG"
 * Abschnitt 7/12) - bewusst auf GENAU EINEN gleichzeitig aktiven Thread beschränkt
 * (kein voller Multi-Thread-Store), das erste konkret modellierte Thread-Muster
 * ("nach einem großen/riskanten Wechsel folgt entweder Anpassung/Durchbruch oder
 * Rückschlag/Wiederaufbau"). Wird an mehreren Stellen aktualisiert: gestartet in
 * `applyClubOfferChoice` (siehe `recordTransferDecision`), Stage-Übergänge in
 * `simulateSeason` anhand der tatsächlichen Einsatzzeit-/Performance-Entwicklung.
 */
export interface NarrativeThread {
  type: "BIG_MOVE_ADAPTATION";
  startedSeason: number;
  startedAge: number;
  stage: "ADAPTATION" | "STRUGGLE" | "REBUILD" | "BREAKTHROUGH";
  /** Saison-Index (in `seasonHistory`), AB DEM der Thread beobachtet wird - i.d.R.
   * identisch mit dem `seasonHistoryIndex` der auslösenden Entscheidung. */
  seasonHistoryIndex: number;
  /** True, wenn die AUSLÖSENDE Entscheidung eine Heimkehr war (siehe
   * `TransferDecisionEntry.isHomecoming`) - steuert eigene, tonal passende
   * Textvarianten in `describeCareerMomentum`/`describeSeasonNarrative` (ADD-ON-
   * Vorgabe "Heimkehrer": eine Rückkehr zu vertrautem Umfeld soll sich nicht wie
   * ein Sprung ins Ungewisse lesen). Direkt am Thread gespeichert statt bei jeder
   * Textgenerierung erneut in `transferDecisions` nachzuschlagen. */
  isHomecoming?: boolean;
}

/** Abgeschlossener/aussagekräftiger Narrative-Moment (siehe `Player.narrativeHistory`) -
 * kompakte Historie für `CareerEnd`s "prägende Momente", NICHT jede Saison neu
 * befüllt, nur echte Wendepunkte (abgeschlossener Thread, Ceiling Break,
 * Nationalmannschafts-Snub→Berufung, o.ä.). */
export interface NarrativeHistoryEntry {
  season: number;
  age: number;
  type: string;
  label: string;
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

/** Strukturierte Daten für eine Wechselangebots-Karte (siehe `EventCard`s
 * Angebots-Layout, `footy-karriere-mockup.html` ".offer-card") - reine
 * Anzeige-Aufbereitung derselben Werte, die auch in `EventChoice.detail`
 * stecken (siehe `buildClubOfferEvent`), nur strukturiert statt als ein
 * einziger Fließtextsatz. Nur bei club_offer-Events gesetzt (siehe
 * `isClubOfferEvent`) - andere Events bleiben bei der klassischen
 * Label/Detail-Darstellung. */
export interface OfferCardData {
  /** Karten-Überschrift, z.B. "Gelsenkirchen" oder "Bei Karlsruhe bleiben". */
  headline: string;
  league: string;
  /** Flagge, NUR gesetzt bei einem Auslandsangebot - steuert das "Ausland"-Badge. */
  abroadFlag?: string;
  strength: number;
  /** Vergleichswert für den Trend-Pfeil - weggelassen (bzw. gleich `strength`),
   * wenn kein sinnvoller Vergleich existiert (z.B. "Bleiben"-Karte: unverändert). */
  strengthPrev?: number;
  wage: number;
  /** Gehalts-Differenz zum aktuellen Gehalt - weggelassen, wenn kein aktuelles
   * Gehalt existiert (z.B. allererster Profivertrag) oder unverändert (Bleiben). */
  wageDelta?: number;
  roleLabel: string;
  roleSub?: string;
  typeLabel: string;
  isStay: boolean;
}

export interface EventChoice {
  id: string;
  label: string;
  detail?: string;
  effects: EffectDelta;
  /** Für Nachfolge-Konsequenzen, die erst später ausgewertet werden (z.B. Trainingsergebnis) */
  followUpChance?: { chance: number; success: EffectDelta; failure: EffectDelta };
  /** Strukturierte Angebots-Karten-Daten, siehe `OfferCardData`. */
  offerCard?: OfferCardData;
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
  | "meilenstein"
  | "leihe";

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
  /**
   * Zusätzlicher, KONTEXTABHÄNGIGER Gewichts-Multiplikator (siehe "CAREER NARRATIVE
   * ... TECHNISCHE VERANKERUNG" Abschnitt 10/11) - multipliziert in
   * `pickSeasonTemplateIds` auf das normale Gewicht drauf, macht ein Event bei
   * passendem Karrierezustand deutlich wahrscheinlicher, OHNE es je zu erzwingen
   * (bleibt Teil derselben gewichteten Zufallsauswahl wie jedes andere Template).
   * Weggelassen bzw. `undefined` = neutral (Faktor 1), wie bisher.
   */
  dynamicWeight?: (player: Player) => number;
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
  /** Reiner Anzeige-Snapshot von `attributes`/`traits` zu Beginn der laufenden Saison
   * (vor deren Events) - berührt keine Spiellogik/Attribut-Berechnung, dient
   * ausschließlich den Delta-Balken im Dossier-/Saisonrückblick-Screen (siehe
   * `AttributeBars`/`TraitBars`). Wird beim Saisonstart aktualisiert und am
   * Saisonende 1:1 in `SeasonStats` kopiert, damit die Delta-Anzeige der bereits
   * abgeschlossenen Saison erhalten bleibt. */
  attributesAtSeasonStart: Attributes;
  traitsAtSeasonStart: Traits;
  potential: Attributes; // verborgene Obergrenze
  /** Fraktionaler Wachstums-/Abbau-Rest je Attribut, der beim Runden auf ganze
   * Punkte übrig bleibt und in die nächste Saison mitgenommen wird (siehe `ageUpPlayer`). */
  growthCarry: Partial<Record<AttributeKey, number>>;
  /**
   * Verdeckter, bei der Charaktererstellung EINMAL gewürfelter und danach fester
   * Multiplikator auf die altersabhängige Wachstumsrate (siehe `growthRate` in
   * careerEngine.ts) - der zentrale Hebel dafür, dass die Potenzial-Ausschöpfung
   * über viele Karrieren tatsächlich breit streut (Bust bis Overperformer) statt
   * praktisch immer bei ~90-109% zu landen. Ein "Wunderkind" (siehe `createPlayer`)
   * würfelt bevorzugt einen hohen Wert, ein Bust einen niedrigen - unabhängig vom
   * Potenzial selbst, damit auch ein hohes Potenzial an einer schwachen Entwicklung
   * scheitern kann und umgekehrt ein moderates Potenzial durch überdurchschnittliche
   * Entwicklung außergewöhnlich ausgeschöpft werden kann. Bewusst NICHT über Events
   * veränderbar (reine "wie schnell/zuverlässig entwickelt sich dieser Spieler
   * biologisch"-Eigenschaft, kein Ergebnis von Spielerentscheidungen - die wirken
   * weiterhin über Arbeitsmoral/Trainingsumfeld/Kaderrolle, siehe `ageUpPlayer`).
   */
  developmentTrajectory: number;
  /**
   * Verdeckter, bei der Charaktererstellung EINMAL gewürfelter und danach fester
   * Multiplikator/Verschiebungshebel auf die tatsächliche Matchproduktion (siehe
   * `productionFactor` in careerEngine.ts) - BEWUSST unabhängig von OVR, Potenzial
   * und `developmentTrajectory` gewürfelt (eigener, unkorrelierter Zufallswurf).
   * Der Hebel dafür, dass ein hoher OVR über mehrere Saisons hinweg trotzdem
   * chronisch unter den Erwartungen bleiben kann (niedriger Wert) bzw. ein
   * niedrigerer OVR dauerhaft über Erwarten liefert (hoher Wert) - siehe Vorgabe
   * "OVR und Performance NICHT koppeln". Wirkt NICHT auf Attributwachstum/OVR
   * selbst (dort weiterhin nur `developmentTrajectory`, siehe `ageUpPlayer`).
   */
  productionReliability: number;
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
    /** NUR für Innen-/Außenverteidiger relevant, sonst 0: siehe `SeasonStats.bigChancesPrevented`. */
    bigChancesPrevented: number;
    /** NUR für zentrales Mittelfeld relevant, sonst 0: siehe `SeasonStats.progressiveActions`. */
    progressiveActions: number;
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
  /** Gesetzt (auf die vorherige, bessere Rolle) unmittelbar NACH einer automatischen
   * Kaderrollen-Verschlechterung (siehe `resolveClubSituation`) - garantiert ein
   * Reaktions-Event ("Die Kaderrolle wackelt", siehe `decideRoleChallengeInjection`)
   * in der kommenden Saison, statt die Degradierung unwidersprochen hinzunehmen.
   * `null` außerhalb einer solchen offenen Situation. Wird ERST zurückgesetzt,
   * sobald die Antwort tatsächlich gewählt wurde (siehe `applyChoice`) - NICHT
   * schon beim garantierten Einplanen in `handleStartSeason` (App.tsx), da
   * `buildEventFromId` die `condition` beim tatsächlichen Anzeigen erneut prüft
   * und ein zu frühes Zurücksetzen den Slot sonst sofort gegen die neutrale
   * "Ruhige Woche"-Ersatzfüllung tauschen würde. Gilt unabhängig davon, welche
   * der drei Antwortmöglichkeiten gewählt wird. */
  roleChallengePending: SquadRole | null;
  /** Wurde bereits Kapitän der Nationalmannschaft (schaltet u.a. ein Achievement frei). */
  nationalTeamCaptain: boolean;
  /** Anzahl tatsächlich vollzogener Vereinswechsel (für Legacy-Faktoren/Achievements). */
  clubChangesCount: number;
  /** True, sobald mindestens einmal in ein anderes Land als `homeCountryId` gewechselt
   * wurde - Grundlage für das "Ligalegende"-Achievement (ganze Karriere in einem Land). */
  playedAbroad: boolean;
  /** True NUR unmittelbar nach dem zuletzt vollzogenen Wechsel, wenn dieser eine
   * echte Rückkehr vom Ausland ins Heimatland war (siehe `applyClubOfferChoice`,
   * `isHomecoming`) - steuert, ob danach das positive "Wieder daheim"-Event statt
   * der generischen "Ankommen beim neuen Verein"-Einfindungsschwierigkeiten feuern
   * kann (siehe `vertrag_neuankunft_schwierig`/`vertrag_heimkehr_ausland_glueck`
   * in events.ts). Wird bei JEDEM weiteren Wechsel neu gesetzt (auch auf `false`),
   * spiegelt also immer nur den zuletzt vollzogenen Wechsel wider. */
  recentTransferWasForeignHomecoming: boolean;
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
  /** Solange gesetzt, läuft ein narratives Leihjahr (siehe `loanStory.ts`) -
   * EXKLUSIVER Event-State: keine anderen saisonalen Events, keine normale
   * Auswahl über `pickSeasonTemplateIds` (siehe App.tsx `handleChoice`/
   * careerEngine.ts `applyClubOfferChoice`). Wird beim Akzeptieren eines
   * Leihangebots gesetzt und nach der finalen "bleiben/zurück/abwarten"-
   * Entscheidung wieder auf `null` zurückgesetzt. */
  loanNarrative: LoanNarrativeState | null;
  /** Protokoll aller ECHTEN Wechsel-/Verbleib-Entscheidungen an einem Vereinsangebot
   * (siehe `TransferDecisionEntry`) - die minimale Zusatz-Persistenz, die
   * `computeCareerNarrativeState`/`detectCareerPhenotype` (careerEngine.ts) brauchen,
   * um Entscheidungs-Impact und prägende Momente am Karriereende nachzuzeichnen, ohne
   * die eigentliche Angebots-/Transferlogik anzufassen. Wird ausschließlich in
   * `applyClubOfferChoice` befüllt, bei "bleiben"/"kämpfen" ebenso wie bei einem
   * echten Wechsel (siehe `TransferDecisionType` "STABILITY_DECISION"). */
  transferDecisions: TransferDecisionEntry[];
  /** Protokoll aller EXPLIZITEN Ceiling Breaks (siehe `EffectDelta.ceilingBreak`). */
  ceilingBreaks: CeilingBreakEntry[];
  /** Anzahl AUFEINANDERFOLGENDER Saisons, in denen der Spieler "nationalmannschafts-
   * würdig" war (siehe `simulateSeason`), aber noch keine Länderspiele bekommen hat -
   * auf 0 zurückgesetzt, sobald `nationalTeamCaps` steigt. Treibt sowohl eine steigende
   * Berufungswahrscheinlichkeit (siehe `nationalTeamCallUpChance` in events.ts) als
   * auch ein höheres Auswahlgewicht des Berufungs-Events (siehe `EventTemplate.
   * dynamicWeight`) - ein dauerhaft verdienter Spieler bleibt so NICHT unbegrenzt vom
   * reinen Zufall abhängig, ohne dass eine Berufung je garantiert wäre. */
  nationalTeamCandidacySeasons: number;
  /** Aktuell laufender Narrative-Thread (siehe `NarrativeThread`), `null` wenn keiner
   * aktiv ist. */
  activeNarrativeThread: NarrativeThread | null;
  /** Kompakte Historie prägender Narrative-Momente (siehe `NarrativeHistoryEntry`). */
  narrativeHistory: NarrativeHistoryEntry[];
  /** Alle erkannten Heimkehren dieser Karriere (siehe `detectClubHomecoming`,
   * ADD-ON-Vorgabe "Heimkehrer" Abschnitt 2/9) - meist 0 oder 1 Eintrag, in seltenen
   * Fällen (mehrfacher Vereinswechsel-Kreislauf) auch mehr. Strukturierte
   * Ergänzung zu `narrativeHistory` (dort nur ein kompakter Text-Eintrag) -
   * Grundlage für `CareerNarrativeState.homecoming`, den `HOMECOMER`-Phänotyp und
   * die ausführliche Karriereende-Erzählung. */
  homecomings: HomecomingInfo[];
  /** Saison (siehe `seasonHistory.length`-Zählweise), in der ein bestimmter früherer
   * Verein zuletzt ein Angebot gemacht hat (siehe `pastClubCandidate` in
   * careerEngine.ts) - verhindert, dass derselbe Ex-Verein jede Saison erneut anklopft
   * (ADD-ON-Vorgabe Abschnitt 18: "sie kennen dich" statt "sie wollen dich jedes Jahr
   * zurück"). Key = `Club.clubId`. */
  pastClubOfferCooldowns: Record<string, number>;
}

/**
 * Grobe Klassifikation EINER Vereinsangebots-Entscheidung (siehe Vorgabe
 * "CAREER NARRATIVE & DECISION IMPACT SYSTEM", Abschnitt Transfer-Klassifikation) -
 * rein diagnostisch/narrativ, beeinflusst KEINE Spiellogik (Angebote, Gehalt,
 * Kaderrolle etc. laufen unverändert über die bestehende Formel in
 * `buildClubOfferEvent`/`applyClubOfferChoice`). Heuristik siehe `classifyTransferDecision`
 * in careerEngine.ts - kalibriert/validiert über eine 1500-Karrieren-Diagnose-Simulation.
 */
export type TransferDecisionType =
  | "UPWARD_MOVE"
  | "LATERAL_MOVE"
  | "DOWNWARD_MOVE"
  | "PLAYING_TIME_MOVE"
  | "PRESTIGE_RISK_MOVE"
  | "FINANCIAL_MOVE"
  | "STABILITY_DECISION";

/** EIN Eintrag im `Player.transferDecisions`-Protokoll. */
export interface TransferDecisionEntry {
  season: number;
  age: number;
  type: TransferDecisionType;
  fromClub: string;
  toClub: string; // identisch zu `fromClub` bei STABILITY_DECISION
  /** Sprung der (international vergleichbaren) Vereinsstärke - siehe `displayClubStrength`. */
  strengthDelta: number;
  /** Index in `Player.seasonHistory`, AB DEM die Entscheidung wirkt (die nächste
   * simulierte Saison) - Basis für die spätere Vorher/Nachher-Auswertung in
   * `computeCareerNarrativeState`. */
  seasonHistoryIndex: number;
  /** True, wenn dieser Wechsel eine erkannte Heimkehr war (siehe `detectClubHomecoming`,
   * `Player.homecomings`) - ADD-ON-Vorgabe Abschnitt 20: bewusst KEIN eigener
   * `TransferDecisionType`, sondern ein Zusatzflag auf der bestehenden Klassifikation
   * (meist `STABILITY_DECISION`/`LATERAL_MOVE`/`DOWNWARD_MOVE`, je nach Stärke-Sprung),
   * damit keine redundante Klassifikation neben der vorhandenen Architektur entsteht. */
  isHomecoming?: boolean;
}

/** EIN `TransferDecisionEntry` angereichert um den gemessenen Vorher/Nachher-Impact
 * (siehe `computeCareerNarrativeState` in careerEngine.ts) - Performance-Fenster
 * (bis zu 2 Saisons) VOR bzw. NACH der Entscheidung, `perfImpact` als Differenz
 * (erwartungswert-relativ über den Trend VOR der Entscheidung, nicht naiv die
 * nächste einzelne Saison). `null`, wenn das jeweilige Fenster leer ist (z.B. die
 * allererste Saison der Karriere, oder die Entscheidung liegt noch keine Saison
 * zurück). */
export interface DecisionImpact extends TransferDecisionEntry {
  prePerf: number | null;
  postPerf: number | null;
  perfImpact: number | null;
}

/** Karriere-Erzählzustand (siehe "CAREER NARRATIVE & DECISION IMPACT SYSTEM") - rein
 * ABGELEITET aus `seasonHistory`/`transferDecisions`/`nationalTeamCaps`/aktuellen
 * Attributen (KEIN eigenes Persistenz-Feld, siehe `computeCareerNarrativeState`), am
 * Karriereende (oder jederzeit während der laufenden Karriere) neu berechenbar. */
export type NarrativeTrend = "rising" | "falling" | "stable";

export interface CareerNarrativeState {
  decisionImpacts: DecisionImpact[];
  /** Die Entscheidung mit dem größten GEWICHTETEN Performance-Impact - berücksichtigt
   * neben dem rohen `perfImpact` auch, ob die Entscheidung einen später abgeschlossenen
   * Narrative-Thread ausgelöst hat (siehe `NarrativeThread`/`Player.narrativeHistory`,
   * Vorgabe "TECHNISCHE VERANKERUNG" Abschnitt 17: ein kurzfristig negativer Wechsel,
   * der Jahre später zum Durchbruch führte, zählt mehr als ein kurzfristig positiver
   * ohne Nachwirkung). `null` ohne auswertbare Entscheidung. */
  definingDecision: DecisionImpact | null;
  /** Explizite Ceiling Breaks (siehe `Player.ceilingBreaks`/`EffectDelta.ceilingBreak`) -
   * NICHT mehr aus einem rohen Attribut-vs-Potential-Vergleich abgeleitet (siehe
   * Vorgabe "TECHNISCHE VERANKERUNG" Abschnitt 20/24: Ceiling Breaks sind jetzt ein
   * expliziter, protokollierter Mechanismus, kein Nebeneffekt). */
  ceilingBreaks: CeilingBreakEntry[];
  /** Elite-Niveau (Peak-Gesamtstärke >= 80) erreicht, aber nie/kaum für die
   * Nationalmannschaft berufen (siehe Vorgabe Teil E: laut Diagnose unabhängig von
   * Leistung/Einsatzzeit - reines Berufungs-Losglück über viele unabhängige
   * Saison-Ziehungen). */
  nationalTeamSnub: boolean;
  peakOverall: number;
  /** Trend-Signale (siehe "TECHNISCHE VERANKERUNG" Abschnitt 1) - jeweils aus den
   * letzten bis zu 2 Saisons vs. den 2-3 Saisons davor abgeleitet, rein aus
   * `seasonHistory` (keine Persistenz). Grundlage für die natursprachlichen
   * Dashboard-/SeasonSummary-Texte (siehe `narrativeTrendLabel` in labels.ts). */
  performanceTrend: NarrativeTrend;
  playingTimeTrend: NarrativeTrend;
  clubLevelTrend: NarrativeTrend;
  /** Ausgang der ZULETZT abgeschlossenen (max. 1 Saison zurückliegenden)
   * Transferentscheidung, sofern schon ein Nachher-Fenster existiert - `null` sonst. */
  recentDecisionOutcome: DecisionImpact | null;
  /** Durchreichung von `Player.activeNarrativeThread` - hier gebündelt, damit die UI
   * nur EINE Quelle (`computeCareerNarrativeState`) abfragen muss. */
  activeThread: NarrativeThread | null;
  /** Die ZULETZT erkannte Heimkehr (siehe `Player.homecomings`/`detectClubHomecoming`,
   * ADD-ON-Vorgabe "Heimkehrer" Abschnitt 9) - `null`, wenn noch keine stattfand.
   * Mehrere Heimkehren in einer Karriere sind selten, aber möglich - hier bewusst nur
   * die letzte (für Dashboard/SeasonSummary-Texte relevant), die volle Liste steht in
   * `Player.homecomings` (Grundlage für Karriereende/Phänotyp). */
  homecoming: HomecomingInfo | null;
}

/**
 * Karriere-Phänotyp (siehe "CAREER NARRATIVE & DECISION IMPACT SYSTEM" Teil C) - rein
 * beschreibend/narrativ, NIEMALS Eingabe für Spiellogik (Wachstum/Performance/Angebote/
 * Legacy bleiben unverändert). `LATE_BLOOMER` verlangt einen ECHTEN Leistungs-
 * Turnaround (siehe `detectCareerPhenotype`), nicht nur einen späten OVR-Peak -
 * genau der "falsch-positive Typ D" aus der Diagnose (später OVR-Peak trotz
 * durchgehend schwacher Leistung) zählt explizit NICHT als Late Bloomer.
 */
export type CareerPhenotype =
  | "WONDERKIND_DELIVERED"
  | "WONDERKIND_BUST"
  | "LATE_BLOOMER"
  | "STEADY_PROFESSIONAL"
  | "ONE_CLUB_LEGEND"
  | "JOURNEYMAN"
  | "NATIONAL_TEAM_ICON"
  | "NATIONAL_TEAM_SNUB"
  | "TROPHY_COLLECTOR"
  | "NEARLY_MAN"
  | "INJURY_PRONE_SURVIVOR"
  | "LATE_CAREER_RESURGENCE"
  | "BOOM_OR_BUST_MOVER"
  | "CEILING_BREAKER"
  | "HOMECOMER";

export interface CareerPhenotypeResult {
  primary: CareerPhenotype;
  secondary: CareerPhenotype[];
}

/** Protokoll-Eintrag EINER der drei Leih-Entscheidungen (siehe `Player.loanNarrative`)
 * - trägt sowohl den rohen Würfelwurf als auch das Ergebnis, damit die Saisonbilanz
 * am Ende der Leihe die TATSÄCHLICHEN drei Ereignisse nachzeichnen kann, statt sie
 * zu erfinden. */
export interface LoanDecisionLogEntry {
  decisionTitle: string;
  choiceLabel: string;
  raw: number;
  modifier: number;
  modifiedRoll: number;
  momentumEmoji: string;
  momentumLabel: string;
  resultText: string;
  resultKind: LogEntry["kind"];
  deltaLabel: string[];
}

/** Laufender Zustand eines narrativen Leihjahres (siehe `loanStory.ts`) - lebt
 * bewusst gebündelt in einem einzigen Feld statt mehrerer verstreuter Player-
 * Werte, damit die komplette Leih-Erzählung mit einem einzigen `= null` sauber
 * endet (siehe `Player.loanNarrative`). */
export interface LoanNarrativeState {
  reasonId: string;
  reasonTitle: string;
  reasonText: string;
  loanClubName: string;
  /** Aktueller Würfel-Modifikator (Momentum) für die NÄCHSTE Entscheidung. */
  momentum: number;
  momentumEmoji: string;
  momentumLabel: string;
  decisions: LoanDecisionLogEntry[];
  /** Gesamtstärke/Attribute unmittelbar zu Beginn der Leihe (vor den drei
   * Entscheidungen) - Vergleichsbasis für die ECHTE Veränderung in der
   * Saisonbilanz (siehe SeasonSummary.tsx), keine erfundenen Werte. */
  overallAtLoanStart: number;
  attributesAtLoanStart: Attributes;
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
  positive: boolean;
}

/** Ein Eintrag im geräteweiten Bestenlisten-Archiv (siehe `storage.ts`,
 * `rankingArchive`) - wird bei JEDEM Karriereende geschrieben, unabhängig vom
 * Karriere-Pass-Status (Tracking läuft immer, nur die Anzeige ist gated). */
export interface RankingEntry {
  playerName: string;
  finalOVR: number;
  legacyScore: number;
  nation: string;
  nationFlag: string;
  longestClub: { name: string; years: number };
  completedAt: string; // ISO-Timestamp
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
  | "title"
  | "slot-select"
  | "leaderboard"
  | "country"
  | "create"
  | "youthOffer"
  | "dashboard"
  | "event"
  | "seasonSummary"
  | "careerEnd";
