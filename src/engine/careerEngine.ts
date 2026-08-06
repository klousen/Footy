import type {
  Achievement,
  Attributes,
  AttributeKey,
  CareerStage,
  ChoiceFeedback,
  ClubState,
  ClubTenure,
  EventChoice,
  GameEvent,
  GameState,
  LeagueState,
  LogEntry,
  Player,
  Position,
  ScoreFactor,
  SeasonStats,
  SquadRole,
  TraitKey,
} from "./types";
import { POSITION_WEIGHTS } from "./types";
import { clamp } from "./data";
import { ATTRIBUTE_LABEL, ATTRIBUTE_ORDER, formatMoney, RELATIONSHIP_LABEL, SQUAD_ROLE_RANK, TRAIT_LABEL, TRAIT_ORDER } from "./labels";
import { eligibleTemplates, getTemplateById, EVENT_TEMPLATES } from "./events";
import { COUNTRIES, type CountryId } from "./leagues";
import {
  buildLeagueState,
  findClub,
  leagueNameForTier,
  pickClubNearStrength,
  pickDistinctClubOffers,
  pickSpreadClubOffers,
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

/** Kleiner, ans Potenzial gekoppelter Bonus (0-5 Punkte) für die Start-Attribute
 * eines 14-Jährigen (siehe `createPlayer`) - ein späteres Wunderkind zeigt im
 * Schnitt schon etwas bessere Ansätze als ein Standard-Talent, aber bewusst nur
 * einen Hauch, damit die Klasse nicht schon am Anfang feststeht. */
function talentHint(potential: number): number {
  return clamp(Math.round((potential - 60) / 8), 0, 5);
}

// ---------------------------------------------------------------------------
// Spieler erstellen
// ---------------------------------------------------------------------------

export function createPlayer(
  name: string,
  position: Position,
  focusAttr: AttributeKey,
  countryId: CountryId
): { player: Player; league: LeagueState; offers: ClubState[] } {
  // Potenzial zuerst würfeln (inkl. seltenem Wunderkind-Bonus), damit die
  // Start-Attribute unten leicht daran gekoppelt werden können - ein späteres
  // Jahrhunderttalent zeigt mit 14 realistisch schon EIN PAAR frühe Anzeichen,
  // ohne dass es die ganze Karriere vorwegnimmt (siehe `talentHint` unten).
  const potential: Attributes = {
    technik: randInt(60, 97),
    tempo: randInt(60, 97),
    physis: randInt(60, 97),
    mentalitaet: randInt(60, 97),
    intelligenz: randInt(55, 92),
    charisma: randInt(50, 92),
  };
  potential[focusAttr] = clamp(potential[focusAttr] + 8, 0, 99);

  // Seltener "Wunderkind"-Bonus: ein echtes Jahrhunderttalent, das eine
  // realistische Chance auf eine absolute Top-Karriere mitbringt - macht "das
  // Zeug zum Weltklasse-Spieler" spürbar wahrscheinlicher als bisher.
  if (rng() < 0.08) {
    for (const key of ATTRIBUTE_KEYS) {
      potential[key] = clamp(potential[key] + randInt(6, 12), 0, 99);
    }
  }

  // Start-Attribute: jeder Jungspieler würfelt unabhängig für jeden Wert (echte
  // Varianz von Spieler zu Spieler), plus ein bewusst kleiner, ans Potenzial
  // gekoppelter Talent-Hinweis (0-6 Punkte) - ein künftiges Wunderkind zeigt
  // also im Schnitt schon leicht bessere Ansätze als ein Standard-Talent, aber
  // nie so deutlich, dass die spätere Klasse mit 14 schon feststeht.
  const base: Attributes = {
    technik: randInt(16, 26) + talentHint(potential.technik),
    tempo: randInt(16, 26) + talentHint(potential.tempo),
    physis: randInt(16, 26) + talentHint(potential.physis),
    mentalitaet: randInt(16, 26) + talentHint(potential.mentalitaet),
    intelligenz: randInt(16, 26) + talentHint(potential.intelligenz),
    charisma: randInt(13, 24) + talentHint(potential.charisma),
  };
  base[focusAttr] += 8;

  const league = buildLeagueState(countryId, rng);

  // Drei Vereine aus Liga 2 bieten dem 14-jährigen Talent einen Akademieplatz an -
  // bewusst über die Stärkespanne verteilt (schwach/mittel/stark), damit es eine
  // echte Wahl ist.
  const offers = pickSpreadClubOffers(league.tier2, rng, 3);
  const placeholder = offers[0];

  const club = {
    clubId: placeholder.id,
    name: placeholder.city,
    country: league.countryName,
    tier: placeholder.tier,
    strength: placeholder.strength,
  };

  return {
    league,
    offers,
    player: {
      name,
      country: countryId,
      position,
      birthAge: 14,
      age: 14,
      attributes: base,
      potential,
      growthCarry: {},
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
      nationalTeamGoals: 0,
      capsAtSeasonStart: 0,
      seasonHistory: [],
      log: [],
      retired: false,
      wantsTransfer: false,
      seasonsSinceTransferEvent: 0,
      consecutiveBenchSeasons: 0,
      roleProtectionSeasons: 0,
      startingRoleGuaranteeSeasons: 0,
      nationalTeamCaptain: false,
      clubChangesCount: 0,
      totalInjuryWeeks: 0,
      relationshipStatus: "single",
      partnerName: null,
      children: 0,
      traits: { arbeitsmoral: 50, disziplin: 50, medienimage: 50, fuehrung: 50 },
      activeStorylines: [],
      completedStorylines: [],
      trainingBoostSeasons: 0,
      unlockedAchievementIds: [],
    },
  };
}

/** Schließt die Auswahl der Jugendakademie ab (Karrierestart-Bildschirm). */
export function finalizeYouthClub(player: Player, league: LeagueState, clubId: string): void {
  const chosen = findClub(league, clubId) ?? league.tier2[0];
  player.club = {
    clubId: chosen.id,
    name: chosen.city,
    country: league.countryName,
    tier: chosen.tier,
    strength: chosen.strength,
  };
  player.contract = { club: chosen.city, yearsLeft: 3, wagePerYear: 0, squadRole: "Ausbildungsspieler" };
  player.clubRelation = 60;
  player.log = [
    {
      season: 0,
      age: player.age,
      text: `${player.name} beginnt die Karriere in der Jugendakademie von ${chosen.city} (${league.countryName}).`,
      kind: "milestone",
    },
  ];
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

/** Wie viele Saisons ein Template nach dem harten Sperrfenster noch "nachklingt" (reduziertes Gewicht). */
const TEMPLATE_COOLDOWN_SEASONS = 5;
/** Hartes Sperrfenster: ein Template kann frühestens nach so vielen Saisons erneut gezogen werden. */
const TEMPLATE_HARD_MIN_GAP = 3;

/**
 * Wählt aus, WELCHE Templates diese Saison an die Reihe kommen - baut aber
 * bewusst noch KEINE GameEvents (keine Beschreibungstexte). Das passiert erst
 * unmittelbar vor der Anzeige (`buildEventFromId`), damit z.B. der Vereinsname
 * im Text immer den zum Anzeigezeitpunkt aktuellen Verein zeigt, auch wenn
 * innerhalb derselben Saison zwischendurch ein Wechsel stattfand.
 *
 * `recentTemplateSeasons` wird mutiert: kürzlich gezogene Templates sind für
 * `TEMPLATE_HARD_MIN_GAP` Saisons komplett gesperrt und danach bis
 * `TEMPLATE_COOLDOWN_SEASONS` noch deutlich unwahrscheinlicher, damit sich
 * Ereignisse spürbar seltener wiederholen. Ist der dadurch gefilterte Pool zu
 * klein für die Ziel-Anzahl, greift eine Notfall-Rückfalllogik, damit eine
 * Saison nie leerläuft.
 */
export function pickSeasonTemplateIds(
  player: Player,
  usedTemplateIds: Set<string>,
  recentTemplateSeasons: Record<string, number>,
  seasonNumber: number,
  count?: number
): string[] {
  // Ohne explizite Vorgabe schwankt die Anzahl Ereignisse pro Saison (3-5) - bewusst
  // knapper gehalten, damit jede einzelne Entscheidung mehr Gewicht hat, statt in
  // vielen kleinen Nebensächlichkeiten unterzugehen.
  const targetCount = count ?? 3 + Math.floor(rng() * 3);
  const fullPool = eligibleTemplates(player, usedTemplateIds);
  const chosen: string[] = [];
  const usedCategoriesThisSeason = new Map<string, number>();

  // Hartes Sperrfenster: kürzlich gezogene Templates komplett ausschließen, außer
  // der Pool würde dadurch zu klein für die gewünschte Anzahl Events.
  const cooledDown = fullPool.filter((t) => {
    const lastSeason = recentTemplateSeasons[t.id];
    return lastSeason === undefined || seasonNumber - lastSeason >= TEMPLATE_HARD_MIN_GAP;
  });
  const pool = cooledDown.length >= targetCount ? cooledDown : fullPool;
  const localPool = [...pool];

  // Auch über Saisongrenzen hinweg soll sich eine ganze Kategorie (z.B. "training")
  // nicht jede einzelne Saison wiederholen, selbst wenn es jeweils ein anderes
  // Template derselben Kategorie ist - das fühlt sich sonst trotzdem repetitiv an.
  // Ermittelt sich rein aus den vorhandenen Zugdaten, ohne zusätzlichen State: die
  // zuletzt gezogene Saison je Kategorie ist das Maximum über alle Templates
  // dieser Kategorie in `recentTemplateSeasons`.
  const lastCategorySeason = new Map<string, number>();
  for (const t of EVENT_TEMPLATES) {
    const last = recentTemplateSeasons[t.id];
    if (last === undefined) continue;
    const prev = lastCategorySeason.get(t.category);
    if (prev === undefined || last > prev) lastCategorySeason.set(t.category, last);
  }

  // Während einer laufenden Verletzung sollen Reha-Ereignisse den Ereignis-Pool
  // spürbar dominieren, statt nur gleichberechtigt neben Medien/Lifestyle/etc.
  // zu stehen - die Ausfallzeit dreht sich in erster Linie um die Genesung.
  const injured = !!player.injury && player.injury.weeksOut > 0;

  for (let i = 0; i < targetCount && localPool.length > 0; i++) {
    const weights = localPool.map((t) => {
      // Kategorie-Wiederholungen innerhalb derselben Saison abschwächen
      const usedCount = usedCategoriesThisSeason.get(t.category) ?? 0;
      const categoryFactor = 1 / (1 + usedCount * 1.5);
      // Auch nach dem harten Sperrfenster klingt die Wahrscheinlichkeit noch nach
      const lastSeason = recentTemplateSeasons[t.id];
      const recencyFactor =
        lastSeason === undefined ? 1 : clamp((seasonNumber - lastSeason) / TEMPLATE_COOLDOWN_SEASONS, 0.05, 1);
      // Milde Dämpfung, wenn dieselbe Kategorie erst kürzlich (auch mit einem
      // anderen Template) an der Reihe war - klingt über 2 Saisons ab.
      const catLastSeason = lastCategorySeason.get(t.category);
      const categoryRecencyFactor =
        catLastSeason === undefined ? 1 : clamp((seasonNumber - catLastSeason) / 2, 0.4, 1);
      const injuryFocusFactor = injured && t.category === "verletzung" ? 4 : 1;
      return t.weight * categoryFactor * recencyFactor * categoryRecencyFactor * injuryFocusFactor;
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
    chosen.push(template.id);
    usedCategoriesThisSeason.set(template.category, (usedCategoriesThisSeason.get(template.category) ?? 0) + 1);
    recentTemplateSeasons[template.id] = seasonNumber;
    localPool.splice(idx, 1);
  }

  return chosen;
}

/**
 * Fällige Fortsetzungs-Stufen laufender Storylines für diese Saison - werden
 * (wie Vereinsangebote) garantiert in die Event-Queue einsortiert, nie über
 * die normale Zufallsauswahl gezogen (siehe `EventTemplate.storylineOnly`).
 */
export function dueStorylineTemplateIds(player: Player, seasonNumber: number): string[] {
  return player.activeStorylines.filter((t) => t.dueSeason <= seasonNumber).map((t) => t.nextTemplateId);
}

/**
 * Baut den tatsächlichen GameEvent (inkl. Beschreibungstext) erst unmittelbar
 * vor der Anzeige - mit dem dann aktuellen Spielerstand. Erkennt auch dynamisch
 * erzeugte `club_offer:*`-IDs (siehe `decideClubOfferInjection`).
 */
export function buildEventFromId(
  id: string,
  player: Player,
  league: LeagueState,
  foreignLeagues: Partial<Record<CountryId, LeagueState>>
): GameEvent {
  if (isClubOfferEvent(id)) {
    const reason = id.slice(CLUB_OFFER_PREFIX.length) as ClubOfferReason;
    return buildClubOfferEvent(player, league, reason, foreignLeagues);
  }
  const template = getTemplateById(id);
  if (!template) {
    // Sollte praktisch nie vorkommen, aber sicherheitshalber ein neutraler Fallback
    return {
      id: `fallback-${player.age}-${Math.round(rng() * 1e6)}`,
      templateId: id,
      category: "meilenstein",
      title: "Ruhige Woche",
      description: `Bei ${player.club.name} verläuft die Woche ereignislos.`,
      choices: [{ id: "ok", label: "Weiter", effects: {} }],
    };
  }
  // Fortsetzungs-Stufen tragen ihren Kontext (z.B. Namen) im passenden StoryThread.
  const thread = player.activeStorylines.find((t) => t.nextTemplateId === id);
  const built = template.build(player, { rng, storyData: thread?.data });
  return { ...built, id: `${template.id}-${player.age}-${Math.round(rng() * 1e6)}`, templateId: template.id };
}

// ---------------------------------------------------------------------------
// Effekte einer Entscheidung anwenden
// ---------------------------------------------------------------------------

/**
 * Verstärkt die Attribut-Wirkung einer einzelnen Entscheidung spürbar (mind.
 * +1 Punkt zusätzlich in Richtung des Vorzeichens, größere Deltas skalieren
 * weiter mit) - damit sich der direkte Effekt einer Entscheidung auf die
 * Gesamtstärke sofort bemerkbar macht, statt in Mikro-Schritten unterzugehen.
 * Das saisonale Alterswachstum (siehe `ageUpPlayer`) bleibt davon unberührt.
 */
function scaleDecisionAttributeDelta(n: number): number {
  if (n === 0) return 0;
  const magnified = Math.round(Math.abs(n) * 1.4);
  return Math.sign(n) * Math.max(Math.abs(n) + 1, magnified);
}

function scaleAttributeEffects(effects: EventChoice["effects"]): EventChoice["effects"] {
  if (!effects.attributes) return effects;
  const scaledAttrs: Partial<Attributes> = {};
  for (const key of Object.keys(effects.attributes) as AttributeKey[]) {
    scaledAttrs[key] = scaleDecisionAttributeDelta(effects.attributes[key] ?? 0);
  }
  return { ...effects, attributes: scaledAttrs };
}

export function applyChoice(state: GameState, choice: EventChoice): EventChoice["effects"] {
  const player = state.player;
  if (!player) return {};

  let effects = choice.effects;
  if (choice.followUpChance) {
    const success = rng() < choice.followUpChance.chance;
    effects = success ? choice.followUpChance.success : choice.followUpChance.failure;
  }
  effects = scaleAttributeEffects(effects);

  applyEffects(player, effects, state.seasonNumber);
  return effects;
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
  if (effects.wantsTransfer !== undefined) player.wantsTransfer = effects.wantsTransfer;
  if (effects.wageMultiplier) {
    player.contract.wagePerYear = Math.round((player.contract.wagePerYear * effects.wageMultiplier) / 100) * 100;
  }
  if (effects.relationshipStatus) player.relationshipStatus = effects.relationshipStatus;
  if (effects.partnerName !== undefined) player.partnerName = effects.partnerName;
  if (effects.childrenDelta) player.children = Math.max(0, player.children + effects.childrenDelta);
  if (effects.capsDelta) player.nationalTeamCaps = Math.max(0, player.nationalTeamCaps + effects.capsDelta);
  if (effects.goalsDelta) player.nationalTeamGoals = Math.max(0, player.nationalTeamGoals + effects.goalsDelta);
  if (effects.roleProtectionSeasons) {
    player.roleProtectionSeasons = Math.max(player.roleProtectionSeasons, effects.roleProtectionSeasons);
  }
  if (effects.startingRoleGuaranteeSeasons) {
    player.startingRoleGuaranteeSeasons = Math.max(player.startingRoleGuaranteeSeasons, effects.startingRoleGuaranteeSeasons);
  }
  if (effects.nationalTeamCaptain) player.nationalTeamCaptain = true;
  if (effects.squadRoleOverride) player.contract.squadRole = effects.squadRoleOverride;
  if (effects.traitDeltas) {
    for (const key of Object.keys(effects.traitDeltas) as TraitKey[]) {
      const delta = effects.traitDeltas[key] ?? 0;
      player.traits[key] = clamp(player.traits[key] + delta, 0, 100);
    }
  }
  if (effects.storyline) {
    const { storylineId, label, stage, totalStages, nextTemplateId, delaySeasons, data } = effects.storyline;
    player.activeStorylines = player.activeStorylines.filter((t) => t.storylineId !== storylineId);
    if (nextTemplateId) {
      player.activeStorylines.push({
        storylineId,
        label,
        stage,
        totalStages,
        nextTemplateId,
        dueSeason: season + (delaySeasons ?? 1),
        data,
      });
    } else if (!player.completedStorylines.includes(storylineId)) {
      player.completedStorylines.push(storylineId);
    }
  }
  if (effects.injuryWeeksOut) {
    if (effects.injuryWeeksOut > 0) {
      player.injury = { label: effects.injuryLabel ?? "Verletzung", weeksOut: (player.injury?.weeksOut ?? 0) + effects.injuryWeeksOut };
      player.totalInjuryWeeks += effects.injuryWeeksOut;
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

/** Übersetzt die angewendeten Effekte einer Entscheidung in lesbare Feedback-Zeilen. */
export function summarizeEffects(effects: EventChoice["effects"]): string[] {
  const lines: string[] = [];
  if (effects.attributes) {
    for (const key of ATTRIBUTE_ORDER) {
      const delta = effects.attributes[key];
      if (delta) lines.push(`${ATTRIBUTE_LABEL[key]} ${signed(delta)}`);
    }
  }
  if (effects.morale) lines.push(`Moral ${signed(effects.morale)}`);
  if (effects.fitness) lines.push(`Fitness ${signed(effects.fitness)}`);
  if (effects.reputation) lines.push(`Bekanntheit ${signed(effects.reputation)}`);
  if (effects.clubRelation) lines.push(`Vereinsbeziehung ${signed(effects.clubRelation)}`);
  if (effects.educationPoints) lines.push(`Bildung ${signed(effects.educationPoints)}`);
  if (effects.wealth) lines.push(`Vermögen ${effects.wealth > 0 ? "+" : ""}${formatMoney(effects.wealth)}`);
  if (effects.wageMultiplier && effects.wageMultiplier !== 1) {
    const pct = Math.round((effects.wageMultiplier - 1) * 100);
    lines.push(`Gehalt ${pct > 0 ? "+" : ""}${pct}%`);
  }
  if (effects.relationshipStatus) lines.push(`Beziehungsstatus: ${RELATIONSHIP_LABEL[effects.relationshipStatus]}`);
  if (effects.childrenDelta) lines.push(`Kinder ${signed(effects.childrenDelta)}`);
  if (effects.capsDelta) lines.push(`Länderspiele ${signed(effects.capsDelta)}`);
  if (effects.goalsDelta) lines.push(`Länderspieltore ${signed(effects.goalsDelta)}`);
  if (effects.roleProtectionSeasons) lines.push(`Kaderrolle für ${effects.roleProtectionSeasons} Saison(en) abgesichert`);
  if (effects.startingRoleGuaranteeSeasons) lines.push(`Stammplatz für ${effects.startingRoleGuaranteeSeasons} Saison(en) garantiert`);
  if (effects.squadRoleOverride) lines.push(`Neue Kaderrolle: ${effects.squadRoleOverride}`);
  if (effects.traitDeltas) {
    for (const key of TRAIT_ORDER) {
      const delta = effects.traitDeltas[key];
      if (delta) lines.push(`${TRAIT_LABEL[key]} ${signed(delta)}`);
    }
  }
  if (effects.injuryWeeksOut) {
    lines.push(
      effects.injuryWeeksOut > 0
        ? `Verletzung: +${effects.injuryWeeksOut} Wochen Ausfall${effects.injuryLabel ? ` (${effects.injuryLabel})` : ""}`
        : `Genesung: ${Math.abs(effects.injuryWeeksOut)} Wochen früher zurück`
    );
  }
  if (effects.storyline) {
    const { label, stage, totalStages, nextTemplateId } = effects.storyline;
    lines.push(
      nextTemplateId
        ? `📖 Geschichte "${label}" (${stage}/${totalStages}) geht weiter - nächstes Kapitel in einer künftigen Saison.`
        : `📖 Geschichte "${label}" (${stage}/${totalStages}) ist abgeschlossen.`
    );
  }
  if (lines.length === 0) lines.push("Keine spürbaren Auswirkungen.");
  return lines;
}

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${n}`;
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
      : 0.2;

  const matches = Math.round(baseMatches * roleFactor * availabilityFactor);

  // Einsatzminuten: Stammspieler bestreiten fast immer die volle Spielzeit,
  // Rotationsspieler und Ergänzungsspieler werden häufiger früh ausgewechselt
  // oder erst eingewechselt - realistisch angelehnt an Transfermarkt/fotmob-Quoten.
  const minutesPerMatchByRole =
    player.contract.squadRole === "Stammspieler"
      ? 84
      : player.contract.squadRole === "Rotation"
      ? 58
      : player.contract.squadRole === "Ergänzungsspieler"
      ? 32
      : 22;
  // Die reine Kaderrolle ist nur die halbe Wahrheit: wie lange man tatsächlich
  // auf dem Platz steht, hängt zusätzlich vom aktuellen Vertrauen des Trainers
  // (Vereinsbeziehung) und der körperlichen Verfassung (Fitness) ab - ein
  // Stammspieler mit zerrüttetem Verhältnis oder angeschlagener Fitness wird
  // früher ausgewechselt als der unangefochtene Publikumsliebling in
  // Topform, auch wenn beide formal dieselbe Kaderrolle tragen.
  const trustFactor = clamp(
    0.85 + (player.clubRelation - 50) / 250 + (player.fitness - 70) / 300,
    0.65,
    1.15
  );
  // Pro Match sind maximal 90 Minuten möglich (siehe `possibleMinutes` unten) -
  // der Vertrauensfaktor kann die Einwechselzeit verlängern, aber niemals über
  // die volle Spielzeit hinaus.
  const effectiveMinutesPerMatch = Math.min(90, minutesPerMatchByRole * trustFactor);
  const possibleMinutes = baseMatches * 90;
  const minutesPlayed = Math.min(possibleMinutes, Math.round(matches * effectiveMinutesPerMatch));

  const form = (player.morale - 50) / 100; // -0.5 .. 0.5
  // Disziplin wirkt sich leicht auf die Konstanz der Leistungen aus (professionelle
  // Lebensführung vs. Party-Image) - ein spürbarer, aber kein dominanter Faktor.
  const disziplinFactor = (player.traits.disziplin - 50) / 250; // -0.2 .. +0.2
  // Ein stabiles Privatleben zahlt sich sportlich aus: eine feste Partnerschaft
  // gibt Rückhalt, eine Ehe am meisten - kein riesiger Hebel, aber ein spürbarer.
  const relationshipFactor =
    player.relationshipStatus === "verheiratet"
      ? 0.12
      : player.relationshipStatus === "verlobt"
      ? 0.08
      : player.relationshipStatus === "in_beziehung"
      ? 0.05
      : 0;
  const ratingBase = 6.0 + (overall - clubStrength) / 45 + form * 0.6 + disziplinFactor + relationshipFactor;
  const avgRating = clamp(ratingBase + (rng() - 0.5) * 0.6, 3.5, 9.5);

  const attackWeight = { TW: 0.02, IV: 0.15, AV: 0.35, ZM: 0.55, FS: 0.85, ST: 1.0 }[player.position];
  const goalChancePerMatch = (overall / 100) * attackWeight * 0.45;
  const assistChancePerMatch = (overall / 100) * attackWeight * 0.35;
  const goals = Math.max(0, Math.round(matches * goalChancePerMatch * (0.7 + rng() * 0.6)));
  const assists = Math.max(0, Math.round(matches * assistChancePerMatch * (0.7 + rng() * 0.6)));

  // Niedrige Disziplin erhöht die Kartenwahrscheinlichkeit spürbar, hohe senkt sie
  const cardFactor = clamp(1.5 - player.traits.disziplin / 50, 0.5, 1.5);
  const yellowCards = Math.round(matches * 0.12 * (0.5 + rng()) * cardFactor);
  const redCards = rng() < 0.05 * (matches / 30) * cardFactor ? 1 : 0;

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

  // Individuelle Auszeichnungen: eine echte Chance, sich unabhängig vom Team
  // sportlich zu beweisen und nach oben zu arbeiten.
  const isAttacker = player.position === "ST" || player.position === "FS";
  if (isAttacker && goals >= 14 && rng() < 0.15 + clamp((overall - clubStrength) / 150, 0, 0.35)) {
    trophies.push("Torschützenkönig");
  }
  if (avgRating >= 7.6 && rng() < 0.12 + clamp((overall - clubStrength) / 200, 0, 0.25)) {
    trophies.push("Spieler der Saison");
  }
  if (player.stage === "jugend" || player.stage === "durchbruch") {
    if (overall >= clubStrength - 5 && rng() < 0.1) trophies.push("Talent der Saison");
  }

  player.careerTotals.matches += matches;
  player.careerTotals.goals += goals;
  player.careerTotals.assists += assists;
  player.careerTotals.yellowCards += yellowCards;
  player.careerTotals.redCards += redCards;
  player.careerTotals.trophies.push(...trophies);

  for (const trophy of trophies) {
    const isIndividual = trophy === "Torschützenkönig" || trophy === "Spieler der Saison" || trophy === "Talent der Saison";
    player.log.push({
      season: seasonNumber,
      age: player.age,
      text: isIndividual
        ? `${player.name} wird als "${trophy}" ausgezeichnet - eine individuelle Krönung der Saison.`
        : `${player.name} gewinnt mit ${player.club.name} die/den ${trophy}.`,
      kind: "milestone",
    });
    if (isIndividual) player.reputation = clamp(player.reputation + 8, 0, 100);
  }

  // Gehaltssystem: Grundgehalt wird garantiert ausgezahlt, dazu leistungsabhängige
  // Prämien für Tore/Vorlagen, starke Bewertungen und Titel.
  const performanceBonus = Math.round(
    goals * 400 + assists * 250 + (avgRating >= 7.2 ? 6000 : 0) + trophies.length * 15000
  );
  const income = player.contract.wagePerYear + performanceBonus;
  player.wealth += income;

  // Reputation wächst mit guten Leistungen - ein gutes Medienimage verstärkt den Effekt
  const mediaFactor = 1 + (player.traits.medienimage - 50) / 200; // 0.75 .. 1.25
  const repGain = clamp(Math.round((avgRating - 6) * 3 * mediaFactor + goals * 0.4 + assists * 0.2), -6, 14);
  player.reputation = clamp(player.reputation + repGain, 0, 100);

  // Verein-Beziehung leicht Richtung Mitte tendieren lassen
  if (avgRating >= 7) player.clubRelation = clamp(player.clubRelation + 3, 0, 100);
  if (avgRating < 5.5) player.clubRelation = clamp(player.clubRelation - 4, 0, 100);

  // Länderspiele dieser Saison: Differenz zum Stand bei Saisonbeginn (Caps können
  // während der Saison über Nationalmannschafts-Events dazukommen).
  const capsThisSeason = Math.max(0, player.nationalTeamCaps - player.capsAtSeasonStart);
  player.capsAtSeasonStart = player.nationalTeamCaps;

  const { score, tier: scoreTier, factors: scoreFactors } = computeSeasonScore({
    avgRating,
    goals,
    assists,
    trophies,
    repGain,
    yellowCards,
    redCards,
    capsThisSeason,
  });

  const stats: SeasonStats = {
    seasonLabel: `Saison ${2026 + seasonNumber}/${(2026 + seasonNumber + 1).toString().slice(-2)}`,
    age: player.age,
    club: player.club.name,
    overallRating: overall,
    leagueTier: player.club.tier,
    leagueName: leagueNameForTier(league, player.club.tier),
    matches,
    minutesPlayed,
    possibleMinutes,
    goals,
    assists,
    capsThisSeason,
    avgRating: Math.round(avgRating * 10) / 10,
    leaguePosition,
    trophies,
    yellowCards,
    redCards,
    promoted: false,
    relegated: false,
    income,
    reputationGain: repGain,
    score,
    scoreTier,
    newAchievements: [],
    scoreFactors,
  };

  player.seasonHistory.push(stats);

  return stats;
}

/** Mehrfaktorielle Saison-Bilanz. Auf-/Abstieg wird separat nachgetragen (siehe `applyLeaguePromotionRelegation`). */
function computeSeasonScore(input: {
  avgRating: number;
  goals: number;
  assists: number;
  trophies: string[];
  repGain: number;
  yellowCards: number;
  redCards: number;
  capsThisSeason: number;
}): { score: number; tier: string; factors: ScoreFactor[] } {
  const factors: ScoreFactor[] = [
    { label: "Sportliche Leistung (Ø Bewertung)", points: Math.round(input.avgRating * 12) },
    { label: "Torbeteiligungen", points: Math.round(input.goals * 6 + input.assists * 4) },
    { label: "Titel", points: input.trophies.length * 50 },
    { label: "Entwicklung (Bekanntheit)", points: input.repGain * 3 },
    { label: "Disziplin", points: -Math.round(input.yellowCards * 2 + input.redCards * 15) },
  ];
  if (input.capsThisSeason > 0) {
    factors.push({ label: "Länderspiele", points: input.capsThisSeason * 10 });
  }

  const score = factors.reduce((s, f) => s + f.points, 0);
  let tier = "Durchwachsene Saison";
  if (score >= 180) tier = "Überragende Saison";
  else if (score >= 120) tier = "Starke Saison";
  else if (score >= 70) tier = "Solide Saison";
  else if (score < 20) tier = "Schwierige Saison";

  return { score, tier, factors };
}

// ---------------------------------------------------------------------------
// Alterung / Attribut-Wachstum
// ---------------------------------------------------------------------------

/**
 * Anteil der verbleibenden Lücke zum Potenzial, der in dieser Altersphase pro
 * Saison realistisch aufgeholt wird (proportionales/logistisches Wachstum -
 * nähert sich dem Potenzial an, erreicht es aber nie ganz exakt, ganz wie im
 * echten Fußball). Ersetzt das alte feste Delta-Modell, bei dem die kleinen
 * Faktoren der Prime-Jahre (22-29) durch Rundung auf ganze Zahlen praktisch
 * immer zu 0 wurden - Spieler stagnierten dadurch unabhängig vom Potenzial
 * meist um die 45-50 Gesamtstärke und Weltklasse-Niveau war faktisch
 * unerreichbar. Der fraktionale Carry-Over unten verhindert dasselbe Problem.
 */
function growthRate(age: number): number {
  if (age <= 17) return 0.24;
  if (age <= 21) return 0.17;
  if (age <= 24) return 0.11;
  if (age <= 29) return 0.055;
  return 0;
}

/** Anteil des aktuellen Werts, der pro Saison im Alter abgebaut wird. */
function declineRate(age: number): number {
  if (age <= 29) return 0;
  if (age <= 32) return 0.03;
  if (age <= 35) return 0.06;
  return 0.1;
}

export function ageUpPlayer(player: Player): void {
  const gRate = growthRate(player.age);
  const dRate = declineRate(player.age);
  // Arbeitsmoral aus vergangenen Trainings-/Lifestyle-Entscheidungen beschleunigt
  // oder bremst das Wachstum spürbar (0.8x bei sehr niedriger, 1.2x bei sehr hoher
  // Arbeitsmoral) - der direkteste "Impact" vergangener Entscheidungen auf die Werte.
  const workEthicMultiplier = clamp(0.8 + (player.traits.arbeitsmoral / 100) * 0.4, 0.8, 1.2);
  // Ein kürzlicher Wechsel zu einem deutlich stärkeren Verein/einer stärkeren Liga
  // bringt ein besseres Trainingsumfeld mit - das beschleunigt das Wachstum für
  // einige Saisons spürbar.
  const trainingEnvironmentMultiplier = player.trainingBoostSeasons > 0 ? 1.35 : 1;
  for (const key of ATTRIBUTE_KEYS) {
    const current = player.attributes[key];
    const potential = player.potential[key];
    let rawDelta: number;
    if (gRate > 0) {
      const room = potential - current;
      rawDelta = gRate * room * workEthicMultiplier * trainingEnvironmentMultiplier * (0.7 + rng() * 0.6);
      rawDelta = Math.max(0, rawDelta);
    } else if (dRate > 0) {
      rawDelta = -dRate * current * (0.7 + rng() * 0.6);
    } else {
      rawDelta = 0;
    }
    // Fraktionaler Rest wird in die nächste Saison mitgenommen, statt bei der
    // Rundung auf ganze Punkte verloren zu gehen (siehe Kommentar oben).
    const total = rawDelta + (player.growthCarry[key] ?? 0);
    const whole = Math.trunc(total);
    player.growthCarry[key] = total - whole;
    player.attributes[key] = clamp(current + whole, 1, 99);
  }

  player.age += 1;
  player.stage = stageForAge(player.age);
  player.fitness = clamp(player.fitness + 12, 40, 100); // Sommerpause / Erholung
  player.morale = clamp(player.morale + (player.morale < 50 ? 5 : 0), 0, 100);
  player.seasonsSinceTransferEvent += 1;
  if (player.roleProtectionSeasons > 0) player.roleProtectionSeasons -= 1;
  if (player.startingRoleGuaranteeSeasons > 0) player.startingRoleGuaranteeSeasons -= 1;
  if (player.trainingBoostSeasons > 0) player.trainingBoostSeasons -= 1;

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
// Vertrag / Rollenpflege zwischen den Saisons
// ---------------------------------------------------------------------------

/**
 * Zielstärke, die ein Spieler mit gegebener Bekanntheit und Gesamtstärke für
 * einen neuen Verein "verdient" - die Gesamtstärke (1-99) fließt bewusst mit
 * dem größeren Gewicht ein, damit die eigentliche Spielstärke, nicht nur die
 * Bekanntheit, darüber entscheidet, wie attraktiv die Angebote ausfallen.
 */
function targetStrengthForReputation(reputation: number, overall: number): number {
  return clamp(15 + reputation * 0.2 + overall * 0.65, 30, 96);
}

/** Rang eines Landes nach UEFA-Länderkoeffizient (Reihenfolge der `COUNTRIES`-Liste) -
 * 0 = höchstes Liga-Ansehen (England), 9 = niedrigstes (Polen). Dient als Proxy für
 * "Aufstieg/Abstieg im Liga-Ranking" bei internationalen Wechseln. */
function leaguePrestigeRank(countryId: CountryId): number {
  const idx = COUNTRIES.findIndex((c) => c.id === countryId);
  return idx === -1 ? COUNTRIES.length : idx;
}

/** Ligaansehen als Multiplikator: die bestplatzierte Liga der Auswahl zahlt spürbar
 * mehr, die am niedrigsten platzierte spürbar weniger - dieselbe Vereinsstärke ist in
 * einer Topliga schlicht mehr wert als in einer schwächeren (reale Transfermarkt-Logik). */
function leaguePrestigeMultiplier(countryId: CountryId): number {
  const rank = leaguePrestigeRank(countryId);
  return clamp(1.3 - rank * 0.06, 0.7, 1.3);
}

/**
 * ELO-artiger Vereins-Koeffizient: kombiniert die sportliche Stärke des Klubs
 * (0-99, innerhalb der eigenen Liga-Pyramide) mit dem Ansehen der Liga selbst
 * zu einem einzigen Wert. Ein "92" in einer Topliga ist damit spürbar mehr wert
 * als ein "92" in einer schwächeren - dient als einheitliche Basis fürs Gehalt
 * (und ließe sich künftig für weitere vereinsbezogene Berechnungen wiederverwenden).
 */
function clubCoefficient(club: { strength: number }, countryId: CountryId): number {
  return club.strength * leaguePrestigeMultiplier(countryId);
}

/** Geschätztes Jahresgehalt bei einem Verein - richtet sich nach der eigenen
 * Gesamtstärke UND Bekanntheit (beide multiplikativ, nicht nur addiert - ein
 * Weltklasse-Spieler verdient überproportional mehr, nicht nur ein bisschen)
 * sowie dem ELO-artigen Vereins-Koeffizienten (siehe `clubCoefficient`), der
 * exponentiell statt linear einfließt: ein echter Topklub zahlt ein Vielfaches
 * eines Kellerkinds, nicht nur spürbar mehr. Wird sowohl in der Angebots-
 * Vorschau als auch bei der tatsächlichen Zusage verwendet, damit das
 * versprochene Gehalt exakt dem entspricht, was man am Ende bekommt. */
function estimateWage(overall: number, reputation: number, club: { strength: number }, countryId: CountryId): number {
  const baseline = 8000 + reputation * 900 + overall * 1200;
  const coeff = clubCoefficient(club, countryId);
  // 55 als grober Referenzwert für einen "durchschnittlichen" Erstliga-Verein -
  // Vereine deutlich darüber/darunter skalieren das Gehalt spürbar über- bzw.
  // unterproportional (Potenz statt linearer Faktor).
  const clubMultiplier = clamp(Math.pow(coeff / 55, 1.8), 0.25, 6);
  return Math.round((baseline * clubMultiplier) / 100) * 100;
}

/** Wahrscheinlichkeit, dass ein NEUER Verein sein Einsatzminuten-Versprechen
 * (die in der Angebots-Vorschau gezeigte Kaderrolle) auch tatsächlich einhält -
 * ausgewürfelt beim Vollzug des Wechsels (siehe `applyClubOfferChoice`). Je
 * größer der Sprung zwischen eigener Stärke und Vereinsniveau, desto eher
 * bleibt das Versprechen ein Lippenbekenntnis, um dich zum Wechsel zu bewegen. */
function rolePromiseChance(overall: number, clubStrength: number): number {
  const gap = overall - clubStrength;
  return clamp(0.55 + gap / 40, 0.35, 0.93);
}

function squadRoleForOverall(overall: number, clubStrength: number): SquadRole {
  const diff = overall - clubStrength;
  if (diff >= 5) return "Stammspieler";
  if (diff >= -5) return "Rotation";
  if (diff >= -15) return "Ergänzungsspieler";
  return "Ersatzbank";
}

/** Eine Stufe unterhalb der übergebenen Kaderrolle (für ein gebrochenes
 * Einsatzminuten-Versprechen, siehe `rolePromiseChance`) - "Ersatzbank" ist die
 * Talsohle. */
const ROLE_ORDER: SquadRole[] = ["Ersatzbank", "Ergänzungsspieler", "Rotation", "Stammspieler"];
function roleOneStepDown(role: SquadRole): SquadRole {
  const idx = ROLE_ORDER.indexOf(role);
  if (idx <= 0) return role;
  return ROLE_ORDER[idx - 1];
}

/**
 * Wie `squadRoleForOverall`, aber für die laufende Kaderrolle beim AKTUELLEN
 * Verein (siehe `resolveClubSituation`): reine Gesamtstärke vs. Vereinsstärke
 * ignorierte bislang komplett, wie man beim Trainer dasteht und ob man gerade
 * eine Sahne- oder Krisenserie hinter sich hat - zwei Spieler mit identischer
 * Gesamtstärke sollten bei gutem Verhältnis + starker Form eher Stammspieler
 * sein als bei zerrüttetem Verhältnis + Formkrise. Für die Vorschau bei einem
 * NEUEN Verein (Angebotskarte) bleibt bewusst die einfache Formel gültig -
 * dort gibt es noch keine etablierte Beziehung/Form an diesem Verein.
 */
function currentSquadRole(player: Player, clubStrength: number): SquadRole {
  const overall = overallRating(player);
  const lastStats = player.seasonHistory[player.seasonHistory.length - 1];
  const relationFactor = (player.clubRelation - 50) / 10; // -5 .. +5
  const formFactor = lastStats ? (lastStats.avgRating - 6.5) * 1.8 : 0; // ca. -10 .. +6
  const roleScore = overall - clubStrength + relationFactor + formFactor;
  if (roleScore >= 5) return "Stammspieler";
  if (roleScore >= -5) return "Rotation";
  if (roleScore >= -15) return "Ergänzungsspieler";
  return "Ersatzbank";
}

/**
 * Pflegt Vertrag, Kaderrolle und Vereinszugehörigkeit zwischen den Saisons - OHNE
 * automatische, unsichtbare Vereinswechsel. Transfers laufen ausschließlich über
 * die sichtbaren `club_offer`-Events (siehe `decideClubOfferInjection`). Diese
 * Funktion aktualisiert nur: Rolle im Kader (mit Log bei Veränderung, damit man
 * "sich herausarbeiten" sichtbar mitbekommt), Bankphasen-Zähler und automatische
 * Kurzverlängerung, falls kein Vertrags-Event gegriffen hat.
 */
export function resolveClubSituation(player: Player, league: LeagueState): LogEntry | null {
  const currentClub = findClub(league, player.club.clubId);
  if (currentClub) {
    player.club = {
      clubId: currentClub.id,
      name: currentClub.city,
      country: league.countryName,
      tier: currentClub.tier,
      strength: currentClub.strength,
    };
  }
  player.contract.club = player.club.name;

  if (player.contract.squadRole === "Ausbildungsspieler") {
    // Profidebüt läuft über das eigene club_offer-Event (siehe decideClubOfferInjection)
    return null;
  }

  const oldRole = player.contract.squadRole;
  let newRole = currentSquadRole(player, player.club.strength);
  // Eine erfolgreich genutzte Bewährungschance schützt die Kaderrolle noch einige
  // Saisons vor dem Abrutschen unter "Rotation" - der Durchbruch bleibt spürbar.
  if (player.roleProtectionSeasons > 0 && SQUAD_ROLE_RANK[newRole] < SQUAD_ROLE_RANK["Rotation"]) {
    newRole = "Rotation";
  }
  // Vertragliche Stammplatzgarantie: stärkere Absicherung als die Bewährungschance,
  // garantiert für die vereinbarte Dauer mindestens "Stammspieler" - wirkt sich über
  // `roleFactor`/`minutesPerMatchByRole` in `simulateSeason` direkt auf Einsatzminuten
  // und darüber auf Tore/Vorlagen aus, statt nur ein Stimmungs-Bonus zu sein.
  if (player.startingRoleGuaranteeSeasons > 0 && SQUAD_ROLE_RANK[newRole] < SQUAD_ROLE_RANK["Stammspieler"]) {
    newRole = "Stammspieler";
  }
  player.contract.squadRole = newRole;

  if (newRole === "Ersatzbank" || newRole === "Ergänzungsspieler") {
    player.consecutiveBenchSeasons += 1;
  } else {
    player.consecutiveBenchSeasons = 0;
  }

  // Hohe Führungsstärke hält die Kabine zusammen und stärkt die Vereinsbeziehung leicht
  if (player.traits.fuehrung >= 70) {
    player.clubRelation = clamp(player.clubRelation + 2, 0, 100);
  } else if (player.traits.fuehrung <= 25) {
    player.clubRelation = clamp(player.clubRelation - 1, 0, 100);
  }

  let entry: LogEntry | null = null;
  if (newRole !== oldRole) {
    const improved = SQUAD_ROLE_RANK[newRole] > SQUAD_ROLE_RANK[oldRole];
    entry = {
      season: 0,
      age: player.age,
      text: improved
        ? `${player.name} arbeitet sich bei ${player.club.name} zu einer besseren Rolle im Kader hoch (${newRole}).`
        : `${player.name} verliert bei ${player.club.name} an Bedeutung im Kader (${newRole}).`,
      kind: improved ? "positive" : "negative",
    };
    player.log.push(entry);
  }

  if (player.contract.yearsLeft <= 0) {
    // Automatische Kurzverlängerung, falls kein aktives Vertrags-Event gegriffen hat
    player.contract.yearsLeft = 1;
    player.contract.wagePerYear = Math.round(player.contract.wagePerYear * 1.05);
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
  const personalFormGreat = !!lastStats && lastStats.avgRating >= 6.8;
  if (lastStats) {
    lastStats.relegated = wasRelegated;
    lastStats.promoted = wasPromoted;
    const points = wasRelegated ? -40 : 40;
    lastStats.scoreFactors.push({ label: wasRelegated ? "Abstieg" : "Aufstieg", points });
    lastStats.score += points;
    if (lastStats.score >= 180) lastStats.scoreTier = "Überragende Saison";
    else if (lastStats.score >= 120) lastStats.scoreTier = "Starke Saison";
    else if (lastStats.score >= 70) lastStats.scoreTier = "Solide Saison";
    else if (lastStats.score < 20) lastStats.scoreTier = "Schwierige Saison";
    else lastStats.scoreTier = "Durchwachsene Saison";
  }

  // Auf-/Abstieg bleibt nicht folgenlos für den Spieler selbst - beim Abstieg
  // gedämpft, wenn die eigene Leistung trotzdem stark war (kein Vorwurf an den
  // Einzelnen), beim Aufstieg ein echter Teamerfolgs-Bonus.
  if (wasRelegated) {
    player.morale = clamp(player.morale - (personalFormGreat ? 4 : 9), 0, 100);
    if (!personalFormGreat) player.reputation = clamp(player.reputation - 3, 0, 100);
  } else {
    player.morale = clamp(player.morale + 8, 0, 100);
    player.reputation = clamp(player.reputation + 5, 0, 100);
  }

  const leagueName = leagueNameForTier(league, player.club.tier);
  const text = wasRelegated
    ? personalFormGreat
      ? `${player.club.name} steigt trotz einer starken Saison von ${player.name} ab und spielt künftig in der ${leagueName}.`
      : `${player.club.name} steigt ab und spielt künftig in der ${leagueName}.`
    : `${player.club.name} steigt auf und spielt künftig in der ${leagueName} - ${player.name} hat maßgeblich dazu beigetragen.`;

  return { season: 0, age: player.age, text, kind: wasRelegated ? "negative" : "positive" };
}

// ---------------------------------------------------------------------------
// Sichtbare Vereinswechsel: Profidebüt, Transferangebote, Bankphasen-Druck
// ---------------------------------------------------------------------------

export type ClubOfferReason = "pro-debut" | "opportunity" | "pressure";

const CLUB_OFFER_PREFIX = "club_offer:";

export function isClubOfferEvent(templateId: string): boolean {
  return templateId.startsWith(CLUB_OFFER_PREFIX);
}

export function clubOfferTemplateId(reason: ClubOfferReason): string {
  return `${CLUB_OFFER_PREFIX}${reason}`;
}

export function shouldOfferProDebut(player: Player): boolean {
  return player.age === 18 && player.contract.squadRole === "Ausbildungsspieler";
}

export function shouldTriggerTransferPressure(player: Player): boolean {
  if (player.stage === "jugend") return false;
  if (player.seasonsSinceTransferEvent < 1) return false;
  return player.clubRelation < 25 || player.consecutiveBenchSeasons >= 2;
}

export function shouldTriggerTransferOpportunity(player: Player): boolean {
  if (player.stage === "jugend") return false;
  const last = player.seasonHistory[player.seasonHistory.length - 1];
  // Solide Saison reicht schon aus, um Scouts auf sich aufmerksam zu machen - nicht
  // erst eine Ausnahmesaison. Eine "Starke"/"Überragende" Saison macht es fast sicher.
  const goodForm = last ? last.avgRating >= 6.3 || last.scoreTier === "Starke Saison" || last.scoreTier === "Überragende Saison" : false;
  // Auf-/Abstieg mit guter eigener Leistung zieht zusätzliche Aufmerksamkeit auf sich:
  // beim Abstieg ein Rettungsanker weg vom sinkenden Schiff, beim Aufstieg der Lohn
  // für den bewiesenen Beitrag - beides wirkt wie aktiv geäußertes Wechselinteresse.
  const notableSeasonEvent = !!last && (last.relegated || last.promoted) && goodForm;
  const urgent = player.wantsTransfer || notableSeasonEvent;
  // Aktiv geäußertes Wechselinteresse (oder ein bemerkenswerter Auf-/Abstieg) hat
  // spürbaren, schnellen Impact: keine Wartezeit mehr und eine fast sichere
  // Trefferchance - statt erst 1-2 Saisons auf ein Angebot zu warten.
  const cooldown = urgent ? 0 : 2;
  if (player.seasonsSinceTransferEvent < cooldown) return false;
  const chance = urgent ? 0.92 : last?.scoreTier === "Überragende Saison" ? 0.75 : 0.55;
  return (goodForm || urgent) && rng() < chance;
}

/** Baut die Liga-Pyramide eines fremden Landes lazy und cached sie danach dauerhaft -
 * damit ein gezeigtes Auslandsangebot exakt dem entspricht, was man bei Annahme bekommt
 * (kein erneutes Würfeln der Vereinsstärken zwischen Angebot und Zusage). */
function getOrBuildForeignLeague(
  foreignLeagues: Partial<Record<CountryId, LeagueState>>,
  countryId: CountryId
): LeagueState {
  const cached = foreignLeagues[countryId];
  if (cached) return cached;
  const built = buildLeagueState(countryId, rng);
  foreignLeagues[countryId] = built;
  return built;
}

function pickForeignCountryIds(excludeId: CountryId, count: number): CountryId[] {
  const pool = COUNTRIES.map((c) => c.id).filter((id) => id !== excludeId);
  const picked: CountryId[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

/** Wahrscheinlichkeit, dass unter den Angeboten mindestens ein Auslandsverein ist -
 * steigt mit Bekanntheit/Gesamtstärke, und stark, wenn aktiv ein Wechsel gewünscht wird
 * (der Berater erweitert dann bewusst den Suchradius über die Landesgrenze hinaus). */
function internationalOfferChance(reason: ClubOfferReason, player: Player, overall: number): number {
  const fameFactor = player.reputation / 250 + overall / 300; // ~0 .. 0.65
  if (player.wantsTransfer) return clamp(0.55 + fameFactor, 0.45, 0.9);
  if (reason === "pro-debut") return clamp(0.15 + fameFactor, 0.1, 0.5);
  if (reason === "opportunity") return clamp(0.3 + fameFactor, 0.25, 0.75);
  return clamp(0.15 + fameFactor, 0.1, 0.4);
}

interface OfferCandidate {
  club: ClubState;
  countryId: CountryId;
  countryName: string;
  flag: string;
  leagueLabel: string;
  isForeign: boolean;
}

function buildClubOfferEvent(
  player: Player,
  league: LeagueState,
  reason: ClubOfferReason,
  foreignLeagues: Partial<Record<CountryId, LeagueState>>
): GameEvent {
  const overall = overallRating(player);
  const currentStrength = player.club.strength;
  const pool = [...league.tier1, ...league.tier2];
  const lastStats = player.seasonHistory[player.seasonHistory.length - 1];

  let targetStrength: number;
  let excludeCurrent: boolean;
  const totalCount = 3;
  if (reason === "pro-debut") {
    targetStrength = targetStrengthForReputation(player.reputation, overall);
    // Der eigene Jugendverein bekommt einen eigenen, klar erkennbaren
    // "Treue"-Auswahlpunkt (siehe unten) statt zufällig als einer von drei
    // "Wechsel zu ..."-Kandidaten aufzutauchen - realistisch bekommt die
    // Mehrheit der Jugendspieler ihren ersten Profivertrag ohnehin beim
    // eigenen Verein, nicht zwangsläufig von außen.
    excludeCurrent = true;
  } else if (reason === "opportunity") {
    // Klare, nachvollziehbare Kurve: je besser die letzte Saison bewertet wurde,
    // desto deutlicher der Sprung in der Vereinsstärke der Angebote.
    const [minJump, maxJump] =
      lastStats?.scoreTier === "Überragende Saison"
        ? [20, 35]
        : lastStats?.scoreTier === "Starke Saison"
        ? [10, 20]
        : [3, 12];
    const jumpTarget = currentStrength + minJump + rng() * (maxJump - minJump);
    // Zusätzlicher Anker an der eigenen Gesamtstärke: ein Elite-Spieler (82+), der
    // zufällig bei einem schwächeren Verein hängt, soll trotzdem Angebote auf
    // seinem echten Niveau bekommen - nicht nur eine relative Verbesserung zum
    // aktuellen (ggf. viel zu schwachen) Verein. Realistisch nach Transfermarkt/
    // fotmob-Logik: die eigene Bewertung zieht Top-Klubs an, unabhängig davon,
    // wo man gerade spielt.
    const ratingAnchor = overall - 3 + rng() * 8;
    targetStrength = clamp(Math.max(jumpTarget, ratingAnchor), 30, 96);
    excludeCurrent = true;
  } else {
    targetStrength = clamp(currentStrength - 18, 22, 90);
    excludeCurrent = true;
  }

  // Ein Teil der Angebote kann aus dem Ausland kommen - realistisch auch schon für
  // Jungspieler beim Profidebüt, nicht erst für etablierte Stars.
  const wantsForeign = rng() < internationalOfferChance(reason, player, overall);
  const veryFamous = player.reputation >= 70 || overall >= 80;
  const foreignCount = wantsForeign ? (veryFamous && rng() < 0.3 ? 2 : 1) : 0;
  const domesticCount = totalCount - foreignCount;

  const domesticOffers = pickDistinctClubOffers(
    pool,
    targetStrength,
    excludeCurrent ? [player.club.clubId] : [],
    rng,
    domesticCount
  );

  const candidates: OfferCandidate[] = domesticOffers.map((c) => ({
    club: c,
    countryId: league.countryId,
    countryName: league.countryName,
    flag: league.flag,
    leagueLabel: leagueNameForTier(league, c.tier),
    isForeign: false,
  }));

  if (foreignCount > 0) {
    for (const countryId of pickForeignCountryIds(player.country, foreignCount)) {
      const foreignLeague = getOrBuildForeignLeague(foreignLeagues, countryId);
      const foreignPool = [...foreignLeague.tier1, ...foreignLeague.tier2];
      const club = pickClubNearStrength(foreignPool, targetStrength, null, rng);
      candidates.push({
        club,
        countryId,
        countryName: foreignLeague.countryName,
        flag: foreignLeague.flag,
        leagueLabel: leagueNameForTier(foreignLeague, club.tier),
        isForeign: true,
      });
    }
  }

  const count = candidates.length;

  const choices: EventChoice[] = candidates.map((cand) => {
    // Dieselbe Formel wie bei der tatsächlichen Zusage (siehe `applyClubOfferChoice`),
    // damit das hier gezeigte Gehalt exakt dem entspricht, was man am Ende bekommt.
    const wagePreview = estimateWage(overall, player.reputation, cand.club, cand.countryId);
    const promisedRole = squadRoleForOverall(overall, cand.club.strength);
    // Das Einsatzminuten-Versprechen eines NEUEN Vereins ist nie hundertprozentig
    // sicher - je größer der Sprung zwischen eigener Stärke und Vereinsniveau,
    // desto eher bleibt die versprochene Rolle nur ein Lippenbekenntnis (siehe
    // `applyClubOfferChoice`, wo tatsächlich ausgewürfelt wird, ob der Verein das
    // Versprechen einhält).
    const promiseChance = rolePromiseChance(overall, cand.club.strength);
    return {
      id: `club-${cand.club.id}`,
      label: cand.isForeign
        ? `Auslandswechsel zu ${cand.club.city} (${cand.flag} ${cand.countryName})`
        : `Wechsel zu ${cand.club.city}`,
      detail: `${cand.leagueLabel} · Vereinsstärke ${cand.club.strength} · Einsatzminuten-Versprechen: ${promisedRole} (${Math.round(promiseChance * 100)}% Erfolgschance) · Gehalt ca. ${formatMoney(wagePreview)}/Jahr${cand.isForeign ? " · Auslandswechsel" : ""}`,
      effects: {},
    };
  });

  if (reason === "pro-debut") {
    // Treue-Option zum eigenen Jugendverein - mit echtem, spürbarem Bonus
    // gegenüber einem Fremdwechsel (bessere Startbeziehung, etwas Moral- und
    // Mentalitätsschub durch die vertraute Umgebung), damit "beim Verein
    // bleiben" eine attraktive und keine bloß neutrale Wahl ist.
    const stayWagePreview = estimateWage(overall, player.reputation, player.club, player.country);
    choices.push({
      id: "stay-debut",
      label: `Profivertrag bei ${player.club.name} unterschreiben`,
      detail: `Bleib deinem Jugendverein treu · Rolle voraussichtlich ${squadRoleForOverall(overall, currentStrength)} · Gehalt ca. ${formatMoney(stayWagePreview)}/Jahr · Vertrauensbonus durch die vertraute Umgebung`,
      effects: {},
    });
  } else if (reason === "opportunity") {
    choices.push({
      id: "stay",
      label: `Bei ${player.club.name} bleiben`,
      detail: "Zeigt dem Verein die Treue - stärkt die Vereinsbeziehung.",
      effects: {},
    });
  } else if (reason === "pressure") {
    choices.push({
      id: "fight",
      label: player.consecutiveBenchSeasons >= 1 ? "Kämpfen und den Stammplatz zurückerobern" : "Das Verhältnis kitten und bleiben",
      detail: "Riskant, aber du bleibst bei deinem aktuellen Verein.",
      effects: {},
    });
  }

  const relegatedEscape = reason === "opportunity" && lastStats?.relegated;
  const promotedReward = reason === "opportunity" && lastStats?.promoted;

  const title =
    reason === "pro-debut"
      ? "Dein erster Profivertrag"
      : relegatedEscape
      ? "Rettungsanker im Sommertransferfenster"
      : promotedReward
      ? "Der Aufstieg zahlt sich im Sommer aus"
      : reason === "opportunity"
      ? "Interesse von anderen Vereinen im Sommertransferfenster"
      : "Wechselgerüchte im Winterfenster";

  // Konkreter Bezug zur letzten Saison, damit klar wird, WARUM sich gerade jetzt
  // Vereine melden - keine anonyme Zufalls-Einladung, sondern eine nachvollziehbare
  // Folge der eigenen Leistung.
  const lastSeasonRef = lastStats
    ? `Nach ${lastStats.seasonLabel} (${lastStats.scoreTier}, Ø ${lastStats.avgRating}, ${lastStats.goals} Tore/${lastStats.assists} Vorlagen) `
    : "";

  const foreignNote = foreignCount > 0 ? ` Darunter auch ${foreignCount === 1 ? "ein Angebot" : "Angebote"} aus dem Ausland.` : "";

  // Der Bankdruck-Grund kann zwei ganz unterschiedliche Ursachen haben - fehlende
  // Einsätze ODER ein zerrüttetes Verhältnis trotz eigentlich normaler Einsatzzeit
  // (z.B. nach einem eskalierten Trainerkonflikt). Die Beschreibung soll die
  // TATSÄCHLICHE Ursache nennen, statt immer pauschal "Bankdrücker" zu unterstellen,
  // wenn der Spieler in Wahrheit an einem anderen Konflikt gescheitert ist.
  const pressureReason =
    player.consecutiveBenchSeasons >= 1
      ? `Bei ${player.club.name} kommst du kaum noch zum Einsatz (${player.consecutiveBenchSeasons} Saison(en) auf der Bank)`
      : `Das Verhältnis zwischen dir und ${player.club.name} ist tief zerrüttet`;

  const description =
    reason === "pro-debut"
      ? `Nach starken Jahren in der Jugend ist es Zeit für den Sprung in den Profifußball. ${count} externe Vereine bieten dir einen Profivertrag an${foreignNote} - oder du bleibst deinem Jugendverein ${player.club.name} treu und unterschreibst dort deinen ersten Profivertrag.`
      : relegatedEscape
      ? `Trotz des Abstiegs mit ${player.club.name} bleibt deine starke individuelle Leistung nicht unbemerkt - im Sommertransferfenster wollen dich ${count} Vereine vom sinkenden Schiff holen.${foreignNote}`
      : promotedReward
      ? `Dein starker Anteil am Aufstieg mit ${player.club.name} beweist deine Extraklasse - im Sommertransferfenster werden auch größere Vereine auf dich aufmerksam. ${count} Vereine erkundigen sich.${foreignNote}`
      : reason === "opportunity"
      ? `${lastSeasonRef}sind Scouts auf ${player.name} bei ${player.club.name} aufmerksam geworden. Im Sommertransferfenster erkundigen sich ${count} Vereine nach dir.${foreignNote}`
      : `${pressureReason}. Im Winterfenster wäre der Verein offen für einen Wechsel - ${count} Vereine haben bereits angefragt.${foreignNote}`;

  return {
    id: `cluboffer-${player.age}-${reason}-${Math.round(rng() * 1e6)}`,
    templateId: `${CLUB_OFFER_PREFIX}${reason}`,
    category: "transfer",
    title,
    description,
    choices,
  };
}

/**
 * Prüft am Beginn einer Saison, ob ein sichtbares Vereins-Event fällig ist
 * (Profidebüt > Bankphasen-Druck > gute Form), und liefert ggf. den Grund
 * zurück. Setzt bei Auslösung den Cooldown-Zähler zurück. Baut bewusst noch
 * KEIN GameEvent (siehe `buildEventFromId` - lazy, erst bei Anzeige).
 */
export function decideClubOfferInjection(player: Player): ClubOfferReason | null {
  if (shouldOfferProDebut(player)) {
    // Das Profidebüt bleibt unconditional (auch bei Verletzung) - der Übergang
    // hängt exakt am 18. Geburtstag (siehe `shouldOfferProDebut`), ein
    // übersprungenes Jahr würde den Spieler dauerhaft als "Ausbildungsspieler"
    // zurücklassen.
    player.seasonsSinceTransferEvent = 0;
    return "pro-debut";
  }
  // Wer aktuell verletzt ausfällt, steht keinem Verein für ein Medizin-Check
  // oder eine echte Kaderplanung zur Verfügung - Scouting-Interesse und
  // Bankdruck-Angebote pausieren, statt so zu tun, als würde mitten in der
  // Reha ein Wechsel eingefädelt. Holt die Prüfung einfach in der ersten
  // wieder fitten Saison nach.
  if (player.injury && player.injury.weeksOut > 0) return null;
  // Aktiv geäußertes Wechselinteresse hat Vorrang vor der Bankdruck-Prüfung: wer
  // klar signalisiert hat, wechseln zu wollen, soll gezielte Scouting-Angebote
  // bekommen (bessere/passende Vereine) statt ggf. von der allgemeinen
  // Bankdruck-Logik zu Notlösungs-Angeboten schwächerer Vereine verdrängt zu
  // werden - alles andere wirkt inkonsequent gegenüber der eigenen Entscheidung.
  if (player.wantsTransfer && shouldTriggerTransferOpportunity(player)) {
    player.seasonsSinceTransferEvent = 0;
    return "opportunity";
  }
  if (shouldTriggerTransferPressure(player)) {
    player.seasonsSinceTransferEvent = 0;
    return "pressure";
  }
  if (shouldTriggerTransferOpportunity(player)) {
    player.seasonsSinceTransferEvent = 0;
    return "opportunity";
  }
  return null;
}

/** Setzt ein Element an eine bestimmte Position (geklemmt auf die Array-Länge). */
export function insertAt<T>(arr: T[], item: T, index: number): T[] {
  const i = clamp(index, 0, arr.length);
  return [...arr.slice(0, i), item, ...arr.slice(i)];
}

/** Ergebnis einer `club_offer`-Entscheidung - enthält zusätzlich die neue aktive
 * Liga, falls der Wechsel ins Ausland führte (siehe `GameState.foreignLeagues`). */
export interface ClubOfferResult {
  feedback: ChoiceFeedback;
  newActiveLeague?: LeagueState;
}

/** Löst eine Entscheidung innerhalb eines `club_offer`-Events auf (kein generisches EffectDelta). */
export function applyClubOfferChoice(
  player: Player,
  league: LeagueState,
  event: GameEvent,
  choiceId: string,
  foreignLeagues: Partial<Record<CountryId, LeagueState>>
): ClubOfferResult {
  const reason = event.templateId.slice(CLUB_OFFER_PREFIX.length) as ClubOfferReason;

  if (choiceId === "stay") {
    player.clubRelation = clamp(player.clubRelation + 10, 0, 100);
    player.morale = clamp(player.morale + 5, 0, 100);
    player.wantsTransfer = false;
    const text = `${player.name} bleibt ${player.club.name} treu.`;
    player.log.push({ season: 0, age: player.age, text, kind: "positive" });
    return { feedback: { choiceId, text, kind: "positive", deltaLines: ["Vereinsbeziehung +10", "Moral +5"] } };
  }

  if (choiceId === "stay-debut") {
    // Der erste Profivertrag beim eigenen Jugendverein - inhaltlich dasselbe
    // wie ein Wechsel (Ausbildungsspieler -> echte Kaderrolle mit Gehalt),
    // nur beim vertrauten Verein statt bei einem der Fremdangebote. Mit einem
    // echten Treue-Bonus: bessere Startbeziehung als bei einem Fremdwechsel
    // (75 statt 60) und ein kleiner Mentalitäts-/Moralschub durch die
    // vertraute Umgebung.
    const overall = overallRating(player);
    const wage = estimateWage(overall, player.reputation, player.club, player.country);
    const newRole = squadRoleForOverall(overall, player.club.strength);
    player.contract = { club: player.club.name, yearsLeft: 3, wagePerYear: wage, squadRole: newRole };
    player.clubRelation = 75;
    player.morale = clamp(player.morale + 10, 0, 100);
    player.attributes.mentalitaet = clamp(player.attributes.mentalitaet + 1, 1, 99);
    player.traits.arbeitsmoral = clamp(player.traits.arbeitsmoral + 3, 0, 100);
    player.wantsTransfer = false;
    const text = `${player.name} unterschreibt treu beim eigenen Jugendverein ${player.club.name} den ersten Profivertrag.`;
    player.log.push({ season: 0, age: player.age, text, kind: "milestone" });
    return {
      feedback: {
        choiceId,
        text,
        kind: "positive",
        deltaLines: [
          `Neue Rolle im Kader: ${newRole}`,
          `Gehalt: ${formatMoney(wage)} / Jahr`,
          "Vereinsbeziehung 75 (Vertrauensbonus)",
          "Moral +10, Mentalität +1 durch die vertraute Umgebung",
        ],
      },
    };
  }

  if (choiceId === "fight") {
    player.clubRelation = clamp(player.clubRelation + 15, 0, 100);
    player.morale = clamp(player.morale + 8, 0, 100);
    player.consecutiveBenchSeasons = Math.floor(player.consecutiveBenchSeasons / 2);
    player.wantsTransfer = false;
    const text = `${player.name} kämpft entschlossen um eine zweite Chance bei ${player.club.name}.`;
    player.log.push({ season: 0, age: player.age, text, kind: "positive" });
    return {
      feedback: { choiceId, text, kind: "positive", deltaLines: ["Vereinsbeziehung +15", "Moral +8", "Bankphasen-Druck sinkt"] },
    };
  }

  const clubId = choiceId.replace(/^club-/, "");
  const oldCountryId = player.country;
  // Erst in der Heimatliga suchen; steckt der Verein in keiner gecachten Auslandsliga,
  // ist es ein Auslandswechsel - die Ziel-Liga wird dann zur neuen aktiven Liga.
  let targetLeague = league;
  let chosen = findClub(league, clubId);
  let movingCountryId: CountryId | null = null;
  if (!chosen) {
    const prefix = clubId.split("-")[0] as CountryId;
    const foreignLeague = foreignLeagues[prefix];
    if (foreignLeague) {
      chosen = findClub(foreignLeague, clubId);
      if (chosen) {
        targetLeague = foreignLeague;
        movingCountryId = prefix;
      }
    }
  }
  if (!chosen) {
    const text = `${player.name} bleibt vorerst bei ${player.club.name}.`;
    return { feedback: { choiceId, text, kind: "info", deltaLines: [] } };
  }

  const overall = overallRating(player);
  const oldName = player.club.name;
  const oldStrength = player.club.strength;
  const wageCountryId = movingCountryId ?? player.country;
  player.club = { clubId: chosen.id, name: chosen.city, country: targetLeague.countryName, tier: chosen.tier, strength: chosen.strength };
  const wage = estimateWage(overall, player.reputation, chosen, wageCountryId);
  const promisedRole = squadRoleForOverall(overall, chosen.strength);
  // Das in der Angebots-Vorschau gezeigte Einsatzminuten-Versprechen (siehe
  // `buildClubOfferEvent`) wird hier tatsächlich ausgewürfelt: je größer der
  // Sprung zwischen eigener Stärke und Vereinsniveau, desto eher bleibt es ein
  // Lippenbekenntnis und die tatsächliche Rolle fällt eine Stufe niedriger aus.
  const promiseChance = rolePromiseChance(overall, chosen.strength);
  const promiseKept = rng() < promiseChance;
  const newRole = promiseKept ? promisedRole : roleOneStepDown(promisedRole);
  player.contract = { club: chosen.city, yearsLeft: 3, wagePerYear: wage, squadRole: newRole };
  player.clubRelation = promiseKept ? 60 : 45;
  if (!promiseKept) player.morale = clamp(player.morale - 8, 0, 100);
  player.wantsTransfer = false;
  player.consecutiveBenchSeasons = 0;
  // Eine vertragliche Stammplatzgarantie war an den ALTEN Vertrag gebunden - sie
  // reist nicht mit zum neuen Verein (siehe `startingRoleGuaranteeSeasons`,
  // garantiert dort ausschließlich "Stammspieler", was nicht zu jedem hier
  // versprochenen Rollenniveau passen würde).
  player.startingRoleGuaranteeSeasons = 0;
  if (reason !== "pro-debut") player.clubChangesCount += 1;

  // Auslandswechsel: die bisherige Heimatliga wandert (mit ihrem aktuellen Stand)
  // in den Cache, die Zielliga wird die neue aktive Liga - und bleibt es, bis der
  // Spieler erneut ins Ausland wechselt.
  let newActiveLeague: LeagueState | undefined;
  if (movingCountryId) {
    foreignLeagues[player.country] = league;
    delete foreignLeagues[movingCountryId];
    player.country = movingCountryId;
    newActiveLeague = targetLeague;
  }

  const leagueLabel = leagueNameForTier(targetLeague, chosen.tier);

  const kind: LogEntry["kind"] = reason === "pro-debut" ? "milestone" : reason === "pressure" ? "negative" : "positive";
  const text =
    reason === "pro-debut"
      ? `${player.name} unterschreibt den ersten Profivertrag bei ${chosen.city} (${leagueLabel}).`
      : movingCountryId
      ? `${player.name} wagt den Auslandswechsel von ${oldName} zu ${chosen.city} (${targetLeague.flag} ${targetLeague.countryName}, ${leagueLabel}).`
      : `${player.name} wechselt von ${oldName} zu ${chosen.city} (${leagueLabel}).`;
  player.log.push({ season: 0, age: player.age, text, kind });

  // Ergebnis des Einsatzminuten-Versprechens als eigener Log-Eintrag - klar
  // getrennt von der reinen Wechsel-Meldung, damit sichtbar wird, WARUM die
  // tatsächliche Rolle ggf. von der versprochenen abweicht.
  player.log.push({
    season: 0,
    age: player.age,
    text: promiseKept
      ? `${chosen.city} hält das Einsatzminuten-Versprechen ein - ${player.name} startet als ${newRole}.`
      : `${chosen.city} hält das Einsatzminuten-Versprechen nicht ein - ${player.name} landet zunächst nur als ${newRole} im Kader.`,
    kind: promiseKept ? "positive" : "negative",
  });

  // Vereinsgebundene Ereignis-Reihen enden mit dem Wechsel: der Konkurrent aus
  // dem "Rivalität im Kabinenflur"-Duell, der Trainer aus "Zoff mit dem
  // Trainer" und der Status als "Vereinsikone" bleiben allesamt beim alten
  // Verein zurück - sie reisen nicht mit. Ohne diese Bereinigung würde die
  // nächste Storyline-Stufe inhaltlich keinen Sinn mehr ergeben (Rivale/
  // Trainer beim neuen Verein, Vereinstreue-Geschichte bei einem Verein, den
  // man gerade verlassen hat). Wird NICHT als abgeschlossen markiert, damit
  // z.B. eine neue Rivalität am neuen Verein später wieder entstehen kann.
  const CLUB_BOUND_STORYLINES = new Set(["rivalitaet", "trainerzoff", "ikone"]);
  const endedThreads = player.activeStorylines.filter((t) => CLUB_BOUND_STORYLINES.has(t.storylineId));
  if (endedThreads.length > 0) {
    player.activeStorylines = player.activeStorylines.filter((t) => !CLUB_BOUND_STORYLINES.has(t.storylineId));
    for (const thread of endedThreads) {
      player.log.push({
        season: 0,
        age: player.age,
        text: `Mit dem Wechsel weg von ${oldName} endet auch "${thread.label}" - zurückgelassen beim alten Verein.`,
        kind: "info",
      });
    }
  }

  const deltaLines = [
    `Neuer Verein: ${chosen.city}`,
    `Land: ${targetLeague.flag} ${targetLeague.countryName}`,
    `Liga: ${leagueLabel}`,
    `Gehalt: ${formatMoney(wage)} / Jahr`,
    `Rolle im Kader: ${newRole}`,
    promiseKept
      ? `Einsatzminuten-Versprechen eingehalten (${Math.round(promiseChance * 100)}% Chance)`
      : `Einsatzminuten-Versprechen NICHT eingehalten (${Math.round(promiseChance * 100)}% Chance verpasst) - Vereinsbeziehung startet niedriger`,
  ];

  // Ein Wechsel zu einem spürbar stärkeren Verein UND/ODER einer angeseheneren Liga
  // (UEFA-Koeffizient-Rang der COUNTRIES-Liste) bringt sofort ein besseres
  // Trainingsumfeld mit - nicht nur eine höhere Zahl auf dem Papier: kleiner
  // sofortiger Attributschub plus beschleunigtes Wachstum für die nächsten
  // Saisons (siehe `ageUpPlayer`).
  const strengthGap = chosen.strength - oldStrength;
  const prestigeGap = movingCountryId ? leaguePrestigeRank(oldCountryId) - leaguePrestigeRank(movingCountryId) : 0;
  const upgradeSignal = strengthGap + prestigeGap * 5;
  if (upgradeSignal > 3) {
    const bumpKeys = ATTRIBUTE_KEYS.filter(() => rng() < 0.5);
    for (const key of bumpKeys.length > 0 ? bumpKeys : [ATTRIBUTE_KEYS[0]]) {
      player.attributes[key] = clamp(player.attributes[key] + 1, 1, 99);
    }
    player.trainingBoostSeasons = Math.max(player.trainingBoostSeasons, upgradeSignal > 15 ? 3 : 2);
    deltaLines.push(
      prestigeGap > 0
        ? "Besseres Trainingsumfeld in einer angeseheneren Liga: Wachstum für die nächsten Saisons spürbar beschleunigt"
        : "Besseres Trainingsumfeld: Wachstum für die nächsten Saisons spürbar beschleunigt"
    );
  } else if (upgradeSignal < -3) {
    deltaLines.push("Schwächerer Verein/Liga, dafür bessere Aussichten auf Spielzeit");
  }

  // Auslandswechsel-Risiko: Sprache, Kultur und ein neues Spielsystem sind nicht immer
  // sofort ein Selbstläufer - mentalitätsstarke, intelligente und arbeitsame Spieler
  // kommen im Schnitt schneller an, aber auch sie sind nicht komplett davor gefeit.
  if (movingCountryId) {
    const adaptability = (player.attributes.mentalitaet + player.attributes.intelligenz) / 2 + player.traits.arbeitsmoral * 0.2;
    const thriveChance = clamp(0.2 + adaptability / 300, 0.15, 0.5);
    const struggleChance = clamp(0.35 - adaptability / 400, 0.15, 0.4);
    const roll = rng();
    if (roll < thriveChance) {
      player.morale = clamp(player.morale + 10, 0, 100);
      player.reputation = clamp(player.reputation + 4, 0, 100);
      deltaLines.push("🌍 Sofort angekommen: Der Start im neuen Land gelingt beeindruckend schnell");
      player.log.push({ season: 0, age: player.age, text: `${player.name} kommt im neuen Land sofort blendend zurecht.`, kind: "positive" });
    } else if (roll < thriveChance + struggleChance) {
      player.morale = clamp(player.morale - 8, 0, 100);
      player.fitness = clamp(player.fitness - 3, 0, 100);
      player.clubRelation = clamp(player.clubRelation - 5, 0, 100);
      deltaLines.push("🌍 Eingewöhnungsschwierigkeiten: Sprache, Kultur und Spielsystem sind erstmal ungewohnt");
      player.log.push({ season: 0, age: player.age, text: `${player.name} kämpft im neuen Land zunächst mit der Eingewöhnung.`, kind: "negative" });
    }

    if (player.relationshipStatus !== "single") {
      const partnerLabel = player.partnerName ?? "Der Partner";
      if (rng() < 0.6) {
        player.morale = clamp(player.morale + 3, 0, 100);
        deltaLines.push(`${partnerLabel} zieht mit und gibt Rückhalt beim Neustart`);
      } else {
        player.morale = clamp(player.morale - 3, 0, 100);
        deltaLines.push(`${partnerLabel} tut sich mit dem Umzug zunächst schwer`);
      }
    }
  }

  return { feedback: { choiceId, text, kind, deltaLines }, newActiveLeague };
}

// ---------------------------------------------------------------------------
// Karriereende
// ---------------------------------------------------------------------------

/**
 * Fasst `seasonHistory` zu zusammenhängenden Vereins-Zeiträumen zusammen - für den
 * kompakten Karriereverlauf am Karriereende (nur Verein, Altersspanne, Ø-Saisonbilanz,
 * bewusst ohne Gehalt/Land/Liga-Details, die im laufenden Spiel schon sichtbar waren).
 */
export function buildClubTenures(player: Player): ClubTenure[] {
  const tenures: ClubTenure[] = [];
  for (const s of player.seasonHistory) {
    const last = tenures[tenures.length - 1];
    if (last && last.club === s.club) {
      last.toAge = s.age;
      last.seasons += 1;
      last.avgScore += s.score;
    } else {
      tenures.push({ club: s.club, fromAge: s.age, toAge: s.age, seasons: 1, avgScore: s.score });
    }
  }
  for (const t of tenures) {
    t.avgScore = Math.round(t.avgScore / t.seasons);
  }
  return tenures;
}

export function shouldOfferRetirement(player: Player): boolean {
  if (player.age >= 39) return true;
  if (player.age < 32) return false;
  const overall = overallRating(player);
  const peakOverall = Math.round(
    ATTRIBUTE_KEYS.reduce((s, k) => s + player.potential[k] * POSITION_WEIGHTS[player.position][k], 0)
  );
  return overall < peakOverall * 0.72 || player.fitness < 55;
}

export function computeLegacy(player: Player): { score: number; tier: string; factors: ScoreFactor[] } {
  const t = player.careerTotals;
  const avgRatingOverall =
    player.seasonHistory.length > 0
      ? player.seasonHistory.reduce((s, x) => s + x.avgRating, 0) / player.seasonHistory.length
      : 6;

  const factors: ScoreFactor[] = [
    { label: "Tore", points: t.goals * 4 },
    { label: "Vorlagen", points: Math.round(t.assists * 2.5) },
    { label: "Titel", points: t.trophies.length * 40 },
    { label: "Länderspiele", points: player.nationalTeamCaps * 6 },
    { label: "Ø Bewertung Karriere", points: Math.round(avgRatingOverall * 25) },
    { label: "Bekanntheit", points: player.reputation * 2 },
    { label: "Vermögen", points: Math.round(player.wealth / 5000) },
    { label: "Vereinstreue", points: player.clubChangesCount <= 1 ? 30 : player.clubChangesCount >= 4 ? -20 : 0 },
    { label: "Familie", points: (player.relationshipStatus === "verheiratet" ? 10 : 0) + player.children * 5 },
    { label: "Verletzungshistorie", points: player.totalInjuryWeeks >= 60 ? -30 : player.totalInjuryWeeks <= 10 ? 15 : 0 },
    {
      label: "Charakter & Image",
      points: Math.round(
        (player.traits.arbeitsmoral - 50 + (player.traits.disziplin - 50) + (player.traits.medienimage - 50) + (player.traits.fuehrung - 50)) / 2
      ),
    },
  ];

  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));

  let tier = "Vereinsspieler";
  if (score >= 1600) tier = "Weltklasse-Legende";
  else if (score >= 1000) tier = "Nationale Ikone";
  else if (score >= 600) tier = "Publikumsliebling";
  else if (score >= 300) tier = "Solider Profi";

  return { score, tier, factors };
}

// ---------------------------------------------------------------------------
// Achievements ("Erfolge") - werden am Karriereende einmalig berechnet
// ---------------------------------------------------------------------------

export function computeAchievements(player: Player): Achievement[] {
  const t = player.careerTotals;
  const avgRatingOverall =
    player.seasonHistory.length > 0
      ? player.seasonHistory.reduce((s, x) => s + x.avgRating, 0) / player.seasonHistory.length
      : 6;
  const wasCaptain = player.log.some((e) => e.text.includes("Kapitänsbinde") || e.text.includes("Mannschaftskapitän"));
  const lowMatchSeasons = player.seasonHistory.filter((s) => s.matches < 10).length;

  const defs: { id: string; label: string; description: string; positive: boolean; condition: boolean }[] = [
    { id: "torjaeger", label: "Torjäger", description: "Über 150 Karrieretore erzielt.", positive: true, condition: t.goals >= 150 },
    { id: "vorlagengeber", label: "Vorlagengeber", description: "Über 100 Karrierevorlagen aufgelegt.", positive: true, condition: t.assists >= 100 },
    { id: "titelsammler", label: "Titelsammler", description: "Mindestens 5 Titel gewonnen.", positive: true, condition: t.trophies.length >= 5 },
    { id: "weltklasse", label: "Weltklasse-Niveau", description: "Karriere-Ø-Bewertung von mindestens 7,5.", positive: true, condition: avgRatingOverall >= 7.5 },
    { id: "nationalspieler", label: "Nationalspieler", description: "20 oder mehr Länderspiele bestritten.", positive: true, condition: player.nationalTeamCaps >= 20 },
    { id: "vereinstreue", label: "Vereinstreue", description: "Höchstens ein Vereinswechsel in der ganzen Karriere.", positive: true, condition: player.clubChangesCount <= 1 },
    { id: "millionaer", label: "Selfmade-Millionär", description: "Über 2 Mio. € Karrierevermögen erwirtschaftet.", positive: true, condition: player.wealth >= 2_000_000 },
    { id: "gebildet", label: "Kluger Kopf", description: "Hohes Bildungsniveau (80+) neben dem Profialltag gepflegt.", positive: true, condition: player.education >= 80 },
    { id: "familienmensch", label: "Familienmensch", description: "Verheiratet mit mindestens einem Kind.", positive: true, condition: player.relationshipStatus === "verheiratet" && player.children >= 1 },
    { id: "kapitaen", label: "Führungsspieler", description: "Wurde zum Mannschaftskapitän ernannt.", positive: true, condition: wasCaptain },
    { id: "nationalkapitaen", label: "Nationalmannschaftskapitän", description: "Führte die Nationalmannschaft aufs Feld.", positive: true, condition: player.nationalTeamCaptain },
    { id: "individuelle_krone", label: "Individuelle Krönung", description: "Mindestens einmal als Torschützenkönig oder Spieler der Saison ausgezeichnet.", positive: true, condition: t.trophies.some((tr) => tr === "Torschützenkönig" || tr === "Spieler der Saison") },
    { id: "geschichtenerzaehler", label: "Bewegte Karriere", description: "Mindestens drei mehrjährige Geschichten bis zum Ende durchlebt.", positive: true, condition: player.completedStorylines.length >= 3 },
    { id: "verletzungsanfaellig", label: "Verletzungsanfällig", description: "Über 60 Wochen der Karriere verletzt ausgefallen.", positive: false, condition: player.totalInjuryWeeks >= 60 },
    { id: "vielwechsler", label: "Vielwechsler", description: "Vier oder mehr Vereinswechsel - nie richtig sesshaft geworden.", positive: false, condition: player.clubChangesCount >= 4 },
    { id: "kartenkoenig", label: "Kartenkönig", description: "Über 80 Gelbe Karten oder 5 Platzverweise kassiert.", positive: false, condition: t.yellowCards >= 80 || t.redCards >= 5 },
    { id: "bankdruecker", label: "Bankdrücker", description: "In mindestens 5 Saisons kaum zum Einsatz gekommen.", positive: false, condition: lowMatchSeasons >= 5 },
    {
      id: "knapp_bei_kasse",
      label: "Knapp bei Kasse",
      description: "Trotz langer Karriere kaum finanziellen Polster aufgebaut.",
      positive: false,
      condition: player.age - player.birthAge >= 10 && player.wealth < 5000,
    },
    { id: "vorbild_kabine", label: "Vorbild der Kabine", description: "Herausragende Arbeitsmoral über die gesamte Karriere.", positive: true, condition: player.traits.arbeitsmoral >= 85 },
    { id: "eisern_diszipliniert", label: "Eisern diszipliniert", description: "Vorbildliche Disziplin abseits des Platzes.", positive: true, condition: player.traits.disziplin >= 85 },
    { id: "medienliebling", label: "Medienliebling", description: "Bei Fans und Presse gleichermaßen beliebt.", positive: true, condition: player.traits.medienimage >= 85 },
    { id: "fuehrungsnatur", label: "Führungsnatur", description: "In jeder Kabine ein natürlicher Anführer gewesen.", positive: true, condition: player.traits.fuehrung >= 85 },
    { id: "kontroverse_figur", label: "Kontroverse Figur", description: "Immer wieder für Negativschlagzeilen abseits des Platzes gesorgt.", positive: false, condition: player.traits.disziplin <= 20 },
    { id: "medienschreck", label: "Medienschreck", description: "Nie ein entspanntes Verhältnis zur Presse gefunden.", positive: false, condition: player.traits.medienimage <= 20 },
  ];

  return defs.filter((d) => d.condition).map(({ condition: _condition, ...rest }) => rest);
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
