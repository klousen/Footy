import type {
  Attributes,
  AttributeKey,
  CareerStage,
  EventChoice,
  GameEvent,
  GameState,
  LeagueState,
  LogEntry,
  Player,
  Position,
  SeasonStats,
} from "./types";
import { POSITION_WEIGHTS } from "./types";
import { clamp } from "./data";
import { eligibleTemplates } from "./events";
import type { CountryId } from "./leagues";
import {
  buildLeagueState,
  clubsForTier,
  findClub,
  leagueNameForTier,
  pickClubNearStrength,
  simulateLeaguePromotionRelegation,
} from "./leagueEngine";

const ATTRIBUTE_KEYS: AttributeKey[] = [
  "technik",
  "tempo",
  "physis",
  "mentalitaet",
  "intelligenz",
  "charisma",
];

export function rng(): number {
  return Math.random();
}

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Spieler erstellen
// ---------------------------------------------------------------------------

export function createPlayer(
  name: string,
  position: Position,
  focusAttr: AttributeKey,
  countryId: CountryId
): { player: Player; league: LeagueState } {
  const base: Attributes = {
    technik: randInt(18, 30),
    tempo: randInt(18, 30),
    physis: randInt(18, 30),
    mentalitaet: randInt(18, 30),
    intelligenz: randInt(18, 30),
    charisma: randInt(15, 28),
  };
  base[focusAttr] += 8;

  const potential: Attributes = {
    technik: randInt(55, 95),
    tempo: randInt(55, 95),
    physis: randInt(55, 95),
    mentalitaet: randInt(55, 95),
    intelligenz: randInt(50, 90),
    charisma: randInt(45, 90),
  };
  potential[focusAttr] = clamp(potential[focusAttr] + 8, 0, 99);

  const league = buildLeagueState(countryId, rng);

  // Jugendakademie: bevorzugt ein eher schwächerer Verein aus Liga 2 (typisch für ein
  // 14-jähriges, noch unbekanntes Talent).
  const youthClub = pickWeightedWeakerClub(league.tier2, rng);

  const club = {
    clubId: youthClub.id,
    name: youthClub.city,
    country: league.countryName,
    tier: youthClub.tier,
    strength: youthClub.strength,
  };

  return {
    league,
    player: {
      name,
      country: countryId,
      position,
      birthAge: 14,
      age: 14,
      attributes: base,
      potential,
      morale: 70,
      fitness: 90,
      reputation: 2,
      wealth: 200,
      education: 50,
      clubRelation: 60,
      club,
      contract: {
        club: club.name,
        yearsLeft: 3,
        wagePerYear: 0,
        squadRole: "Ausbildungsspieler",
      },
      injury: null,
      stage: "jugend",
      careerTotals: { matches: 0, goals: 0, assists: 0, trophies: [], yellowCards: 0, redCards: 0, caps: 0 },
      nationalTeamCaps: 0,
      seasonHistory: [],
      log: [
        {
          season: 0,
          age: 14,
          text: `${name} beginnt die Karriere in der Jugendakademie von ${club.name} (${league.countryName}).`,
          kind: "milestone",
        },
      ],
      retired: false,
      wantsTransfer: false,
    },
  };
}

function pickWeightedWeakerClub<T extends { strength: number }>(clubs: T[], rand: () => number): T {
  const sorted = [...clubs].sort((a, b) => a.strength - b.strength);
  const idx = Math.floor(rand() * rand() * sorted.length);
  return sorted[clamp(idx, 0, sorted.length - 1)];
}

export function overallRating(p: Player): number {
  const weights = POSITION_WEIGHTS[p.position];
  let sum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    sum += p.attributes[key] * weights[key];
  }
  return Math.round(sum);
}

function stageForAge(age: number): CareerStage {
  if (age <= 17) return "jugend";
  if (age <= 22) return "durchbruch";
  if (age <= 29) return "etabliert";
  if (age <= 34) return "veteran";
  return "spaetphase";
}

// ---------------------------------------------------------------------------
// Saison-Events zusammenstellen
// ---------------------------------------------------------------------------

export function buildSeasonEvents(player: Player, usedTemplateIds: Set<string>, count = 5): GameEvent[] {
  const pool = eligibleTemplates(player, usedTemplateIds);
  const chosen: GameEvent[] = [];
  const usedCategoriesThisSeason = new Map<string, number>();
  const localPool = [...pool];

  for (let i = 0; i < count && localPool.length > 0; i++) {
    // Gewichtung: Kategorie-Wiederholungen innerhalb der Saison abschwächen
    const weights = localPool.map((t) => {
      const usedCount = usedCategoriesThisSeason.get(t.category) ?? 0;
      return t.weight / (1 + usedCount * 1.5);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = rng() * totalWeight;
    let idx = 0;
    for (; idx < weights.length; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    idx = Math.min(idx, localPool.length - 1);
    const template = localPool[idx];
    const built = template.build(player, { rng });
    chosen.push({ ...built, id: `${template.id}-${player.age}-${i}`, templateId: template.id });
    usedCategoriesThisSeason.set(template.category, (usedCategoriesThisSeason.get(template.category) ?? 0) + 1);
    localPool.splice(idx, 1);
  }

  return chosen;
}

// ---------------------------------------------------------------------------
// Effekte einer Entscheidung anwenden
// ---------------------------------------------------------------------------

export function applyChoice(state: GameState, choice: EventChoice): void {
  const player = state.player;
  if (!player) return;

  let effects = choice.effects;
  if (choice.followUpChance) {
    const success = rng() < choice.followUpChance.chance;
    effects = success ? choice.followUpChance.success : choice.followUpChance.failure;
  }

  applyEffects(player, effects, state.seasonNumber);
}

function applyEffects(player: Player, effects: EventChoice["effects"], season: number) {
  if (effects.attributes) {
    for (const key of Object.keys(effects.attributes) as AttributeKey[]) {
      const delta = effects.attributes[key] ?? 0;
      player.attributes[key] = clamp(player.attributes[key] + delta, 1, 99);
    }
  }
  if (effects.morale) player.morale = clamp(player.morale + effects.morale, 0, 100);
  if (effects.fitness) player.fitness = clamp(player.fitness + effects.fitness, 0, 100);
  if (effects.reputation) player.reputation = clamp(player.reputation + effects.reputation, 0, 100);
  if (effects.wealth) player.wealth = Math.max(0, player.wealth + effects.wealth);
  if (effects.educationPoints) player.education = clamp(player.education + effects.educationPoints, 0, 100);
  if (effects.clubRelation) player.clubRelation = clamp(player.clubRelation + effects.clubRelation, 0, 100);
  if (effects.injuryWeeksOut) {
    if (effects.injuryWeeksOut > 0) {
      player.injury = { label: effects.injuryLabel ?? "Verletzung", weeksOut: (player.injury?.weeksOut ?? 0) + effects.injuryWeeksOut };
    } else if (player.injury) {
      const remaining = player.injury.weeksOut + effects.injuryWeeksOut;
      player.injury = remaining <= 0 ? null : { ...player.injury, weeksOut: remaining };
    }
  }
  if (effects.logText) {
    player.log.push({
      season,
      age: player.age,
      text: `${player.name} ${effects.logText}`,
      kind: effects.logKind ?? "info",
    });
  }
}

// ---------------------------------------------------------------------------
// Saisonsimulation (Spiele im Hintergrund)
// ---------------------------------------------------------------------------

const TROPHY_POOL_BY_TIER: Record<number, string[]> = {
  1: ["Meisterschale", "Landespokal", "Kontinental-Pokal"],
  2: ["Zweitliga-Meisterschaft", "Aufstiegs-Play-off"],
};

export function simulateSeason(player: Player, seasonNumber: number, league: LeagueState): SeasonStats {
  const overall = overallRating(player);
  const clubStrength = player.club.strength;
  const injuredWeeks = player.injury?.weeksOut ?? 0;
  const availabilityFactor = clamp(1 - injuredWeeks / 38, 0.15, 1);

  const isYouth = player.stage === "jugend";
  const baseMatches = isYouth ? 22 : player.club.tier === 1 ? 34 : 30;
  const roleFactor =
    player.contract.squadRole === "Stammspieler"
      ? 1
      : player.contract.squadRole === "Rotation"
      ? 0.7
      : player.contract.squadRole === "Ergänzungsspieler"
      ? 0.4
      : 0.5;

  const matches = Math.round(baseMatches * roleFactor * availabilityFactor);

  const form = (player.morale - 50) / 100; // -0.5 .. 0.5
  const ratingBase = 6.0 + (overall - clubStrength) / 45 + form * 0.6;
  const avgRating = clamp(ratingBase + (rng() - 0.5) * 0.6, 3.5, 9.5);

  const attackWeight = { TW: 0.02, IV: 0.15, AV: 0.35, ZM: 0.55, FS: 0.85, ST: 1.0 }[player.position];
  const goalChancePerMatch = (overall / 100) * attackWeight * 0.45;
  const assistChancePerMatch = (overall / 100) * attackWeight * 0.35;
  const goals = Math.max(0, Math.round(matches * goalChancePerMatch * (0.7 + rng() * 0.6)));
  const assists = Math.max(0, Math.round(matches * assistChancePerMatch * (0.7 + rng() * 0.6)));

  const yellowCards = Math.round(matches * 0.12 * (0.5 + rng()));
  const redCards = rng() < 0.05 * (matches / 30) ? 1 : 0;

  // Tabellenplatz: Vereinsstärke + etwas Zufall, moduliert leicht durch eigene Form
  const strengthNoise = (rng() - 0.5) * 20;
  const effectiveStrength = clubStrength + strengthNoise + (avgRating - 6.5) * 2;
  const leaguePosition = clamp(Math.round(18 - (effectiveStrength / 100) * 17), 1, 18);

  const trophies: string[] = [];
  if (leaguePosition === 1 && rng() < 0.8) {
    const pool = TROPHY_POOL_BY_TIER[player.club.tier];
    trophies.push(pool[0]);
  }
  if (rng() < 0.08 + clubStrength / 800) {
    const pool = TROPHY_POOL_BY_TIER[player.club.tier];
    const extra = pool[randInt(1, pool.length - 1)];
    if (extra && !trophies.includes(extra)) trophies.push(extra);
  }

  player.careerTotals.matches += matches;
  player.careerTotals.goals += goals;
  player.careerTotals.assists += assists;
  player.careerTotals.yellowCards += yellowCards;
  player.careerTotals.redCards += redCards;
  player.careerTotals.trophies.push(...trophies);

  const stats: SeasonStats = {
    seasonLabel: `Saison ${2026 + seasonNumber}/${(2026 + seasonNumber + 1).toString().slice(-2)}`,
    age: player.age,
    club: player.club.name,
    leagueTier: player.club.tier,
    leagueName: leagueNameForTier(league, player.club.tier),
    matches,
    goals,
    assists,
    avgRating: Math.round(avgRating * 10) / 10,
    leaguePosition,
    trophies,
    yellowCards,
    redCards,
    promoted: false,
    relegated: false,
  };

  player.seasonHistory.push(stats);

  // Reputation wächst mit guten Leistungen
  const repGain = clamp(Math.round((avgRating - 6) * 3 + goals * 0.4 + assists * 0.2), -6, 12);
  player.reputation = clamp(player.reputation + repGain, 0, 100);

  // Verein-Beziehung leicht Richtung Mitte tendieren lassen
  if (avgRating >= 7) player.clubRelation = clamp(player.clubRelation + 3, 0, 100);
  if (avgRating < 5.5) player.clubRelation = clamp(player.clubRelation - 4, 0, 100);

  return stats;
}

// ---------------------------------------------------------------------------
// Alterung / Attribut-Wachstum
// ---------------------------------------------------------------------------

function growthFactor(age: number): number {
  if (age <= 17) return 1.5;
  if (age <= 21) return 1.1;
  if (age <= 24) return 0.7;
  if (age <= 29) return 0.25;
  if (age <= 32) return -0.35;
  if (age <= 35) return -0.9;
  return -1.6;
}

export function ageUpPlayer(player: Player): void {
  const factor = growthFactor(player.age);
  for (const key of ATTRIBUTE_KEYS) {
    const current = player.attributes[key];
    const potential = player.potential[key];
    let delta: number;
    if (factor > 0) {
      const room = potential - current;
      delta = Math.round(factor * (0.5 + rng() * 0.6) * clamp(room / 12, 0.15, 1.6));
      delta = Math.max(0, delta);
    } else {
      delta = Math.round(factor * (0.5 + rng() * 0.6));
    }
    player.attributes[key] = clamp(current + delta, 1, 99);
  }

  player.age += 1;
  player.stage = stageForAge(player.age);
  player.fitness = clamp(player.fitness + 12, 40, 100); // Sommerpause / Erholung
  player.morale = clamp(player.morale + (player.morale < 50 ? 5 : 0), 0, 100);

  if (player.injury) {
    const remaining = player.injury.weeksOut - 16; // Sommerpause heilt viel
    player.injury = remaining <= 0 ? null : { ...player.injury, weeksOut: remaining };
  }

  player.contract.yearsLeft = Math.max(0, player.contract.yearsLeft - 1);

  // Wachstum bei Jugendspielern erhöht Bildung leicht Richtung Ausbildungsabschluss
  if (player.stage === "jugend") {
    player.education = clamp(player.education + 2, 0, 100);
  }
}

// ---------------------------------------------------------------------------
// Vertrag / Karriereübergänge zwischen den Saisons
// ---------------------------------------------------------------------------

/** Zielstärke, die ein Spieler mit gegebener Bekanntheit für einen neuen Verein "verdient". */
function targetStrengthForReputation(reputation: number): number {
  return clamp(35 + reputation * 0.6, 30, 95);
}

function squadRoleForOverall(overall: number, clubStrength: number): Player["contract"]["squadRole"] {
  const diff = overall - clubStrength;
  if (diff >= 5) return "Stammspieler";
  if (diff >= -5) return "Rotation";
  if (diff >= -15) return "Ergänzungsspieler";
  return "Ersatzbank";
}

/**
 * Vertrags-/Transferlogik zwischen den Saisons. Verein wird immer aus der echten
 * Liga-Pyramide (`league.tier1` / `league.tier2`) des gewählten Landes gewählt.
 */
export function resolveClubSituation(player: Player, league: LeagueState): LogEntry | null {
  const overall = overallRating(player);
  let entry: LogEntry | null = null;

  if (player.age === 18 && player.contract.squadRole === "Ausbildungsspieler") {
    // Übergang Jugend -> Profi
    const targetStrength = targetStrengthForReputation(player.reputation);
    const proTier: 1 | 2 = targetStrength > 68 && rng() < 0.35 ? 1 : 2;
    const pool = clubsForTier(league, proTier);
    const staysAtAcademy = rng() < 0.4 && findClub(league, player.club.clubId);
    const chosen = staysAtAcademy
      ? (findClub(league, player.club.clubId) ?? pickClubNearStrength(pool, targetStrength, null, rng))
      : pickClubNearStrength(pool, targetStrength, player.club.clubId, rng);

    const isNewClub = chosen.id !== player.club.clubId;
    player.club = { clubId: chosen.id, name: chosen.city, country: league.countryName, tier: chosen.tier, strength: chosen.strength };
    entry = {
      season: 0,
      age: player.age,
      text: isNewClub
        ? `${player.name} unterschreibt den ersten Profivertrag bei ${chosen.city}.`
        : `${player.name} erhält einen Profivertrag im eigenen Verein ${chosen.city}.`,
      kind: "milestone",
    };
    player.contract = {
      club: chosen.city,
      yearsLeft: 2,
      wagePerYear: 20000 + player.reputation * 800,
      squadRole: squadRoleForOverall(overall, chosen.strength),
    };
    player.clubRelation = 60;
    player.wantsTransfer = false;
    return entry;
  }

  const currentClub = findClub(league, player.club.clubId);
  const currentTier = currentClub?.tier ?? player.club.tier;
  const currentStrength = currentClub?.strength ?? player.club.strength;

  const shouldForceMove = player.clubRelation < 15 && player.stage !== "jugend";
  const targetStrength = targetStrengthForReputation(player.reputation);
  const shouldUpgrade =
    player.wantsTransfer || (targetStrength > currentStrength + 12 && player.reputation > 30 && rng() < 0.4);

  if (shouldForceMove || shouldUpgrade) {
    const wantsTier1 = targetStrength > 60;
    const pool = clubsForTier(league, wantsTier1 ? 1 : 2);
    const chosen = pickClubNearStrength(
      pool,
      shouldForceMove ? Math.max(currentStrength - 15, 20) : targetStrength,
      player.club.clubId,
      rng
    );
    const oldClubName = player.club.name;
    player.club = { clubId: chosen.id, name: chosen.city, country: league.countryName, tier: chosen.tier, strength: chosen.strength };
    player.contract = {
      club: chosen.city,
      yearsLeft: 3,
      wagePerYear: Math.round((15000 + player.reputation * 1500) * (1 + (chosen.tier === 1 ? 0.5 : 0))),
      squadRole: squadRoleForOverall(overall, chosen.strength),
    };
    player.clubRelation = 55;
    player.wantsTransfer = false;
    entry = {
      season: 0,
      age: player.age,
      text: shouldForceMove
        ? `${player.name} wird von ${oldClubName} abgegeben und wechselt zu ${chosen.city}.`
        : `${player.name} wechselt von ${oldClubName} zu ${chosen.city}.`,
      kind: shouldForceMove ? "negative" : "positive",
    };
  } else {
    // Verein/Stärke aus der Liga-Pyramide übernehmen (kann sich durch Auf-/Abstieg geändert haben)
    player.club = {
      clubId: currentClub?.id ?? player.club.clubId,
      name: currentClub?.city ?? player.club.name,
      country: league.countryName,
      tier: currentTier,
      strength: currentStrength,
    };
    player.contract.club = player.club.name;
    player.contract.squadRole = squadRoleForOverall(overall, player.club.strength);
    if (player.contract.yearsLeft <= 0) {
      // Automatische Kurzverlängerung, falls kein aktives Event gegriffen hat
      player.contract.yearsLeft = 1;
      player.contract.wagePerYear = Math.round(player.contract.wagePerYear * 1.05);
    }
  }

  return entry;
}

/**
 * Simuliert die komplette Liga-Saison (alle Vereine) und wendet Auf-/Abstieg an.
 * Aktualisiert `player.club`, falls der eigene Verein betroffen ist, und markiert
 * die zuletzt gespeicherten Saisonstatistiken entsprechend.
 */
export function applyLeaguePromotionRelegation(player: Player, league: LeagueState): LogEntry | null {
  const result = simulateLeaguePromotionRelegation(league, rng);
  const lastStats = player.seasonHistory[player.seasonHistory.length - 1];

  const wasRelegated = result.relegated.some((c) => c.id === player.club.clubId);
  const wasPromoted = result.promoted.some((c) => c.id === player.club.clubId);

  if (!wasRelegated && !wasPromoted) return null;

  player.club.tier = wasRelegated ? 2 : 1;
  if (lastStats) {
    lastStats.relegated = wasRelegated;
    lastStats.promoted = wasPromoted;
  }

  const leagueName = leagueNameForTier(league, player.club.tier);
  return {
    season: 0,
    age: player.age,
    text: wasRelegated
      ? `${player.club.name} steigt ab und spielt künftig in der ${leagueName}.`
      : `${player.club.name} steigt auf und spielt künftig in der ${leagueName}.`,
    kind: wasRelegated ? "negative" : "positive",
  };
}

// ---------------------------------------------------------------------------
// Karriereende
// ---------------------------------------------------------------------------

export function shouldOfferRetirement(player: Player): boolean {
  if (player.age >= 39) return true;
  if (player.age < 32) return false;
  const overall = overallRating(player);
  const peakOverall = Math.round(
    ATTRIBUTE_KEYS.reduce((s, k) => s + player.potential[k] * POSITION_WEIGHTS[player.position][k], 0)
  );
  return overall < peakOverall * 0.72 || player.fitness < 55;
}

export function computeLegacy(player: Player): { score: number; tier: string } {
  const t = player.careerTotals;
  const avgRatingOverall =
    player.seasonHistory.length > 0
      ? player.seasonHistory.reduce((s, x) => s + x.avgRating, 0) / player.seasonHistory.length
      : 6;
  const score = Math.round(
    t.goals * 4 +
      t.assists * 2.5 +
      t.trophies.length * 40 +
      player.nationalTeamCaps * 6 +
      avgRatingOverall * 25 +
      player.reputation * 2
  );

  let tier = "Vereinsspieler";
  if (score >= 1600) tier = "Weltklasse-Legende";
  else if (score >= 1000) tier = "Nationale Ikone";
  else if (score >= 600) tier = "Publikumsliebling";
  else if (score >= 300) tier = "Solider Profi";

  return { score, tier };
}

export function buildEpilogue(player: Player, tier: string): string {
  const path = player.postCareerPath ?? "Ruhestand";
  const trophyText =
    player.careerTotals.trophies.length > 0
      ? `${player.careerTotals.trophies.length} Titel(n) in der Vitrine`
      : "keinem Titel, aber vielen unvergesslichen Momenten";
  return `Nach ${player.age - player.birthAge} Jahren im Profifußball beendet ${player.name} die aktive Karriere mit ${player.careerTotals.goals} Toren, ${player.careerTotals.assists} Vorlagen und ${trophyText}. Die Karriere wird als "${tier}" in die Vereinsgeschichte eingehen. Danach führt der Weg von ${player.name} in Richtung: ${path}.`;
}

export function buildRetirementEvent(player: Player): GameEvent {
  const forced = player.age >= 39;
  return {
    id: `retirement-${player.age}`,
    templateId: "retirement_decision",
    category: "meilenstein",
    title: forced ? "Das Karriereende naht" : "Gedanken ans Karriereende",
    description: forced
      ? `Mit ${player.age} Jahren lässt die Leistungsfähigkeit spürbar nach. Die meisten Vereine winken ab - Zeit, über das Karriereende nachzudenken.`
      : `Die letzten Saisons waren kräftezehrend, die Werte gehen zurück. Denkst du über ein Karriereende nach, oder willst du weitermachen, solange es geht?`,
    choices: forced
      ? [
          {
            id: "beenden",
            label: "Karriere beenden",
            effects: { logText: "beendet die aktive Profikarriere.", logKind: "milestone" },
          },
        ]
      : [
          {
            id: "weiter",
            label: "Weitermachen, solange es geht",
            effects: { morale: 3, logText: "entscheidet sich, die Karriere fortzusetzen.", logKind: "info" },
          },
          {
            id: "beenden",
            label: "Karriere beenden",
            effects: { logText: "beendet die aktive Profikarriere.", logKind: "milestone" },
          },
        ],
  };
}

export function pickPostCareerPath(player: Player): string {
  const { intelligenz, charisma } = player.attributes;
  if (intelligenz > 65 && intelligenz >= charisma) return "Trainer / Sportdirektor";
  if (charisma > 60) return "TV-Experte & Medien";
  if (player.education > 65) return "Jugendtrainer & Ausbildung";
  return "Ruhestand & Familie";
}
