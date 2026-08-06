import type { ClubState, LeagueState, LeagueTier, TableRow } from "./types";
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
  // Unter den 8 nächstliegenden Vereinen zufällig wählen, statt immer den exakt
  // nächsten zu nehmen - ein zu enger Radius (früher 4) sorgte dafür, dass sich
  // über eine ganze Karriere hinweg immer wieder dieselbe Handvoll Vereine
  // wiederholte, weil sich die Ziel-Stärke zwischen Events nur langsam verschiebt.
  const shortlist = sorted.slice(0, Math.min(8, sorted.length));
  return shortlist[Math.floor(rng() * shortlist.length)];
}

/**
 * Wählt bis zu `count` unterschiedliche Vereine nahe einer Ziel-Stärke aus (z.B.
 * für "3 Vereine bieten dir einen Platz an"). Die Auswahl kommt aus einem
 * Shortlist der nächstliegenden Vereine, damit trotzdem etwas Varianz entsteht.
 */
export function pickDistinctClubOffers(
  clubs: ClubState[],
  targetStrength: number,
  excludeIds: string[],
  rng: () => number,
  count: number
): ClubState[] {
  const excludeSet = new Set(excludeIds);
  const candidates = clubs.filter((c) => !excludeSet.has(c.id));
  const pool = candidates.length >= count ? candidates : clubs;
  const sorted = [...pool].sort(
    (a, b) => Math.abs(a.strength - targetStrength) - Math.abs(b.strength - targetStrength)
  );
  // Ein zu enger Radius (früher count*3, min. 6) griff über eine ganze Karriere
  // hinweg immer wieder auf dieselbe Handvoll Vereine zurück, weil sich die
  // Ziel-Stärke zwischen aufeinanderfolgenden Angebots-Events nur langsam
  // verschiebt - deutlich breiter gefasst sorgt für echte Abwechslung, bleibt
  // aber durch die Sortierung nach Distanz weiter auf plausible Kandidaten
  // fokussiert (kein zufälliger Verein von komplett falschem Niveau).
  const shortlistSize = Math.min(Math.max(count * 6, 14), sorted.length);
  const shortlist = sorted.slice(0, shortlistSize);

  const picked: ClubState[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (picked.length < count && used.size < shortlist.length && guard < 200) {
    guard++;
    const candidate = shortlist[Math.floor(rng() * shortlist.length)];
    if (used.has(candidate.id)) continue;
    used.add(candidate.id);
    picked.push(candidate);
  }
  return picked;
}

/** Verteilt `count` Vereine über die Stärkespanne eines Pools (schwach/mittel/stark). */
export function pickSpreadClubOffers(clubs: ClubState[], rng: () => number, count: number): ClubState[] {
  const sorted = [...clubs].sort((a, b) => a.strength - b.strength);
  const bucketSize = Math.max(1, Math.floor(sorted.length / count));
  const picks: ClubState[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * bucketSize;
    const end = i === count - 1 ? sorted.length : start + bucketSize;
    const slice = sorted.slice(start, Math.max(end, start + 1));
    if (slice.length === 0) continue;
    picks.push(slice[Math.floor(rng() * slice.length)]);
  }
  return picks;
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
 *
 * WICHTIG: Die Liga-Pyramide hat bewusst nur zwei Ebenen (siehe `LeagueTier = 1 | 2`
 * in types.ts) - es gibt keine dritte Liga. `relegated` wird daher ausschließlich
 * aus den schwächsten Liga-1-Vereinen gespeist (steigen nach Liga 2 ab), `promoted`
 * ausschließlich aus den stärksten Liga-2-Vereinen (steigen nach Liga 1 auf). Ein
 * Liga-2-Verein kann hier strukturell NIEMALS als "relegated" landen, weil
 * `tier1Order`/`tier2Order` streng getrennt bleiben - ihm fehlt schlicht eine
 * niedrigere Liga, in die er absteigen könnte. Die Auf-/Abstiegsmechanik
 * zwischen Liga 1 und Liga 2 bleibt davon unberührt voll erhalten.
 */
export function simulateLeaguePromotionRelegation(
  league: LeagueState,
  rng: () => number
): PromotionRelegationResult {
  const tier1Order = simulateTable(league.tier1, rng);
  const tier2Order = simulateTable(league.tier2, rng);

  const n = Math.min(league.swapCount, league.tier1.length - 1, league.tier2.length - 1);
  // Abstieg NUR aus Liga 1 (die schwächsten n Vereine) ...
  const relegated = tier1Order.slice(-n).map(({ rank: _rank, ...c }) => c);
  // ... Aufstieg NUR aus Liga 2 (die stärksten n Vereine) - Liga 2 selbst hat
  // keine "Abstiegszone", da es keine dritte Liga gibt.
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

/**
 * Erzeugt eine plausible Gesamttabelle (S/U/N/Tore/Diff/Pkt) für eine Liga-Ebene,
 * mit dem eigenen Verein EXAKT auf `leaguePosition` verankert - dem Wert, der
 * bereits an anderer Stelle angezeigt wird (Dashboard, Saisonrückblick). Keine
 * echte Spiel-für-Spiel-Simulation, sondern eine rang-basierte Kurve: der
 * Tabellenführer holt realistisch ~2.0-2.3 Punkte/Spiel, der Tabellenletzte
 * ~0.5-0.7 - dazwischen fällt die Punktzahl mit etwas Rauschen monoton, damit
 * die Tabelle beim Runterlesen nie wieder "ansteigt" (wie in einer echten Liga).
 * Die Punktzahl ist danach immer exakt 3×Siege+Unentschieden - keine
 * kosmetische Rundungsdifferenz zwischen den Spalten.
 *
 * Die Spielanzahl (`G`) ergibt sich aus einer ECHTEN Hin- und Rückrunde
 * (jeder Verein spielt gegen jeden anderen zweimal, 2×(Vereinsanzahl-1)) - NICHT
 * aus der pauschalen Saison-Spielanzahl des Spielers (die variiert je nach
 * Kaderrolle/Verletzung und hat mit der Liga-Größe nichts zu tun). Die
 * Vereinsanzahl je Liga-Ebene schwankt in diesem Spiel real zwischen 12 und 24
 * (siehe leagues.ts) - eine feste Zahl wie 34 wäre für die meisten Ligen schlicht
 * falsch (12 Vereine → 22 Spiele, 24 Vereine → 46 Spiele, nicht 30/34).
 */
function buildLeagueTable(
  clubs: ClubState[],
  playerClubId: string,
  playerClubName: string,
  leaguePosition: number,
  rngFn: () => number
): TableRow[] {
  const total = clubs.length;
  if (total === 0) return [];
  const position = clamp(Math.round(leaguePosition), 1, total);

  // Die übrigen Vereine nach Stärke + Rauschen sortieren (EINMAL bewertet, nicht
  // im Comparator gewürfelt - ein im Comparator aufgerufener Zufallswert würde
  // bei manchen Sortier-Implementierungen zu inkonsistenten Vergleichen führen).
  const others = clubs
    .filter((c) => c.id !== playerClubId)
    .map((c) => ({ club: c, score: c.strength + (rngFn() - 0.5) * 15 }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.club);

  const slots: { id: string; name: string; isPlayer: boolean }[] = [];
  let otherIdx = 0;
  for (let pos = 1; pos <= total; pos++) {
    if (pos === position) {
      slots.push({ id: playerClubId, name: playerClubName, isPlayer: true });
    } else {
      const c = others[otherIdx++];
      slots.push({ id: c.id, name: c.city, isPlayer: false });
    }
  }

  const G = Math.max(2, 2 * (total - 1)); // Hin- und Rückrunde
  const topPts = Math.round(2.15 * G);
  const bottomPts = Math.round(0.55 * G);
  const avgStep = total > 1 ? (topPts - bottomPts) / (total - 1) : 0;

  const rows: TableRow[] = [];
  let prevPoints = topPts + Math.round((rngFn() - 0.5) * 4);
  for (let i = 0; i < total; i++) {
    const t = total > 1 ? i / (total - 1) : 0;

    let targetPoints: number;
    if (i === 0) {
      targetPoints = prevPoints;
    } else {
      const step = avgStep * (0.4 + rngFn() * 1.2);
      targetPoints = Math.max(0, Math.round(prevPoints - step));
    }

    const drawsFrac = clamp(0.24 + (rngFn() - 0.5) * 0.08, 0.1, 0.4);
    let draws = clamp(Math.round(G * drawsFrac), 0, G);
    const remaining = G - draws;
    let wins = clamp(Math.round((targetPoints - draws) / 3), 0, remaining);
    let losses = remaining - wins;
    let points = wins * 3 + draws;
    // Monotonie erzwingen: nie mehr Punkte als der Vorgänger auf der Tabelle.
    // Erst Siege in Niederlagen umwandeln (kostet 3 Punkte), und - falls das
    // allein nicht reicht (0 Siege, aber noch zu viele Unentschieden) - auch
    // Unentschieden in Niederlagen (kostet 1 Punkt), bis entweder die Tabelle
    // wieder passt oder wirklich nichts mehr reduzierbar ist (0 Siege, 0 Remis).
    while (i > 0 && points > prevPoints && (wins > 0 || draws > 0)) {
      if (wins > 0) wins--;
      else draws--;
      losses++;
      points = wins * 3 + draws;
    }
    prevPoints = points;

    const attackPerGame = Math.max(0.4, 2.0 - t * 1.05 + (rngFn() - 0.5) * 0.3);
    const goalsFor = Math.max(0, Math.round(G * attackPerGame));
    const gdCurve = (42 - t * 77) * (G / 34) + (rngFn() - 0.5) * 8;
    const goalsAgainst = Math.max(0, Math.round(goalsFor - gdCurve));

    const slot = slots[i];
    rows.push({
      clubId: slot.id,
      club: slot.name,
      position: i + 1,
      isPlayerClub: slot.isPlayer,
      played: G,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDiff: goalsFor - goalsAgainst,
      points,
    });
  }

  return rows;
}

/** Schneidet aus der vollen Tabelle den Ausschnitt um den eigenen Verein herum
 * (3 Plätze darüber, 3 darunter) - das eigentliche Ergebnis für den Saisonrückblick. */
export function buildTableSnapshot(
  league: LeagueState,
  tier: LeagueTier,
  playerClubId: string,
  playerClubName: string,
  leaguePosition: number,
  rngFn: () => number
): TableRow[] {
  const clubs = clubsForTier(league, tier);
  const fullTable = buildLeagueTable(clubs, playerClubId, playerClubName, leaguePosition, rngFn);
  const idx = fullTable.findIndex((r) => r.isPlayerClub);
  if (idx === -1) return fullTable.slice(0, 7);
  const start = Math.max(0, idx - 3);
  const end = Math.min(fullTable.length, idx + 4);
  return fullTable.slice(start, end);
}
