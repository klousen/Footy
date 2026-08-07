// Europäische Wettbewerbe (Champions Cup/Europa Cup) - Elo-artige
// Qualifikations- und Turniersimulation, adaptiert aus den vom Nutzer bereitgestellten
// Referenzmodulen (european-cup-elo.js, liga-elo-drift.js) auf die tatsächliche Footca-
// Architektur:
//
// - Footca simuliert nur die Liga-Pyramide EINES Landes wirklich vollständig (die des
//   Spielers, siehe `leagueEngine.ts`/`GameState.leagueState`). Die übrigen 9 Länder
//   existieren nur als Metadaten (`COUNTRIES`) oder werden lazy für konkrete
//   Auslandsangebote gecacht (`GameState.foreignLeagues`) - es gibt kein persistentes
//   Elo pro Verein für alle 10 Ligen (das wären ~300 Vereine über die ganze Karriere,
//   die der Spieler nie zu Gesicht bekommt).
// - Statt eines zusätzlichen, parallelen Elo-Feldes pro Verein wird der bereits
//   vorhandene ELO-artige `clubCoefficient` (Vereinsstärke + Liga-Ansehen + Flair,
//   siehe `leagueEngine.ts`) als Elo-Basis verwendet - eine echte Quelle der Wahrheit
//   statt zweier auseinanderdriftender Zahlen pro Verein.
// - Der einzige NEU eingeführte, dauerhaft persistierte Zustand ist ein einzelner
//   Fließkommawert pro Land (`GameState.europeanLeagueDrift`, siehe
//   `advanceEuropeanLeagueDrift`) - ein leichter, mean-revertierender Random Walk, der
//   dafür sorgt, dass sich Liga-Stärken über viele Saisons langsam verschieben können
//   (Investoren-Geld etc.), statt bei jeder Berechnung unabhängig neu gewürfelt zu
//   werden.
// - Kein voller Turnierbaum mit allen realen Begegnungen der ~30 übrigen Teilnehmer -
//   nur der Lauf des Spielervereins wird simuliert (`simulateKnockoutRun`), Runde für
//   Runde gegen einen typischen Gegner-Pool (Standard-Elo-Erwartungswert), der von
//   Runde zu Runde auf die jeweils stärkste verbleibende Hälfte des Feldes schrumpft.

import type { ClubState, EuropeanCupResult, LeagueState } from "./types";
import { clamp } from "./data";
import { COUNTRIES, type CountryId } from "./leagues";
import { buildLeagueState, clubCoefficient } from "./leagueEngine";

/** Standard-Elo-Erwartungswert (Siegwahrscheinlichkeit von A gegen B). */
export function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

// Rein lineare Umrechnung von `clubCoefficient` (grob 5-230, siehe dort) auf eine
// Elo-artige Skala mit realistischem Spielraum für ein europäisches Teilnehmerfeld
// (schwache Qualifikanten ~1500, absolute Spitzenvereine ~2100) - die exakten
// Konstanten sind austariert, nicht aus einer externen Quelle übernommen.
const ELO_BASE = 1400;
const ELO_COEFF_SCALE = 3;

function clubElo(club: ClubState, countryId: CountryId, leagueRank: number | undefined, drift: number): number {
  return ELO_BASE + clubCoefficient(club, countryId, leagueRank) * ELO_COEFF_SCALE + drift;
}

/** Wie viele Top-Vereine je Liga in die Liga-Stärke-Berechnung einfließen (siehe
 * `deriveLeagueStrengths`) - nur die international relevante Spitze, nicht die ganze Liga. */
const TOP_N_FOR_LEAGUE_STRENGTH = 6;

/**
 * Leichter, dauerhaft persistierter Struktur-Drift je Land (siehe `GameState.
 * europeanLeagueDrift`) - wird EINMAL pro abgeschlossener Saison für ALLE 10 Länder
 * aufgerufen (nicht nur das gerade aktive), damit sich Liga-Stärken auch dort langsam
 * verschieben können, wo der Spieler selbst nie spielt. Mean-revertierend (kein
 * ungedeckelter Random Walk), damit eine Liga nicht über viele Saisons hinweg beliebig
 * wegdriften kann. Mutiert `drift` direkt, analog zum Rest der Engine (siehe z.B.
 * `simulateLeaguePromotionRelegation` in leagueEngine.ts). */
const DRIFT_STEP = 22;
const DRIFT_REVERSION = 0.95;
const DRIFT_CAP = 140;

export function advanceEuropeanLeagueDrift(drift: Partial<Record<CountryId, number>>, rng: () => number): void {
  for (const country of COUNTRIES) {
    const current = drift[country.id] ?? 0;
    const reverted = current * DRIFT_REVERSION;
    drift[country.id] = clamp(reverted + (rng() - 0.5) * DRIFT_STEP, -DRIFT_CAP, DRIFT_CAP);
  }
}

/** Liefert bis zu `count` Top-Vereine (nach Stärke) eines Landes für europäische
 * Zwecke - echte Vereine, falls die Liga bereits bekannt ist (eigene aktive Liga oder
 * gecachte Auslandsliga aus `foreignLeagues`), sonst eine EPHEMERE (nicht gecachte,
 * nicht persistierte) Generierung über `buildLeagueState` rein für diese Berechnung.
 * Absichtlich nicht in `foreignLeagues` geschrieben - der Cache dort ist fürs
 * Angebots-System reserviert (siehe `getOrBuildForeignLeague` in careerEngine.ts) und
 * soll nicht durch europäische Hintergrundrechnungen für Länder befüllt werden, die
 * der Spieler nie bereist. */
function topClubsForCountry(
  countryId: CountryId,
  activeCountryId: CountryId,
  activeLeague: LeagueState,
  foreignLeagues: Partial<Record<CountryId, LeagueState>>,
  count: number,
  rng: () => number
): ClubState[] {
  const source = countryId === activeCountryId ? activeLeague : foreignLeagues[countryId] ?? buildLeagueState(countryId, rng);
  return [...source.tier1].sort((a, b) => b.strength - a.strength).slice(0, count);
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/**
 * Leitet die Liga-Stärke (0.3-1.0, normalisiert über alle 10 Ligen) aus den
 * ELO-artigen Koeffizienten der jeweiligen Top-Vereine ab - adaptiert aus
 * `liga-elo-drift.js`. Ein Sockel von 0.3 sorgt dafür, dass auch die schwächste Liga
 * der Auswahl nicht auf 0 fällt (sie hat ja trotzdem reale, europapokalfähige Vereine).
 */
export function deriveLeagueStrengths(topEloByCountry: Partial<Record<CountryId, number[]>>): Partial<Record<CountryId, number>> {
  const rawAverages: Partial<Record<CountryId, number>> = {};
  for (const [id, elos] of Object.entries(topEloByCountry) as [CountryId, number[]][]) {
    rawAverages[id] = average(elos);
  }
  const values = Object.values(rawAverages) as number[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const strengths: Partial<Record<CountryId, number>> = {};
  for (const [id, avg] of Object.entries(rawAverages) as [CountryId, number][]) {
    strengths[id] = 0.3 + 0.7 * ((avg - min) / range);
  }
  return strengths;
}

/** Startplätze aus dem Liga-Stärke-Faktor ableiten (adaptiert aus `liga-elo-drift.js`) -
 * die stärksten Ligen der Auswahl (England/Spanien/Italien-Niveau) bekommen 4 CL- und
 * 2 EL-Plätze, die schwächste dieser Zehnerauswahl nur 1/1. Dient NUR noch dem
 * synthetischen Gegner-Feld anderer Länder (siehe `field`-Aufbau in
 * `computeSeasonEuropeanCupResult`) - für die Qualifikation des Spielervereins SELBST
 * gilt seit dem Bugreport "hängt Tabellenplatz nicht wirklich dran" stattdessen die
 * feste, reale Platzierungs-Tabelle in `COUNTRY_EUROPEAN_SLOTS`. */
export function deriveSlotsFromStrength(leagueStrength: number): { clSlots: number; elSlots: number } {
  if (leagueStrength >= 0.9) return { clSlots: 4, elSlots: 2 };
  if (leagueStrength >= 0.75) return { clSlots: 3, elSlots: 2 };
  if (leagueStrength >= 0.6) return { clSlots: 2, elSlots: 2 };
  return { clSlots: 1, elSlots: 1 };
}

/**
 * Feste, reale Qualifikationsplätze für Champions Cup/Europa Cup je Land dieser
 * Zehnerauswahl (Nutzer-Vorgabe, an das echte UEFA-System angelehnt) - ersetzt die
 * vorherige rein Stärke-basierte Herleitung für die Qualifikation des SPIELERVEREINS
 * (die reine Stärke-Herleitung bleibt nur noch fürs synthetische Gegner-Feld übrig,
 * siehe `deriveSlotsFromStrength`). Damit hängt die eigene Qualifikation jetzt direkt
 * und nachvollziehbar am tatsächlichen Tabellenplatz.
 *
 * - `clDirect`: Tabellenplätze 1..N, die OHNE Risiko direkt den Champions Cup
 *   erreichen.
 * - `clQualifyingPosition`: EIN zusätzlicher Tabellenplatz direkt dahinter, der sich
 *   den Champions-Cup-Platz erst über eine Qualifikationsrunde erspielen muss (reale
 *   Play-off-Logik kleinerer Ligen) - bei Erfolg Champions Cup, sonst fällt der Verein
 *   in den Europa Cup durch (nicht komplett leer aus, siehe `resolveEuropeanCompetition`).
 * - `elDirectPosition`: EIN Tabellenplatz, der ohne Qualifikationsrisiko direkt den
 *   Europa Cup erreicht.
 * - `cupWinnerGetsEL`: ob der Sieger des nationalen Pokals zusätzlich einen Europa-
 *   Cup-Platz bekommt, falls er sich nicht ohnehin schon über die Tabelle qualifiziert
 *   hat.
 *
 * Polen ist in der Nutzer-Vorgabe nicht explizit aufgeführt - bewusst wie Belgien/
 * Türkei behandelt (strukturell die schwächste Liga dieser Auswahl, siehe
 * `CountryDef.uefaRank`, damit dasselbe Muster: 1 Platz über Qualifikation, 1 Platz
 * direkt Europa Cup, kein zusätzlicher Pokalsieger-Slot).
 */
export interface CountryEuropeanSlots {
  clDirect: number;
  clQualifyingPosition?: number;
  elDirectPosition: number;
  cupWinnerGetsEL: boolean;
}

const COUNTRY_EUROPEAN_SLOTS: Record<CountryId, CountryEuropeanSlots> = {
  germany: { clDirect: 4, elDirectPosition: 5, cupWinnerGetsEL: true },
  england: { clDirect: 4, elDirectPosition: 5, cupWinnerGetsEL: true },
  spain: { clDirect: 4, elDirectPosition: 5, cupWinnerGetsEL: true },
  italy: { clDirect: 4, elDirectPosition: 5, cupWinnerGetsEL: true },
  france: { clDirect: 3, elDirectPosition: 4, cupWinnerGetsEL: true },
  netherlands: { clDirect: 1, clQualifyingPosition: 2, elDirectPosition: 3, cupWinnerGetsEL: false },
  portugal: { clDirect: 1, clQualifyingPosition: 2, elDirectPosition: 3, cupWinnerGetsEL: true },
  belgium: { clDirect: 0, clQualifyingPosition: 1, elDirectPosition: 2, cupWinnerGetsEL: false },
  turkey: { clDirect: 0, clQualifyingPosition: 1, elDirectPosition: 2, cupWinnerGetsEL: false },
  poland: { clDirect: 0, clQualifyingPosition: 1, elDirectPosition: 2, cupWinnerGetsEL: false },
};

/** Typische Stärke eines kontinentalen Qualifikations-Gegners (Play-off-Runde) auf der
 * Elo-Skala dieses Moduls (siehe `clubElo`) - deutlich über dem Durchschnitt einer
 * mittleren Liga, aber unter den absoluten Spitzenvereinen der stärksten Ligen. Ein
 * Verein mit `clQualifyingPosition` hat damit eine reale, aber klar unterlegene
 * Chance, sich noch in den Champions Cup vorzuspielen. */
const QUALIFYING_ROUND_OPPONENT_ELO = 1900;

/**
 * Ermittelt, ob (und in welchem Wettbewerb) sich der Spielerverein über seinen
 * tatsächlichen Tabellenplatz + (falls einschlägig) den nationalen Pokalsieg
 * qualifiziert - siehe `COUNTRY_EUROPEAN_SLOTS`. `null` = keine Qualifikation.
 */
function resolveEuropeanCompetition(
  countryId: CountryId,
  leaguePosition: number,
  playerElo: number,
  wonNationalCup: boolean,
  rng: () => number
): "CL" | "EL" | null {
  const rules = COUNTRY_EUROPEAN_SLOTS[countryId];
  if (leaguePosition <= rules.clDirect) return "CL";
  if (rules.clQualifyingPosition && leaguePosition === rules.clQualifyingPosition) {
    const qualifyWinChance = expectedScore(playerElo, QUALIFYING_ROUND_OPPONENT_ELO);
    return rng() < qualifyWinChance ? "CL" : "EL";
  }
  if (leaguePosition === rules.elDirectPosition) return "EL";
  if (wonNationalCup && rules.cupWinnerGetsEL) return "EL";
  return null;
}

function computeLeagueStrengths(
  activeCountryId: CountryId,
  activeLeague: LeagueState,
  foreignLeagues: Partial<Record<CountryId, LeagueState>>,
  drift: Partial<Record<CountryId, number>>,
  rng: () => number
): Partial<Record<CountryId, number>> {
  const topEloByCountry: Partial<Record<CountryId, number[]>> = {};
  for (const country of COUNTRIES) {
    const clubs = topClubsForCountry(country.id, activeCountryId, activeLeague, foreignLeagues, TOP_N_FOR_LEAGUE_STRENGTH, rng);
    const d = drift[country.id] ?? 0;
    topEloByCountry[country.id] = clubs.map((c, i) => clubElo(c, country.id, i + 1, d));
  }
  return deriveLeagueStrengths(topEloByCountry);
}

const KNOCKOUT_STAGES = ["Ligaphase", "Achtelfinale", "Viertelfinale", "Halbfinale", "Finale"];

/**
 * Simuliert NUR den Turnierlauf des Spielervereins - kein voller Turnierbaum mit allen
 * echten Begegnungen der übrigen Teilnehmer (siehe Modul-Doku oben). Pro Runde wird
 * die Siegwahrscheinlichkeit gegen einen typischen Gegner-Pool bestimmt
 * (`expectedScore`), der von Runde zu Runde auf die jeweils stärkste verbleibende
 * Hälfte des Feldes schrumpft: in der Ligaphase reicht es, sich gegen den Schnitt der
 * halben Teilnehmerzahl zu behaupten, im Finale nur noch gegen die absolute Spitze.
 */
function simulateKnockoutRun(
  playerElo: number,
  field: { id: string; elo: number }[],
  rng: () => number
): { stageReached: string; champion: boolean } {
  const sorted = [...field].sort((a, b) => b.elo - a.elo);
  for (let i = 0; i < KNOCKOUT_STAGES.length; i++) {
    const poolSize = Math.max(2, Math.round(sorted.length / Math.pow(2, i + 1)));
    const opponentElo = average(sorted.slice(0, poolSize).map((c) => c.elo));
    const winChance = expectedScore(playerElo, opponentElo);
    if (rng() >= winChance) {
      return { stageReached: KNOCKOUT_STAGES[i], champion: false };
    }
  }
  return { stageReached: "Champion", champion: true };
}

export interface EuropeanCupContext {
  playerCountryId: CountryId;
  playerClubId: string;
  /** 1-indexierter Tabellenplatz DIESER Saison (siehe `leaguePosition` in `simulateSeason`). */
  playerLeaguePosition: number;
  /** Bereits berechneter `clubCoefficient` des Spielervereins dieser Saison (siehe
   * `simulateSeason`) - eine einzige Quelle der Wahrheit statt einer zweiten,
   * potenziell abweichenden Berechnung hier. */
  playerClubCoefficient: number;
  /** Aktive Heimatliga des Spielers. */
  league: LeagueState;
  foreignLeagues: Partial<Record<CountryId, LeagueState>>;
  /** `GameState.europeanLeagueDrift` - wird hier NUR gelesen, siehe `advanceEuropeanLeagueDrift`. */
  drift: Partial<Record<CountryId, number>>;
  /** Hat der Spielerverein DIESE Saison den nationalen Pokal gewonnen (siehe
   * `computeSeasonNationalCupResult`) - zusätzlicher Qualifikationsweg für den Europa
   * Cup in einigen Ligen, siehe `COUNTRY_EUROPEAN_SLOTS`. */
  playerWonNationalCup: boolean;
  rng: () => number;
}

/**
 * Ermittelt Qualifikation + Turnierausgang für die aktuelle Saison. Gibt `null` zurück,
 * wenn weder Tabellenplatz noch Pokalsieg für Champions Cup/Europa Cup reichen
 * (Zweitligisten werden vom Aufrufer gar nicht erst hierher gereicht, siehe
 * `simulateSeason`).
 */
export function computeSeasonEuropeanCupResult(ctx: EuropeanCupContext): EuropeanCupResult | null {
  const {
    playerCountryId,
    playerClubId,
    playerLeaguePosition,
    playerClubCoefficient,
    league,
    foreignLeagues,
    drift,
    playerWonNationalCup,
    rng,
  } = ctx;

  const ownDrift = drift[playerCountryId] ?? 0;
  const playerElo = ELO_BASE + playerClubCoefficient * ELO_COEFF_SCALE + ownDrift;

  // Eigene Qualifikation: fest an den tatsächlichen Tabellenplatz (+ ggf. Pokalsieg)
  // gekoppelt, siehe `COUNTRY_EUROPEAN_SLOTS`/`resolveEuropeanCompetition` - NICHT mehr
  // an die fuzzy Stärke-Herleitung, die den Bezug zum Tabellenplatz für den Spieler
  // selbst zu unklar wirken ließ (Bugreport).
  const competition = resolveEuropeanCompetition(playerCountryId, playerLeaguePosition, playerElo, playerWonNationalCup, rng);
  if (!competition) return null;

  // Das synthetische Gegner-Feld anderer Länder nutzt weiterhin die fuzzy Stärke-
  // Herleitung (`deriveSlotsFromStrength`) - hier geht es nur um eine plausible
  // Turnier-SCHWIERIGKEIT, nicht um die exakte reale Qualifikation fremder Vereine,
  // die dieses Spiel ohnehin nicht einzeln simuliert.
  const leagueStrengths = computeLeagueStrengths(playerCountryId, league, foreignLeagues, drift, rng);

  // Feld: pro Land die für DIESEN Wettbewerb infrage kommenden Top-Vereine (CL: die
  // besten `clSlots`, EL: die `elSlots` direkt dahinter). Im eigenen Land wird der
  // Spielerverein garantiert mitgezählt - er hat sich sportlich qualifiziert, auch
  // wenn seine reine Stärkezahl nicht literal unter den Top-Vereinen der Liga liegt
  // (die tatsächliche Tabellenplatzierung berücksichtigt zusätzlich Form/Zufall der
  // Saison, siehe `leaguePosition` in `simulateSeason`).
  const field: { id: string; elo: number }[] = [];
  for (const country of COUNTRIES) {
    const slots = deriveSlotsFromStrength(leagueStrengths[country.id] ?? 0.3);
    const rangeStart = competition === "CL" ? 0 : slots.clSlots;
    const rangeCount = competition === "CL" ? slots.clSlots : slots.elSlots;
    if (rangeCount <= 0) continue;

    const d = drift[country.id] ?? 0;
    const pool = topClubsForCountry(country.id, playerCountryId, league, foreignLeagues, slots.clSlots + slots.elSlots, rng);
    let entrants = pool
      .slice(rangeStart, rangeStart + rangeCount)
      .map((c, i) => ({ id: c.id, elo: clubElo(c, country.id, rangeStart + i + 1, d) }));

    if (country.id === playerCountryId) {
      entrants = [{ id: playerClubId, elo: playerElo }, ...entrants.filter((e) => e.id !== playerClubId)].slice(0, rangeCount);
    }
    field.push(...entrants);
  }
  // Randfall (extrem kleines/gerundetes Feld): Spielerverein notfalls anhängen - er hat
  // sich schließlich sportlich qualifiziert und darf im Feld nie fehlen.
  if (!field.some((e) => e.id === playerClubId)) {
    field.push({ id: playerClubId, elo: playerElo });
  }

  const run = simulateKnockoutRun(playerElo, field, rng);
  return { competition, stageReached: run.stageReached, champion: run.champion };
}
