// Nationaler Pokal (K.o.-Wettbewerb unter ALLEN Liga-1- und Liga-2-Vereinen eines
// Landes) - dieselbe Elo-Grundidee wie europeanCup.ts (clubCoefficient als Elo-Basis,
// Rundenlauf des Spielervereins gegen einen schrumpfenden Gegner-Pool), aber bewusst
// einfacher: anders als CL/EL gibt es keine Qualifikation (jeder Verein ist automatisch
// dabei) und keine anderen Länder (das komplette Teilnehmerfeld sind die bereits real
// vorhandenen Vereine der AKTIVEN Liga-Pyramide - kein Ephemeral-Building, kein Drift,
// kein persistenter State nötig). Der einzige bewusste Unterschied zu europeanCup.ts:
// eine deutlich flachere Elo-Formel (größerer Nenner), weil echte nationale Pokale
// spürbar mehr Außenseiter-Sensationen produzieren als ein europäischer Wettbewerb
// unter lauter Erstliga-Topklubs.

import type { ClubState, LeagueState, NationalCupResult } from "./types";
import { clubCoefficient, clubLeagueRank } from "./leagueEngine";

/** Flacher als der Standard-Elo-Erwartungswert (Nenner 600 statt 400) - Außenseiter
 * haben im nationalen Pokal spürbar reellere Chancen als im Europapokal
 * (`expectedScore` in europeanCup.ts), ohne dass die Favoritenrolle bedeutungslos wird. */
function underdogFriendlyExpectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 600));
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

const NATIONAL_CUP_STAGES = ["Runde 1", "Achtelfinale", "Viertelfinale", "Halbfinale", "Finale"];

/** Anteil des Feldes (nach Elo sortiert), der noch als "Favorit" gilt - wer außerhalb
 * dieser Zone gewinnt, gilt als echter Außenseiter-Sieg (siehe `NationalCupResult.
 * underdog`, Auslöser für das zugehörige Event). */
const FAVORITE_PERCENTILE = 0.35;

export interface NationalCupContext {
  league: LeagueState;
  playerClubId: string;
  /** Bereits berechneter `clubCoefficient` des Spielervereins dieser Saison (siehe
   * `simulateSeason`) - eine einzige Quelle der Wahrheit statt einer zweiten,
   * potenziell abweichenden Berechnung hier (siehe europeanCup.ts). */
  playerClubCoefficient: number;
  rng: () => number;
}

/** Baut das komplette Teilnehmerfeld (Liga 1 + Liga 2) mit ELO-artigem Koeffizienten je
 * Verein - alles reale, bereits geladene Vereine der aktiven Liga-Pyramide. */
function buildField(
  league: LeagueState,
  playerClubId: string,
  playerClubCoefficient: number
): { id: string; elo: number }[] {
  const allClubs: ClubState[] = [...league.tier1, ...league.tier2];
  return allClubs.map((c) => {
    if (c.id === playerClubId) return { id: c.id, elo: playerClubCoefficient };
    const rank = clubLeagueRank(c.id, c.tier, league); // undefined für Liga-2-Vereine
    return { id: c.id, elo: clubCoefficient(c, league.countryId, rank) };
  });
}

/**
 * Simuliert NUR den Pokallauf des Spielervereins (kein voller Turnierbaum mit allen
 * echten Begegnungen der übrigen Vereine, siehe Modul-Doku oben) - pro Runde die
 * Siegwahrscheinlichkeit gegen einen typischen Gegner-Pool (`underdogFriendlyExpected
 * Score`), der von Runde zu Runde auf die jeweils stärkste verbleibende Hälfte des
 * Feldes schrumpft.
 */
function simulateNationalCupRun(
  playerElo: number,
  field: { id: string; elo: number }[],
  rng: () => number
): { stageReached: string; champion: boolean } {
  const sorted = [...field].sort((a, b) => b.elo - a.elo);
  for (let i = 0; i < NATIONAL_CUP_STAGES.length; i++) {
    const poolSize = Math.max(2, Math.round(sorted.length / Math.pow(2, i + 1)));
    const opponentElo = average(sorted.slice(0, poolSize).map((c) => c.elo));
    const winChance = underdogFriendlyExpectedScore(playerElo, opponentElo);
    if (rng() >= winChance) {
      return { stageReached: NATIONAL_CUP_STAGES[i], champion: false };
    }
  }
  return { stageReached: "Champion", champion: true };
}

/** Ermittelt Pokalausgang der aktuellen Saison - läuft für JEDEN Liga-1-/Liga-2-Verein
 * (anders als `computeSeasonEuropeanCupResult` gibt es keine Qualifikationshürde). */
export function computeSeasonNationalCupResult(ctx: NationalCupContext): NationalCupResult {
  const { league, playerClubId, playerClubCoefficient, rng } = ctx;
  const field = buildField(league, playerClubId, playerClubCoefficient);

  const sorted = [...field].sort((a, b) => b.elo - a.elo);
  const playerIndex = sorted.findIndex((e) => e.id === playerClubId);
  const percentileRank = sorted.length > 1 ? playerIndex / (sorted.length - 1) : 0; // 0 = stärkster, 1 = schwächster
  const isFavorite = percentileRank <= FAVORITE_PERCENTILE;

  const run = simulateNationalCupRun(playerClubCoefficient, field, rng);
  return { stageReached: run.stageReached, champion: run.champion, underdog: run.champion && !isFavorite };
}
