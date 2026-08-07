import type { ClubState, LeagueState, LeagueTier, TableRow } from "./types";
import { clamp } from "./data";
import { COUNTRIES, disambiguateCities, type CountryId } from "./leagues";

/** Rang eines Landes nach echter UEFA-5-Jahreswertung (siehe `CountryDef.uefaRank` in
 * leagues.ts) - 0 = höchstes Liga-Ansehen (England), 9 = niedrigstes (Polen) innerhalb
 * dieser Zehnerauswahl. Bewusst UNABHÄNGIG von der Deklarationsreihenfolge der
 * `COUNTRIES`-Liste (die weiterhin die Anzeige-Reihenfolge auf dem
 * Länder-Auswahlbildschirm bestimmt) - Liga-Ansehen und Anzeige-Sortierung sind zwei
 * verschiedene Dinge. Dient als Proxy für "Aufstieg/Abstieg im Liga-Ranking" bei
 * internationalen Wechseln sowie als Basis fürs Gehalt (siehe `leaguePrestigeMultiplier`). */
export function leaguePrestigeRank(countryId: CountryId): number {
  const def = COUNTRIES.find((c) => c.id === countryId);
  return def ? def.uefaRank - 1 : COUNTRIES.length;
}

/**
 * Reale UEFA-Team-Koeffizienten-Summe je Land (Stand 04.08.2026, dieselben Werte wie im
 * `uefaRank`-Kommentar in leagues.ts, dort bisher nur als Rechercheergebnis dokumentiert,
 * aber nie tatsächlich in eine Formel eingespeist). England (ca. 821) liegt real etwa
 * 5.5x über Polen (ca. 149) - eine reine Rang-basierte Formel (1 bis 10, gleich große
 * Schritte) kann diesen SCHIEFEN Abstand strukturell nicht abbilden: England/Spanien/
 * Italien/Deutschland liegen real eng beieinander an der Spitze, dann ein großer Sprung
 * runter zu Frankreich, ein moderater weiter zu Portugal, ein kleinerer zu Belgien/
 * Niederlande, und Türkei/Polen liegen wiederum eng beieinander ganz unten - eine
 * Rang-Formel mit fixen 0.06-Schritten pro Platz verteilt das stattdessen künstlich
 * gleichmäßig (Bugreport: schwache Ligen schneiden im internationalen Vergleich
 * spürbar zu gut ab, z.B. gewinnt ein Top-Verein aus Polen/Türkei gegen einen aus
 * England/Deutschland deutlich öfter, als der reale Klassenunterschied hergibt).
 */
const UEFA_COEFFICIENT_SUM: Record<CountryId, number> = {
  england: 821,
  spain: 629,
  italy: 610,
  germany: 594,
  france: 425,
  portugal: 338,
  belgium: 251,
  netherlands: 251,
  turkey: 179,
  poland: 149,
};

/** Ligaansehen als Multiplikator: die bestplatzierte Liga der Auswahl zahlt spürbar
 * mehr, die am niedrigsten platzierte spürbar weniger - dieselbe Vereinsstärke ist in
 * einer Topliga schlicht mehr wert als in einer schwächeren (reale Transfermarkt-Logik).
 * Aus der REALEN UEFA-Koeffizienten-Summe hergeleitet (siehe `UEFA_COEFFICIENT_SUM`)
 * statt aus der bloßen Rang-Position - eine Quadratwurzel-Normalisierung staucht den
 * realen ~5.5x-Abstand auf einen spielbaren, aber deutlich saftigeren Abstand als
 * zuvor (Spanne jetzt ca. 0.65-1.4 statt 0.7-1.3), OHNE die Wurzel-Kompression komplett
 * fallen zu lassen: eine 1:1-Übertragung des realen 5.5x-Verhältnisses würde v.a. das
 * Gehaltsgefüge (siehe `estimateWage`) für Spieler in kleineren Ligen unrealistisch
 * stark abwerten. */
export function leaguePrestigeMultiplier(countryId: CountryId): number {
  const values = Object.values(UEFA_COEFFICIENT_SUM);
  const min = Math.sqrt(Math.min(...values));
  const max = Math.sqrt(Math.max(...values));
  const sum = UEFA_COEFFICIENT_SUM[countryId] ?? Math.min(...values);
  const t = max > min ? (Math.sqrt(sum) - min) / (max - min) : 0;
  return clamp(0.65 + t * 0.75, 0.65, 1.4);
}

/**
 * 1-indexierter Rang eines Vereins innerhalb der ERSTEN Liga seines Landes nach
 * Stärke (1 = stärkster Erstligist) - dient als Näherung dafür, ob ein Verein nicht
 * nur "eine hohe Zahl" hat, sondern tatsächlich die klare Tabellenspitze seiner Liga
 * ist (siehe `internationalFlairBonus`). Zweitligisten sind hierfür nie relevant
 * (liefert dann `undefined`) - laut echten UEFA-Team-Koeffizienten sind praktisch
 * ausschließlich Erstligisten unter den international prägenden Topklubs.
 */
export function clubLeagueRank(clubId: string, tier: LeagueTier, league: LeagueState): number | undefined {
  if (tier !== 1) return undefined;
  const sorted = [...league.tier1].sort((a, b) => b.strength - a.strength);
  const idx = sorted.findIndex((c) => c.id === clubId);
  return idx === -1 ? undefined : idx + 1;
}

/**
 * "Internationaler Flair"-Bonus: ein wirklich absoluter Topklub (Champions-League-
 * Format-Niveau) IN einer der großen Ligen bringt kommerziell mehr mit, als die reine
 * Stärkezahl hergibt - globale Sponsoren, TV-Vermarktung, CL-Prämien. Bewusst als
 * Überschneidung aus BEIDEM modelliert (hohe Vereinsstärke UND hohes Liga-Ansehen),
 * nicht als Summe: ein starker Verein in einer kleinen Liga (z.B. Legia Warschau) hat
 * dieses globale Scheinwerferlicht nicht in demselben Maß, und selbst ein mittelmäßiger
 * Verein in einer Topliga bekommt keinen Flair-Aufschlag nur fürs Liga-Ansehen (das
 * deckt bereits `leaguePrestigeMultiplier` ab). Wirkt daher nur ganz oben - ab Stärke
 * 80 aufwärts und nur in den (grob) fünf angesehensten Ligen dieser Auswahl.
 *
 * Zusätzlich ein spürbarer Aufschlag für die absolute Tabellenspitze der eigenen Liga
 * (siehe `clubLeagueRank`, optionaler `leagueRank`-Parameter): laut den echten UEFA-
 * Team-Koeffizienten (siehe `CountryDef.uefaRank`) sind die WELTWEIT prägenden
 * Topklubs nicht gleichmäßig über eine Topliga verteilt, sondern konzentrieren sich
 * auf deren Tabellenspitze (Bayern klar vor dem Rest der Bundesliga, PSG klar vor dem
 * Rest der Ligue 1, während England/Spanien gleich mehrere Vereine ganz oben stellen)
 * - ein Rang-1-Verein bekommt daher den größten Aufschlag, Rang 2/3 einen kleineren,
 * gestaffelt nach demselben Liga-Ansehen wie der Basis-Flair.
 */
export function internationalFlairBonus(clubStrength: number, countryId: CountryId, leagueRank?: number): number {
  const strengthFactor = clamp((clubStrength - 80) / 19, 0, 1); // 0 unter 80, 1 ab Stärke 99
  const prestigeFactor = clamp((leaguePrestigeMultiplier(countryId) - 1) / 0.3, 0, 1); // 0 ab Rang 5, 1 bei Rang 0
  let bonus = strengthFactor * prestigeFactor;
  const rankBonus = leagueRank === 1 ? 1 : leagueRank === 2 ? 0.55 : leagueRank === 3 ? 0.3 : 0;
  bonus += rankBonus * prestigeFactor * strengthFactor * 0.6;
  return bonus;
}

/**
 * ELO-artiger Vereins-Koeffizient: kombiniert die sportliche Stärke des Klubs
 * (0-99, innerhalb der eigenen Liga-Pyramide) mit dem Ansehen der Liga selbst
 * zu einem einzigen Wert - und obendrauf einen Flair-Aufschlag für echte
 * Topklubs in Topligen (siehe `internationalFlairBonus`). Ein "92" in einer
 * Topliga ist damit spürbar mehr wert als ein "92" in einer schwächeren, und
 * ein "92" beim internationalen Aushängeschild nochmal mehr als ein "92" beim
 * soliden Mittelständler derselben Liga - dient als einheitliche Basis fürs
 * Gehalt (und ließe sich künftig für weitere vereinsbezogene Berechnungen
 * wiederverwenden). `leagueRank` (optional, siehe `clubLeagueRank`) verstärkt
 * das für die tatsächliche Tabellenspitze der eigenen Liga zusätzlich.
 */
export function clubCoefficient(club: { strength: number }, countryId: CountryId, leagueRank?: number): number {
  const flair = internationalFlairBonus(club.strength, countryId, leagueRank);
  return club.strength * leaguePrestigeMultiplier(countryId) * (1 + flair * 0.5);
}

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
    hasRelegationPlayoff: def.hasRelegationPlayoff ?? false,
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

/** Simuliert eine komplette Saison-Tabelle für eine Liga-Ebene (Stärke + Zufall).
 * `formSurprise` (das reine Zufalls-/Formrauschen dieser Saison, also `score -
 * strength`) wird mitgeliefert - dient `computeClubResultDrift` als direktes,
 * unverzerrtes "über-/unterdurchschnittlich performt"-Signal (siehe dort, warum ein
 * reiner Rang-Vergleich dafür ungeeignet wäre). */
function simulateTable(clubs: ClubState[], rng: () => number): (ClubState & { rank: number; formSurprise: number })[] {
  const scored = clubs.map((c) => {
    const formSurprise = (rng() - 0.5) * 30;
    return { club: c, score: c.strength + formSurprise, formSurprise };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s, i) => ({ ...s.club, rank: i + 1, formSurprise: s.formSurprise }));
}

/**
 * Wie `simulateTable`, aber mit dem Spielerverein EXAKT auf `anchorPosition`
 * verankert (analog zu `buildLeagueTable`, das dieselbe Anker-Logik für die im
 * Saisonrückblick angezeigte Tabelle nutzt) - alle übrigen Vereine werden weiterhin
 * per Stärke + Zufallsrauschen sortiert und um den Anker herum eingefügt.
 *
 * Ohne diese Verankerung würfelte die Auf-/Abstiegs-Simulation den Spielerverein
 * komplett unabhängig von der angezeigten Tabellenplatzierung neu (nur aus der
 * rohen `ClubState.strength`, ohne jeden Bezug zur persönlichen Saisonleistung) -
 * das konnte dazu führen, dass die Tabelle z.B. Platz 6 zeigte, der Verein laut
 * dieser zweiten, unabhängigen Simulation aber trotzdem abstieg (Bugreport).
 */
function simulateTableAnchored(
  clubs: ClubState[],
  anchorClubId: string,
  anchorPosition: number,
  rng: () => number
): (ClubState & { rank: number; formSurprise: number })[] {
  const total = clubs.length;
  const anchorClub = clubs.find((c) => c.id === anchorClubId);
  if (!anchorClub) return simulateTable(clubs, rng);

  const position = clamp(Math.round(anchorPosition), 1, total);
  const others = clubs
    .filter((c) => c.id !== anchorClubId)
    .map((c) => {
      const formSurprise = (rng() - 0.5) * 30;
      return { club: c, score: c.strength + formSurprise, formSurprise };
    })
    .sort((a, b) => b.score - a.score);

  // Der verankerte Verein selbst hat keinen eigenen Zufalls-Rauschterm (seine Position
  // steht fest) - sein `formSurprise` wird stattdessen aus dem Vergleich der
  // tatsächlichen (verankerten) Platzierung mit der reinen Stärke-Rangfolge
  // hergeleitet, umgerechnet auf dieselbe Rauschskala wie die übrigen Vereine (Ø
  // Stärke-Abstand zwischen benachbarten Tabellenplätzen × Rang-Differenz). Bewusst
  // NUR für diesen einen Verein rang-basiert statt für das ganze Feld (siehe
  // `computeClubResultDrift`) - ein einzelner Datenpunkt hat nicht den systematischen
  // Verzerrungseffekt, den ein Rang-Vergleich über ALLE Vereine hätte.
  const byStrength = [...clubs].sort((a, b) => b.strength - a.strength);
  const strengthRank = byStrength.findIndex((c) => c.id === anchorClubId) + 1;
  const strengthSpread = byStrength[0].strength - byStrength[byStrength.length - 1].strength;
  const avgGap = total > 1 ? strengthSpread / (total - 1) : 0;
  const anchorFormSurprise = (strengthRank - position) * avgGap;

  const ordered: (ClubState & { rank: number; formSurprise: number })[] = [];
  let otherIdx = 0;
  for (let pos = 1; pos <= total; pos++) {
    if (pos === position) {
      ordered.push({ ...anchorClub, rank: pos, formSurprise: anchorFormSurprise });
    } else {
      const o = others[otherIdx++];
      ordered.push({ ...o.club, rank: pos, formSurprise: o.formSurprise });
    }
  }
  return ordered;
}

export interface PromotionRelegationResult {
  promoted: ClubState[]; // von Liga 2 in Liga 1
  relegated: ClubState[]; // von Liga 1 in Liga 2
  tier1Order: (ClubState & { rank: number })[];
  tier2Order: (ClubState & { rank: number })[];
  /** Nur gesetzt, wenn `league.hasRelegationPlayoff` gilt UND der letzte Swap-Platz
   * über ein echtes Relegationsspiel statt direktem Auf-/Abstieg entschieden wurde
   * (siehe `simulateLeaguePromotionRelegation`). `tier2ClubWon` sagt, ob der Liga-2-
   * Verein das Duell für sich entschied (→ Aufstieg/Abstieg findet statt) oder der
   * Liga-1-Verein die Klasse hielt. */
  playoff?: { tier1Club: ClubState; tier2Club: ClubState; tier2ClubWon: boolean };
}

/**
 * Gewinnwahrscheinlichkeit des ERSTEN Vereins in einem Relegationsspiel (Liga-1- vs.
 * Liga-2-Verein, Hin-/Rückspiel-Prinzip), auf Basis desselben ELO-artigen
 * Vereinskoeffizienten wie Europapokal/Nationalpokal (`clubCoefficient`). Bewusst mit
 * demselben geglätteten Nenner (600 statt der üblichen 400) wie beim Nationalpokal
 * (`underdogFriendlyExpectedScore` in nationalCup.ts) - ein Relegationsspiel ist ein
 * enges Einzelduell unter Höchstdruck, kein Saison-Durchschnitt. Der Liga-2-
 * Außenseiter bekommt damit eine reale, aber weiterhin klar unterlegene Chance -
 * genau das reale Bild echter Relegationsspiele (der Erstligist verliert, aber
 * längst nicht immer).
 */
function relegationPlayoffExpectedScore(clubA: ClubState, clubB: ClubState, countryId: CountryId): number {
  const coeffA = clubCoefficient(clubA, countryId);
  const coeffB = clubCoefficient(clubB, countryId);
  return 1 / (1 + Math.pow(10, (coeffB - coeffA) / 600));
}

/**
 * Vereinsstärke entwickelt sich jetzt tatsächlich mit dem Saisonergebnis weiter -
 * bisher war `ClubState.strength` für die gesamte Karriere komplett statisch, Auf-/
 * Abstieg verschob einen Verein nur zwischen den festen Stärke-Bändern der beiden
 * Liga-Ebenen, ohne dass eigene Ergebnisse je etwas veränderten (Bugreport:
 * "Progression über die Jahre" fehlte komplett). Bewusst NUR für die aktive Liga des
 * Spielers (hier aufgerufen) statt für alle 10 Länder jede Saison - die übrigen Länder
 * werden ohnehin nie wirklich simuliert (nur `foreignLeagues`-Cache bei Angeboten bzw.
 * der leichte länderweite `europeanLeagueDrift`, siehe europeanCup.ts), ein
 * Tabellen-Rechnen dort wäre reiner Overhead für Ligen, die der Spieler nie betritt.
 * Kostet hier praktisch nichts extra: `tier1Order`/`tier2Order` (inkl. `formSurprise`,
 * siehe `simulateTable`) sind für Auf-/Abstieg ohnehin schon berechnet.
 *
 * Nutzt bewusst `formSurprise` (das rohe Zufalls-/Formrauschen dieser Saison, `score -
 * strength`) statt eines Rang-Vergleichs (Ø Stärke-implizierter Rang vs. tatsächlicher
 * Rang): bei eng beieinanderliegenden Vereinen (typische Stärke-Abstände von 1-2
 * Punkten) UND deutlich größerem Zufallsrauschen (±15) verzerrt ein reiner
 * Rang-Vergleich systematisch - der jeweils stärkste Verein einer Liga kann per
 * Definition nie "besser als Rang 1" abschneiden, nur schlechter (garantierter
 * Abwärts-Drift), der schwächste analog nie schlechter als der letzte Platz
 * (garantierter Aufwärts-Drift) - unabhängig von echter Leistung. Das rohe
 * Rauschsignal selbst ist dagegen für jeden Verein symmetrisch um 0 verteilt, ganz
 * gleich wie stark er ist.
 */
function computeClubResultDrift(order: (ClubState & { rank: number; formSurprise: number })[], rng: () => number): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const c of order) {
    deltas.set(c.id, clamp(c.formSurprise * 0.12, -2.5, 2.5) + (rng() - 0.5) * 0.6);
  }
  return deltas;
}

function applyClubResultDrift(club: ClubState, deltas: Map<string, number>): ClubState {
  const delta = deltas.get(club.id) ?? 0;
  if (delta === 0) return club;
  return { ...club, strength: clamp(Math.round(club.strength + delta), 10, 99) };
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
  rng: () => number,
  /** Vereins-ID + Tabellenplatz (aus `SeasonStats.leaguePosition`) des Spielers -
   * verankert den Spielerverein in SEINER Liga-Ebene an genau der Position, die ihm
   * im Saisonrückblick bereits gezeigt wurde (siehe `simulateTableAnchored`). Ohne
   * Angabe (z.B. für die reine Debug-/Test-Nutzung) läuft die Simulation wie zuvor
   * komplett unabhängig für beide Ebenen. */
  anchor?: { clubId: string; leaguePosition: number }
): PromotionRelegationResult {
  const anchorInTier1 = anchor && league.tier1.some((c) => c.id === anchor.clubId);
  const anchorInTier2 = anchor && league.tier2.some((c) => c.id === anchor.clubId);

  const tier1Order = anchorInTier1
    ? simulateTableAnchored(league.tier1, anchor!.clubId, anchor!.leaguePosition, rng)
    : simulateTable(league.tier1, rng);
  const tier2Order = anchorInTier2
    ? simulateTableAnchored(league.tier2, anchor!.clubId, anchor!.leaguePosition, rng)
    : simulateTable(league.tier2, rng);

  const swapCap = Math.min(league.swapCount, league.tier1.length - 1, league.tier2.length - 1);
  // Länder mit Relegationsspiel (siehe `CountryDef.hasRelegationPlayoff`): von den
  // `swapCap` möglichen Plätzen ist nur `swapCap - 1` direkt sicher, der letzte wird
  // zwischen dem knapp-noch-erstligisten und dem knapp-noch-zweitligisten Verein
  // ausgespielt (siehe `relegationPlayoffExpectedScore`).
  const usePlayoff = league.hasRelegationPlayoff && swapCap >= 1;
  const guaranteedSwaps = usePlayoff ? swapCap - 1 : swapCap;

  let playoff: PromotionRelegationResult["playoff"];
  let n = guaranteedSwaps;

  if (usePlayoff) {
    const tier1PlayoffClub = tier1Order[tier1Order.length - swapCap];
    const tier2PlayoffClub = tier2Order[swapCap - 1];
    if (tier1PlayoffClub && tier2PlayoffClub) {
      const tier1WinProb = clamp(
        relegationPlayoffExpectedScore(tier1PlayoffClub, tier2PlayoffClub, league.countryId),
        0.3,
        0.85
      );
      const tier2ClubWon = rng() >= tier1WinProb;
      const { rank: _r1, ...tier1PlayoffClubClean } = tier1PlayoffClub;
      const { rank: _r2, ...tier2PlayoffClubClean } = tier2PlayoffClub;
      playoff = { tier1Club: tier1PlayoffClubClean, tier2Club: tier2PlayoffClubClean, tier2ClubWon };
      if (tier2ClubWon) n = swapCap;
    }
  }

  // Abstieg NUR aus Liga 1 (die schwächsten n Vereine) ...
  const relegated = n > 0 ? tier1Order.slice(-n).map(({ rank: _rank, ...c }) => c) : [];
  // ... Aufstieg NUR aus Liga 2 (die stärksten n Vereine) - Liga 2 selbst hat
  // keine "Abstiegszone", da es keine dritte Liga gibt.
  const promoted = n > 0 ? tier2Order.slice(0, n).map(({ rank: _rank, ...c }) => c) : [];

  const relegatedIds = new Set(relegated.map((c) => c.id));
  const promotedIds = new Set(promoted.map((c) => c.id));

  // Stärke-Drift aus dem tatsächlichen Saisonergebnis (siehe `computeClubResultDrift`) -
  // für BEIDE Ebenen, unabhängig von Auf-/Abstieg (auch ein Verein, der einfach in
  // seiner Liga bleibt, hat diese Saison besser oder schlechter abgeschnitten als
  // erwartet).
  const tier1Deltas = computeClubResultDrift(tier1Order, rng);
  const tier2Deltas = computeClubResultDrift(tier2Order, rng);

  const newTier1 = [
    ...league.tier1.filter((c) => !relegatedIds.has(c.id)).map((c) => applyClubResultDrift(c, tier1Deltas)),
    ...promoted.map((c) => ({ ...applyClubResultDrift(c, tier2Deltas), tier: 1 as LeagueTier })),
  ];
  const newTier2 = [
    ...league.tier2.filter((c) => !promotedIds.has(c.id)).map((c) => applyClubResultDrift(c, tier2Deltas)),
    ...relegated.map((c) => ({ ...applyClubResultDrift(c, tier1Deltas), tier: 2 as LeagueTier })),
  ];

  league.tier1 = newTier1;
  league.tier2 = newTier2;

  return { promoted, relegated, tier1Order, tier2Order, playoff };
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
