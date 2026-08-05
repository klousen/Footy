import type { ClubState, LeagueState, LeagueTier } from "./types";
import { clamp } from "./data";
import { COUNTRIES, disambiguateCities, type CountryId } from "./leagues";

/** Baut die initiale Liga-Pyramide (Liga 1 + Liga 2) für ein gewähltes Land auf. */
export function buildLeagueState(countryId: CountryId, rng: () => number): LeagueState {
  const def = COUNTRIES.find((c) => c.id === countryId);
  if (!def) throw new Error(`Unbekanntes Land: ${countryId}`);

  const tier1Names = disambiguateCities(def.tier1Cities);
  const tier2Names = disambiguateCities(def.tier2Cities);

  const tier1: ClubState[] = tier1Names.map((city, i) => ({
    id: `${countryId}-t1-${i}`,
    city,
    tier: 1,
    strength: strengthForRank(i, tier1Names.length, 92, 60, rng),
  }));
  const tier2: ClubState[] = tier2Names.map((city, i) => ({
    id: `${countryId}-t2-${i}`,
    city,
    tier: 2,
    strength: strengthForRank(i, tier2Names.length, 56, 32, rng),
  }));

  return {
    countryId,
    countryName: def.name,
    flag: def.flag,
    tier1Name: def.tier1Name,
    tier2Name: def.tier2Name,
    swapCount: def.swapCount,
    tier1,
    tier2,
  };
}

function strengthForRank(index: number, total: number, top: number, bottom: number, rng: () => number): number {
  const t = total <= 1 ? 0 : index / (total - 1);
  const base = top - t * (top - bottom);
  return clamp(Math.round(base + (rng() - 0.5) * 8), 10, 99);
}

export function findClub(league: LeagueState, clubId: string): ClubState | undefined {
  return league.tier1.find((c) => c.id === clubId) ?? league.tier2.find((c) => c.id === clubId);
}

export function clubsForTier(league: LeagueState, tier: LeagueTier): ClubState[] {
  return tier === 1 ? league.tier1 : league.tier2;
}

export function leagueNameForTier(league: LeagueState, tier: LeagueTier): string {
  return tier === 1 ? league.tier1Name : league.tier2Name;
}

/** Wählt aus einer Liga-Ebene einen Verein nahe einer Ziel-Stärke (für Transfers/Beförderungen). */
export function pickClubNearStrength(
  clubs: ClubState[],
  targetStrength: number,
  excludeId: string | null,
  rng: () => number
): ClubState {
  const candidates = clubs.filter((c) => c.id !== excludeId);
  const pool = candidates.length > 0 ? candidates : clubs;
  const sorted = [...pool].sort((a, b) => Math.abs(a.strength - targetStrength) - Math.abs(b.strength - targetStrength));
  // Unter den 4 nächstliegenden Vereinen zufällig wählen, statt immer den exakt nächsten zu nehmen
  const shortlist = sorted.slice(0, Math.min(4, sorted.length));
  return shortlist[Math.floor(rng() * shortlist.length)];
}

export interface SeasonTableResult {
  order: (ClubState & { rank: number })[];
}

/** Simuliert eine komplette Saison-Tabelle für eine Liga-Ebene (Stärke + Zufall). */
function simulateTable(clubs: ClubState[], rng: () => number): (ClubState & { rank: number })[] {
  const scored = clubs.map((c) => ({ club: c, score: c.strength + (rng() - 0.5) * 30 }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s, i) => ({ ...s.club, rank: i + 1 }));
}

export interface PromotionRelegationResult {
  promoted: ClubState[]; // von Liga 2 in Liga 1
  relegated: ClubState[]; // von Liga 1 in Liga 2
  tier1Order: (ClubState & { rank: number })[];
  tier2Order: (ClubState & { rank: number })[];
}

/**
 * Simuliert die komplette Saison für Liga 1 und Liga 2 eines Landes und wendet
 * Auf-/Abstieg an (mutiert `league.tier1` / `league.tier2`). Vereins-IDs bleiben
 * über Auf-/Abstieg hinweg stabil.
 */
export function simulateLeaguePromotionRelegation(
  league: LeagueState,
  rng: () => number
): PromotionRelegationResult {
  const tier1Order = simulateTable(league.tier1, rng);
  const tier2Order = simulateTable(league.tier2, rng);

  const n = Math.min(league.swapCount, league.tier1.length - 1, league.tier2.length - 1);
  const relegated = tier1Order.slice(-n).map(({ rank: _rank, ...c }) => c);
  const promoted = tier2Order.slice(0, n).map(({ rank: _rank, ...c }) => c);

  const relegatedIds = new Set(relegated.map((c) => c.id));
  const promotedIds = new Set(promoted.map((c) => c.id));

  const newTier1 = [
    ...league.tier1.filter((c) => !relegatedIds.has(c.id)),
    ...promoted.map((c) => ({ ...c, tier: 1 as LeagueTier })),
  ];
  const newTier2 = [
    ...league.tier2.filter((c) => !promotedIds.has(c.id)),
    ...relegated.map((c) => ({ ...c, tier: 2 as LeagueTier })),
  ];

  league.tier1 = newTier1;
  league.tier2 = newTier2;

  return { promoted, relegated, tier1Order, tier2Order };
}
