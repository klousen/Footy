import type {
  Achievement,
  Attributes,
  AttributeKey,
  CareerNarrativeState,
  CareerPhenotype,
  CareerPhenotypeResult,
  CareerStage,
  ChoiceFeedback,
  ClubState,
  ClubTenure,
  DecisionImpact,
  EventChoice,
  GameEvent,
  GameState,
  LeagueState,
  LoanDecisionLogEntry,
  LogEntry,
  NationalCupResult,
  OfferCardData,
  Player,
  Position,
  NarrativeTrend,
  ScoreFactor,
  SeasonStats,
  SquadRole,
  TraitKey,
  TransferDecisionEntry,
  TransferDecisionType,
} from "./types";
import { isNearRetirement, overallRatingFromAttributes } from "./types";
import { clamp } from "./data";
import { ATTRIBUTE_LABEL, ATTRIBUTE_ORDER, formatMoney, RELATIONSHIP_LABEL, SQUAD_ROLE_RANK, TRAIT_LABEL, TRAIT_ORDER } from "./labels";
import { eligibleTemplates, getTemplateById, EVENT_TEMPLATES } from "./events";
import {
  computeLoanSummaryTier,
  deriveLoanReason,
  loanClubKeepChance,
  LOAN_DECISIONS,
  LOAN_DECISION_TEMPLATE_IDS,
  resolveLoanDecision,
} from "./loanStory";
import { COUNTRIES, type CountryId } from "./leagues";
import {
  buildLeagueState,
  buildTableSnapshot,
  clubCoefficient,
  clubLeagueRank,
  displayClubStrength,
  findClub,
  leagueNameForTier,
  leaguePrestigeRank,
  pickClubNearStrength,
  pickDistinctClubOffers,
  pickSpreadClubOffers,
  simulateLeaguePromotionRelegation,
} from "./leagueEngine";
import { advanceEuropeanLeagueDrift, computeSeasonEuropeanCupResult } from "./europeanCup";
import { computeSeasonNationalCupResult } from "./nationalCup";

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

/**
 * Verdeckter Entwicklungs-Multiplikator (siehe `Player.developmentTrajectory`) -
 * der zentrale Hebel für eine breite Ausschöpfungsverteilung (Bust bis
 * außergewöhnlicher Overperformer), UNABHÄNGIG vom gewürfelten Potenzial selbst.
 * Summe dreier Gleichverteilungen statt einer einzelnen (zentraler Grenzwertsatz)
 * ergibt eine glockenförmige statt einer flachen Verteilung um die Mitte - die
 * meisten Spieler entwickeln sich "normal", echte Ausreißer nach oben/unten
 * bleiben selten, aber möglich.
 *
 * Ein Wunderkind bekommt NUR eine kleine garantierte Bodenerhöhung plus eine
 * Chance (nicht Garantie!) auf einen deutlichen Zusatzschub - bewusst so, dass
 * ein Wunderkind bei Pech in der Entwicklung trotzdem scheitern kann (siehe
 * Vorgabe: "Ein Spieler mit 94 Potential kann scheitern").
 */
function rollDevelopmentTrajectory(wonderkind: boolean): number {
  const avg = (rng() + rng() + rng()) / 3; // 0..1, glockenförmig um 0.5
  // Mittelwert bewusst UNTER 1.0 (statt symmetrisch um 1.0) - das reine
  // Wachstumsmodell (proportionales Annähern über ~16 Wachstums-Saisons, siehe
  // `growthRate`/`ageUpPlayer`) konvergiert bei Trajektorie 1.0 in Kombination mit
  // guter Kaderrolle (siehe dort) bereits sehr nah ans Potenzial - eine echte
  // Streuung von Bust bis Overperformer braucht einen niedrigeren Mittelwert,
  // kalibriert über `sim_engine_backtest.ts` (siehe dort für Zielverteilung).
  let trajectory = 0.15 + avg * 0.85; // ~0.15 .. 1.0, Mittel ~0.58
  if (wonderkind) {
    trajectory += 0.1;
    if (rng() < 0.55) trajectory += 0.2 + rng() * 0.25;
  }
  return clamp(trajectory, 0.12, 1.55);
}

/**
 * Verdeckter Produktions-Zuverlässigkeits-Hebel (siehe `Player.productionReliability`) -
 * BEWUSST über einen komplett eigenen, unabhängigen Zufallswurf ermittelt (keine
 * Ableitung aus Potenzial/Trajektorie/Attributen), damit er strukturell NICHT mit
 * der OVR-Entwicklung korreliert - genau das macht "hoher OVR, aber chronisch
 * enttäuschende Leistung" bzw. "niedrigerer OVR, aber außergewöhnliche Leistung"
 * erst möglich (siehe `productionFactor` in `simulateSeason`). Symmetrisch um 1.0
 * (glockenförmig via Summe dreier Gleichverteilungen, wie `rollDevelopmentTrajectory`),
 * da hier - anders als bei der Entwicklung - kein struktureller Grund für einen
 * abweichenden Mittelwert besteht (Über- und Unterperformance sollen beide echte,
 * nicht künstlich unterdrückte Ausschläge sein).
 */
function rollProductionReliability(): number {
  const avg = (rng() + rng() + rng()) / 3; // 0..1, glockenförmig um 0.5
  return clamp(0.4 + avg * 1.2, 0.4, 1.6); // ~0.4 .. 1.6, Mittel 1.0
}

/**
 * Attribut-Profile ("Archetypen") - sorgen dafür, dass zwei Spieler mit
 * identischem Start-OVR trotzdem unterschiedlich aussehen können (Techniker vs.
 * Athlet vs. Spielmacher), statt dass die Attribute nur unabhängig um denselben
 * Mittelwert streuen. Wirkt auf `potential` (voller Ausschlag) UND leicht
 * abgeschwächt schon auf die Start-Attribute (frühe Anzeichen, siehe
 * `createPlayer`) - "Allrounder" bleibt bewusst ungeskewt als vierte,
 * gleichwahrscheinliche Option, damit nicht JEDER Spieler ein auffälliges
 * Profil aufgezwungen bekommt.
 */
type AttributeArchetype = "techniker" | "athlet" | "spielmacher" | "allrounder";
const ARCHETYPE_SKEW: Record<AttributeArchetype, Partial<Record<AttributeKey, number>>> = {
  techniker: { technik: 8, intelligenz: 3, physis: -7, tempo: -1 },
  athlet: { tempo: 8, physis: 8, technik: -7, intelligenz: -3 },
  spielmacher: { mentalitaet: 7, intelligenz: 6, physis: -6, tempo: -2 },
  allrounder: {},
};
function rollAttributeArchetype(): AttributeArchetype {
  const pool: AttributeArchetype[] = ["techniker", "athlet", "spielmacher", "allrounder"];
  return pool[Math.floor(rng() * pool.length)];
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

  // Attribut-Archetyp (siehe `ARCHETYPE_SKEW`): sorgt für unterschiedliche
  // Profile bei gleichem Start-OVR (Techniker/Athlet/Spielmacher/Allrounder) -
  // wirkt auf das Potenzial in voller Stärke, auf die Start-Attribute weiter
  // unten nur leicht abgeschwächt (frühe Anzeichen, kein fertiges Profil mit 14).
  const archetype = rollAttributeArchetype();
  const archetypeSkew = ARCHETYPE_SKEW[archetype];
  for (const key of ATTRIBUTE_KEYS) {
    const skew = archetypeSkew[key];
    if (skew) potential[key] = clamp(potential[key] + skew, 40, 99);
  }

  // Seltener "Wunderkind"-Bonus: ein echtes Jahrhunderttalent, das eine
  // realistische Chance auf eine absolute Top-Karriere mitbringt. Bewusst
  // KLEINER als früher (war: pauschal +6..12 auf ALLE Attribute) - ein
  // Wunderkind soll sich vor allem über `developmentTrajectory` (siehe unten:
  // schnellere/zuverlässigere Entwicklung, siehe `rollDevelopmentTrajectory`)
  // von einem Standardtalent abheben, nicht schon am Tag 1 durch ein
  // automatisch höheres Potenzial - "ein Wunderkind soll nicht automatisch
  // Weltklasse werden".
  const wonderkind = rng() < 0.08;
  if (wonderkind) {
    for (const key of ATTRIBUTE_KEYS) {
      potential[key] = clamp(potential[key] + randInt(3, 8), 0, 99);
    }
  }
  const developmentTrajectory = rollDevelopmentTrajectory(wonderkind);
  const productionReliability = rollProductionReliability();

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
  // Archetyp-Skew leicht abgeschwächt (Faktor ~0.4) auch auf die Start-Attribute -
  // ein 14-jähriger Techniker zeigt schon erste technische Ansätze, ohne dass
  // seine Physis jetzt schon komplett unterentwickelt wäre.
  for (const key of ATTRIBUTE_KEYS) {
    const skew = archetypeSkew[key];
    if (skew) base[key] = clamp(Math.round(base[key] + skew * 0.4), 8, 40);
  }

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
      homeCountryId: countryId,
      position,
      birthAge: 14,
      age: 14,
      attributes: base,
      attributesAtSeasonStart: { ...base },
      traitsAtSeasonStart: { arbeitsmoral: 50, disziplin: 50, medienimage: 50, fuehrung: 50 },
      potential,
      growthCarry: {},
      developmentTrajectory,
      productionReliability,
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
      careerTotals: {
        matches: 0,
        goals: 0,
        assists: 0,
        trophies: [],
        yellowCards: 0,
        redCards: 0,
        caps: 0,
        cleanSheets: 0,
        penaltiesSaved: 0,
        bigChancesPrevented: 0,
        progressiveActions: 0,
      },
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
      playedAbroad: false,
      loanActive: false,
      loanReturnClub: null,
      loanReturnCountryId: null,
      totalInjuryWeeks: 0,
      cupExitThisSeason: false,
      relationshipStatus: "single",
      partnerName: null,
      exPartnerName: null,
      children: 0,
      traits: { arbeitsmoral: 50, disziplin: 50, medienimage: 50, fuehrung: 50 },
      activeStorylines: [],
      completedStorylines: [],
      trainingBoostSeasons: 0,
      unlockedAchievementIds: [],
      definingMoment: null,
      edeljokerLocked: false,
      formSlumpSeasons: 0,
      secondSpringSeasons: 0,
      loanNarrative: null,
      transferDecisions: [],
      ceilingBreaks: [],
      nationalTeamCandidacySeasons: 0,
      activeNarrativeThread: null,
      narrativeHistory: [],
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
  return overallRatingFromAttributes(p.attributes, p.position);
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
      // "Zweiter Frühling" (siehe `applyEffects`): nach einer kinderlosen Trennung
      // sind "neue Beziehung"-Templates (exclusiveGroup "beziehung_start") für
      // einige Saisons deutlich wahrscheinlicher.
      const secondSpringFactor =
        t.exclusiveGroup === "beziehung_start" && player.secondSpringSeasons > 0 ? 3 : 1;
      // Kontextabhängiger Gewichts-Multiplikator (siehe `EventTemplate.dynamicWeight`,
      // "CAREER NARRATIVE ... TECHNISCHE VERANKERUNG" Abschnitt 10/11/17/18) - macht
      // ein Event bei passendem Karrierezustand wahrscheinlicher, OHNE es je zu
      // erzwingen (bleibt Teil derselben gewichteten Auswahl). Neutral (Faktor 1),
      // wenn kein `dynamicWeight` definiert ist.
      const dynamicFactor = t.dynamicWeight ? Math.max(0, t.dynamicWeight(player)) : 1;
      return t.weight * categoryFactor * recencyFactor * categoryRecencyFactor * injuryFocusFactor * secondSpringFactor * dynamicFactor;
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
    // Exklusivgruppe: kein zweites Template DERSELBEN Gruppe darf in dieser
    // Saison noch gezogen werden - verhindert z.B. zwei "neue Beziehung"-
    // Events in derselben Saison (beide wären beim Auswählen noch gültig
    // gewesen, weil der Spieler zu diesem Zeitpunkt noch "single" war -
    // siehe Bugreport: zwei Partnerinnen in derselben Saison ohne Trennung
    // dazwischen).
    if (template.exclusiveGroup) {
      for (let j = localPool.length - 1; j >= 0; j--) {
        if (localPool[j].exclusiveGroup === template.exclusiveGroup) localPool.splice(j, 1);
      }
    }
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
  const quietWeekFallback = (): GameEvent => ({
    id: `fallback-${player.age}-${Math.round(rng() * 1e6)}`,
    templateId: id,
    category: "meilenstein",
    title: "Ruhige Woche",
    description: `Bei ${player.club.name} verläuft die Woche ereignislos.`,
    choices: [{ id: "ok", label: "Weiter", effects: {} }],
  });
  const template = getTemplateById(id);
  if (!template) {
    // Sollte praktisch nie vorkommen, aber sicherheitshalber ein neutraler Fallback
    return quietWeekFallback();
  }
  // Fortsetzungs-Stufen tragen ihren Kontext (z.B. Namen) im passenden StoryThread.
  const thread = player.activeStorylines.find((t) => t.nextTemplateId === id);
  // Sicherheitsnetz: `condition` wurde nur EINMAL zu Saisonbeginn geprüft (siehe
  // `pickSeasonTemplateIds`) - ein FRÜHERES Event derselben Saison kann den
  // Spielerzustand seither verändert haben (z.B. eine Trennung), wodurch ein
  // schon gewähltes Template inhaltlich nicht mehr passt (z.B. ein zweites
  // "neue Beziehung"-Event, obwohl der Spieler durch das erste bereits wieder
  // vergeben ist). Garantierte Storyline-Fortsetzungen (`thread` gesetzt) sind
  // davon ausgenommen - die laufen unabhängig von `condition`.
  if (!thread && template.condition && !template.condition(player)) {
    return quietWeekFallback();
  }
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

/**
 * Fitness darf nie höher liegen, als es eine noch laufende Verletzung zulässt - eine
 * "100% Fitness"-Anzeige direkt neben "Verletzt: Kreuzbandriss, noch 38 Wochen
 * Ausfallzeit" ist ein offensichtlicher Widerspruch (Bugreport). Je mehr Wochen
 * Ausfallzeit noch anstehen, desto tiefer die Obergrenze - eine frische schwere
 * Verletzung (30+ Wochen) drückt sie auf knapp über 10%, eine fast auskurierte
 * Blessur (wenige Wochen) kaum merklich. Wird nach JEDER Änderung an Fitness/
 * Verletzung angewendet (`applyEffects`, `ageUpPlayer`), nicht nur direkt beim
 * Verletzungs-Event selbst - sonst könnte z.B. die pauschale Sommerpausen-Erholung
 * oder ein unabhängiger Fitness-Bonus die Obergrenze wieder aushebeln, während die
 * Verletzung noch längst nicht auskuriert ist.
 */
function applyInjuryFitnessCeiling(player: Player) {
  if (!player.injury || player.injury.weeksOut <= 0) return;
  const ceiling = clamp(Math.round(100 - player.injury.weeksOut * 2.2), 10, 100);
  player.fitness = Math.min(player.fitness, ceiling);
}

function applyEffects(player: Player, effects: EventChoice["effects"], season: number) {
  if (effects.attributes) {
    for (const key of Object.keys(effects.attributes) as AttributeKey[]) {
      const delta = effects.attributes[key] ?? 0;
      // Deckelt regulär am `potential` (siehe "CAREER NARRATIVE ... TECHNISCHE
      // VERANKERUNG" Abschnitt 20/23-24) - ein normaler Entscheidungs-Effekt kann
      // das Potential NICHT mehr überschreiten, das war vorher ein unbeabsichtigter
      // Nebeneffekt (siehe Diagnose Teil F). Der EINZIGE Weg über das Potential
      // hinaus ist jetzt der explizite `effects.ceilingBreak` weiter unten, der
      // `potential` selbst anhebt, bevor diese Grenze hier greift.
      const cap = Math.min(99, player.potential[key]);
      player.attributes[key] = clamp(player.attributes[key] + delta, 1, cap);
    }
  }
  if (effects.ceilingBreak) {
    for (const key of Object.keys(effects.ceilingBreak) as AttributeKey[]) {
      const amount = effects.ceilingBreak[key] ?? 0;
      if (amount <= 0) continue;
      player.potential[key] = clamp(player.potential[key] + amount, 1, 99);
      player.attributes[key] = clamp(player.attributes[key] + amount, 1, player.potential[key]);
      player.ceilingBreaks.push({ season, age: player.age, attribute: key, amount });
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
  // "Zweiter Frühling": jede Trennung (relationshipStatus -> "single") OHNE
  // Kinder erhöht für einige Saisons die Chance, eine neue Partnerin/einen
  // neuen Partner zu finden (siehe `pickSeasonTemplateIds`, exclusiveGroup
  // "beziehung_start") - zentral hier statt in jedem einzelnen Trennungs-Event
  // einzeln, damit sich der Effekt automatisch auf JEDE Trennung anwendet
  // (auch künftige Events), nicht nur auf die, bei denen es explizit
  // eingebaut wurde.
  if (effects.relationshipStatus === "single" && player.children === 0) {
    player.secondSpringSeasons = Math.max(player.secondSpringSeasons, 3);
  }
  if (effects.partnerName !== undefined) player.partnerName = effects.partnerName;
  if (effects.exPartnerName !== undefined) player.exPartnerName = effects.exPartnerName;
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
  if (effects.squadRoleOverride) {
    // Zentraler Schutz statt Position-Check in jedem einzelnen Event: Torhüter
    // kennen keine "Rotation"/"Ergänzungsspieler"-Zwischenstufe (siehe
    // `squadRoleForOverall`) - ein generisches Event (z.B. "Stammplatz verloren"),
    // das diese Stufe setzen will, landet für einen Torwart stattdessen direkt
    // bei "Ersatzbank". "Stammspieler"/"Ausbildungsspieler"/"Ersatzbank" bleiben
    // für alle Positionen unverändert gültig.
    const override = effects.squadRoleOverride;
    player.contract.squadRole =
      player.position === "TW" && (override === "Rotation" || override === "Ergänzungsspieler") ? "Ersatzbank" : override;
  }
  // Direkter Sprung vom Jugend- in den Profikader (siehe "jugend_amateurentdeckung_1") -
  // ohne den überhaupt nie passierten Weg über das reguläre Profidebüt-Event, deshalb
  // hier die Vertrags-/Gehaltslogik direkt nachgebildet statt auf `applyClubOfferChoice`
  // zu warten. Bewusst eine bescheidene Startrolle (weit unter Vereinsstärke), da der
  // Sprung Jahre früher als üblich passiert - kein geschütztes Startelf-Versprechen.
  if (effects.earlyProDebut) {
    const overall = overallRating(player);
    // Kein Liga-Rang verfügbar (diese Funktion kennt hier keine `LeagueState`) -
    // vernachlässigbar für eine erste, bescheidene Vertragssumme.
    const wage = estimateWage(overall, player.reputation, player.club, player.country);
    player.contract = {
      club: player.club.name,
      yearsLeft: 2,
      wagePerYear: Math.max(6000, Math.round(wage * 0.6)),
      squadRole: squadRoleForOverall(overall, player.club.strength, player.position),
    };
  }
  if (effects.definingMoment) player.definingMoment = effects.definingMoment;
  if (effects.edeljokerLocked) player.edeljokerLocked = true;
  if (effects.formSlumpSeasons) {
    player.formSlumpSeasons = Math.max(player.formSlumpSeasons, effects.formSlumpSeasons);
  }
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
  if (effects.cupExit) player.cupExitThisSeason = true;
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
  applyInjuryFitnessCeiling(player);
}

/** Übersetzt die angewendeten Effekte einer Entscheidung in lesbare Feedback-Zeilen.
 * `player` optional (nur für die positionsabhängige Kaderrollen-Anzeige nötig, siehe
 * `squadRoleLabel`) - muss NACH `applyEffects` übergeben werden, damit
 * `player.contract.squadRole` bereits den tatsächlich angewendeten (ggf. für
 * Torhüter auf "Ersatzbank" abgebildeten) Wert zeigt statt des rohen, ggf. gar
 * nicht so übernommenen `effects.squadRoleOverride`. */
export function summarizeEffects(effects: EventChoice["effects"], player?: Player): string[] {
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
  if (effects.squadRoleOverride) {
    lines.push(`Neue Kaderrolle: ${player ? squadRoleLabel(player.contract.squadRole, player.position) : effects.squadRoleOverride}`);
  }
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
// Narratives Leihjahr (siehe loanStory.ts) - eine der drei Leih-Entscheidungen
// auflösen. Bewusst NICHT über die generische `applyChoice` (die Effekte
// stehen erst nach dem Würfelwurf + Momentum fest, siehe `resolveLoanDecision`)
// - die eigentliche Spieler-Mutation läuft aber trotzdem über die exportierte
// `applyChoice`, damit Attribut-/Trait-Clamping, `scaleDecisionAttributeDelta`
// usw. exakt wie bei jedem anderen Event greifen (dieselbe Skalierung, nicht
// nochmal separat nachgebaut).
// ---------------------------------------------------------------------------

export function applyLoanDecisionChoice(
  player: Player,
  seasonNumber: number,
  templateId: string,
  choiceId: string
): ChoiceFeedback {
  const narrative = player.loanNarrative;
  const decisionIndex = LOAN_DECISION_TEMPLATE_IDS.indexOf(templateId);
  if (!narrative || decisionIndex < 0) {
    // Sollte durch die Exklusiv-State-Prüfung in App.tsx nie passieren -
    // sicherheitshalber ein neutraler Fallback statt eines Absturzes.
    return { choiceId, text: "Nichts passiert.", kind: "info", deltaLines: [] };
  }
  const incomingMomentum = { emoji: narrative.momentumEmoji, label: narrative.momentumLabel, modifier: narrative.momentum };
  const resolution = resolveLoanDecision(decisionIndex, choiceId, player.position, incomingMomentum, rng);
  const { roll, outcome, choiceLabel } = resolution;

  applyChoice({ player, seasonNumber } as unknown as GameState, {
    id: choiceId,
    label: choiceLabel,
    effects: outcome.effects,
  });

  narrative.momentum = roll.outgoingMomentum.modifier;
  narrative.momentumEmoji = roll.outgoingMomentum.emoji;
  narrative.momentumLabel = roll.outgoingMomentum.label;

  const logEntry: LoanDecisionLogEntry = {
    decisionTitle: LOAN_DECISIONS[decisionIndex].title,
    choiceLabel,
    raw: roll.raw,
    modifier: roll.incomingMomentum.modifier,
    modifiedRoll: roll.modifiedRoll,
    momentumEmoji: roll.outgoingMomentum.emoji,
    momentumLabel: roll.outgoingMomentum.label,
    resultText: outcome.text,
    resultKind: outcome.kind,
    deltaLabel: outcome.deltaLabel,
  };
  narrative.decisions = [...narrative.decisions, logEntry];

  player.log.push({ season: seasonNumber, age: player.age, text: outcome.text, kind: outcome.kind });

  const diceLine =
    roll.incomingMomentum.modifier !== 0
      ? `🎲 ${roll.raw} ${roll.incomingMomentum.emoji} ${roll.incomingMomentum.label} (${signed(roll.incomingMomentum.modifier)}) → Ergebnis: ${roll.modifiedRoll}`
      : `🎲 ${roll.raw} → Ergebnis: ${roll.modifiedRoll}`;
  const outgoingLine = `${roll.outgoingMomentum.emoji} ${roll.outgoingMomentum.label}`;

  return {
    choiceId,
    text: outcome.text,
    kind: outcome.kind,
    deltaLines: [diceLine, outgoingLine, ...outcome.deltaLabel],
  };
}

// ---------------------------------------------------------------------------
// Saisonsimulation (Spiele im Hintergrund)
// ---------------------------------------------------------------------------

// Weder "Kontinental-Pokal" noch "Landespokal" sind mehr Teil dieses Zufalls-Pools -
// Champions-/Europa-League (europeanCup.ts) UND der nationale Pokal (nationalCup.ts)
// werden jetzt über echte, Elo-basierte Simulationen vergeben, nicht mehr blind
// erwürfelt (siehe unten in `simulateSeason`). "Aufstiegs-Play-off" bleibt für Liga-2
// ein eigener, unabhängiger Zufalls-Slot (siehe unten) - ein separates Konzept
// (Aufstiegschance), keine Pokal-Teilnahme.
const TROPHY_POOL_BY_TIER: Record<number, string[]> = {
  1: ["Meisterschale"],
  2: ["Zweitliga-Meisterschaft"],
};

/** Reihenfolge der Turnierrunden (siehe `europeanCup.ts`) - fürs Gehalts-/
 * Bekanntheits-Bonusstaffel nach Turniertiefe (Index 0 = am frühesten ausgeschieden). */
const EUROPEAN_STAGE_ORDER = ["Ligaphase", "Achtelfinale", "Viertelfinale", "Halbfinale", "Finale", "Champion"];

/** Einheitliches "Saison 2026/27"-Label für eine Saisonnummer - von `simulateSeason`
 * für die abgeschlossene Saison genutzt UND vom Dashboard für die kommende Saison
 * ("Vor Saison X"), damit beide Bildschirme exakt dasselbe Format zeigen. */
export function seasonLabelForNumber(seasonNumber: number): string {
  return `Saison ${2026 + seasonNumber}/${(2026 + seasonNumber + 1).toString().slice(-2)}`;
}

export function simulateSeason(
  player: Player,
  seasonNumber: number,
  league: LeagueState,
  foreignLeagues: Partial<Record<CountryId, LeagueState>>,
  europeanLeagueDrift: Partial<Record<CountryId, number>>
): SeasonStats {
  const overall = overallRating(player);
  const clubStrength = player.club.strength;
  const injuredWeeks = player.injury?.weeksOut ?? 0;
  // Untergrenze bewusst 0, nicht z.B. 0.15: bei einer Ausfallzeit, die (annähernd)
  // eine ganze Saison überspannt (Kreuzbandriss: 32-44 Wochen, siehe events.ts) darf
  // NICHTS an Spielminuten mehr anfallen - eine feste Mindestquote hätte selbst bei
  // laufender monatelanger Verletzung noch ~15% der Saisonspiele gutgeschrieben
  // (Bugreport: Spielminuten dürfen während einer laufenden Ausfallzeit nicht
  // akkumulieren). Für kürzere Ausfälle bleibt die Reduktion weiterhin proportional.
  const availabilityFactor = clamp(1 - injuredWeeks / 38, 0, 1);

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

  // Ob man überhaupt im Kader für ein Spiel steht, hängt neben der Kaderrolle auch
  // vom aktuellen Vertrauen des Trainers ab - bei tiefem Konflikt wird man häufiger
  // komplett aus dem Kader gelassen statt nur früher ausgewechselt, bei gutem
  // Verhältnis öfter berücksichtigt. Deutlich schwächer als der Effekt auf die
  // Minuten PRO Spiel (siehe `trustFactor` unten), aber ein echter, spürbarer Hebel.
  const relationMatchFactor = clamp(0.9 + (player.clubRelation - 50) / 300, 0.8, 1.08);
  const matches = Math.round(baseMatches * roleFactor * availabilityFactor * relationMatchFactor);

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
  // Topform, auch wenn beide formal dieselbe Kaderrolle tragen. Bewusst ein
  // deutlich spürbarer Hebel (nicht nur Nuance) - echter Konflikt mit dem Verein
  // MUSS sich in klar weniger Einsatzminuten niederschlagen, ein gutes Verhältnis
  // in klar mehr.
  const trustFactor = clamp(
    0.8 + (player.clubRelation - 50) / 160 + (player.fitness - 70) / 300,
    0.55,
    1.2
  );
  // Selbst bei unveränderter Kaderrolle (z.B. durch eine Stammplatzgarantie) sind die
  // Einsatzminuten von Saison zu Saison nie exakt identisch - Pokal-Rotation,
  // taktische Ruhephasen und kleinere Blessuren sorgen für echte Schwankung, auch
  // wenn weder Kaderrolle noch Vereinsbeziehung/Fitness sich groß verändern. Eine
  // Stammplatzgarantie heißt also NICHT automatisch immer ~100% der Minuten.
  const seasonMinutesVariance = 0.82 + rng() * 0.36; // ~0.82 - 1.18
  // Pro Match sind maximal 90 Minuten möglich (siehe `possibleMinutes` unten) -
  // der Vertrauensfaktor kann die Einwechselzeit verlängern, aber niemals über
  // die volle Spielzeit hinaus.
  const effectiveMinutesPerMatch = Math.min(90, minutesPerMatchByRole * trustFactor * seasonMinutesVariance);
  const possibleMinutes = baseMatches * 90;
  const minutesPlayed = Math.min(possibleMinutes, Math.round(matches * effectiveMinutesPerMatch));

  const isGoalkeeper = player.position === "TW";
  const attackWeight = { TW: 0.02, IV: 0.15, AV: 0.35, ZM: 0.55, FS: 0.85, ST: 1.0 }[player.position];
  const goalChancePerMatch = (overall / 100) * attackWeight * 0.45;
  const assistChancePerMatch = (overall / 100) * attackWeight * 0.35;
  // Harte Sicherheits-Obergrenze pro Position (Bugreport: 132 Tore in einer
  // einzigen IV-Saison) - die Formel oben ist durch die Attribut-Deckel (1-99)
  // und die festen `attackWeight`-Gewichte bereits rechnerisch auf realistische
  // Werte begrenzt (Stresstest mit maximal möglichen Attributen: IV max. 3,
  // AV max. 6 Tore/Saison), diese Kappung ist zusätzliche Absicherung gegen
  // künftige Formel-Änderungen, die das aus dem Ruder laufen lassen könnten.
  // Grenzen an realen Torquoten von Verteidigern orientiert: Innenverteidiger
  // meist 1-2 Tore/Saison, torgefährliche Ausnahmen 4-7; Außenverteidiger
  // meist 2-5, seltene Ausnahmen (Standard-Schützen) bis 8-15 - jeweils mit
  // Luft nach oben für echte Wunderkinder, die dank hoher Gesamtstärke
  // ohnehin schon die höchste `goalChancePerMatch` innerhalb der Position
  // bekommen, statt einer eigenen Sonderregel.
  const GOAL_CAP: Partial<Record<Position, number>> = { TW: 2, IV: 7, AV: 15, ZM: 30, FS: 45, ST: 50 };
  const goalCap = GOAL_CAP[player.position] ?? Infinity;
  // "Bock oder Flop": EINE gemeinsame Form-Würfelung für Tore UND Vorlagen (statt zwei
  // unabhängiger, siehe Bugreport - sonst könnte eine Saison zufällig torreich, aber
  // vorlagenarm ausfallen, was die "Saison lief einfach nicht"-Identität verwässert).
  // Die Schwankungsbreite skaliert mit `attackWeight` (statt einer festen Spanne für
  // alle Positionen) - Positionen, deren Wert stark an Torgefahr hängt (v.a. Stürmer),
  // leben spürbar stärker von Tagesform/Chancenverwertung als Positionen, deren
  // Torbeteiligung ohnehin nur ein kleiner Teil ihres Werts ist (Torwart/Verteidiger,
  // siehe `productionFactor`/`bigChancesPrevented` dort). Setzt NACH allen Effekten
  // von Verletzungen/Formtiefs/Entscheidungen an (die bestimmen bereits `overall`/
  // `attackWeight`-Basis über `goalChancePerMatch`) - ersetzt sie nicht, streut nur
  // zusätzlich um den bereits durch sie geprägten Erwartungswert.
  const attackFormSpread = 0.3 + attackWeight * 0.5; // TW ~0.31 (kaum Streuung) .. ST 0.8 (echte Bock-/Flop-Saisons)
  const attackFormMultiplier = 1 - attackFormSpread / 2 + rng() * attackFormSpread;
  const goals = Math.min(goalCap, Math.max(0, Math.round(matches * goalChancePerMatch * attackFormMultiplier)));
  const assists = Math.max(0, Math.round(matches * assistChancePerMatch * attackFormMultiplier));

  const form = (player.morale - 50) / 100; // -0.5 .. 0.5

  // Torwart-Statistiken: "weiße Weste" (Zahl) und Paradenquote (%) sind das
  // torwartspezifische Gegenstück zu Toren/Vorlagen bei Feldspielern (die für
  // Torhüter dank `attackWeight.TW` ohnehin praktisch immer bei 0 bleiben) -
  // fließen unten in `productionFactor`/`computeSeasonScore` genauso in
  // Bewertung, Bekanntheit und Gehaltsbonus ein wie Torbeteiligungen bei
  // Feldspielern.
  let cleanSheets = 0;
  let savePercentage = 0;
  let penaltiesSaved = 0;
  if (isGoalkeeper && matches > 0) {
    // Paradenquote: realistischer Profi-Bereich (grob 55-80%), gestaffelt nach
    // eigener Stärke relativ zur Vereinsstärke (bessere Torhüter UND eine
    // bessere Abwehr vor ihnen erhöhen die Quote) plus Form und Streuung.
    const baseSavePct = 63 + (overall - clubStrength) * 0.4 + form * 10;
    savePercentage = clamp(Math.round(baseSavePct + (rng() - 0.5) * 10), 40, 92);
    // Weiße Weste pro Spiel: hängt stark von der Vereinsstärke (Abwehrqualität
    // vor einem) und der eigenen Paradenquote ab, nicht nur vom Zufall.
    const cleanSheetChancePerMatch = clamp(0.15 + (clubStrength - 50) / 180 + (savePercentage - 63) / 180, 0.05, 0.55);
    cleanSheets = Math.min(matches, Math.max(0, Math.round(matches * cleanSheetChancePerMatch * (0.75 + rng() * 0.5))));
    // Gehaltene Elfmeter im laufenden Ligaspiel (separat vom Elfmeterschießen-
    // Event "torwart_elfmeterheld") - grob ein Elfmeter gegen den eigenen Kasten
    // pro 9 Spiele, davon ein Teil gehalten je nach Paradenquote. Seltener
    // Bonusmoment, der Bewertung/Bekanntheit/Gehalt zusätzlich anhebt ("Elfmeter
    // gehalten als Boost").
    const penaltiesFacedEstimate = Math.round(matches / 9);
    const penaltySaveChance = clamp(0.18 + (savePercentage - 63) / 200, 0.08, 0.4);
    for (let i = 0; i < penaltiesFacedEstimate; i++) {
      if (rng() < penaltySaveChance) penaltiesSaved++;
    }
  }

  // Verteidiger-Statistik: "verhinderte Großchancen" (Grätsche auf der Linie, Klärung
  // im eigenen Strafraum, entscheidender letzter Zweikampf) ist das defensive
  // Gegenstück zu Toren/Vorlagen bzw. der TW-Paradenquote - ein Innen-/Außenverteidiger
  // OHNE Torbeteiligung kann trotzdem eine spielentscheidende Saison abliefern, was die
  // reine "Torbeteiligungen"-Metrik bislang komplett ignorierte (Bugreport: Verteidiger
  // strukturell benachteiligt). Innenverteidiger klären spürbar mehr als Außenverteidiger
  // (näher an der eigenen Box, mehr direkte Zweikämpfe im Strafraum). Fließt unten in
  // `productionFactor`/`computeSeasonScore` als eigener Bonus ein, analog zu Toren bzw.
  // Paraden.
  let bigChancesPrevented = 0;
  const isDefender = player.position === "IV" || player.position === "AV";
  if (isDefender && matches > 0) {
    const positionFactor = player.position === "IV" ? 1 : 0.75;
    const rateBase = clamp(0.35 + (overall - clubStrength) * 0.012 + form * 0.15, 0.1, 1.1) * positionFactor;
    bigChancesPrevented = Math.max(0, Math.round(matches * rateBase * (0.7 + rng() * 0.6)));
  }

  // Mittelfeld-Statistik: "Ballgewinne & Schlüsselpässe" ist das Mittelfeld-Gegenstück
  // zu `bigChancesPrevented` bei Verteidigern bzw. der TW-Paradenquote - ein zentrales
  // Mittelfeld OHNE Torbeteiligung kann trotzdem eine spielentscheidende Saison
  // abliefern (Bugreport: Mittelfeld strukturell benachteiligt, hatte als einzige
  // Position keinen eigenen Ersatzstat neben der - wegen mittlerem `attackWeight` von
  // Natur aus schwächeren - Torbeteiligung). Aus Technik + Intelligenz abgeleitet (die
  // beiden am stärksten gewichteten ZM-Attribute, siehe `POSITION_WEIGHTS.ZM`) statt aus
  // der allgemeinen Gesamtstärke, damit gezielt spielgestalterische Qualität statt roher
  // Physis/Athletik belohnt wird. Fließt unten in `productionFactor` genauso wie
  // `bigChancesPrevented` ein (siehe dort).
  let progressiveActions = 0;
  if (player.position === "ZM" && matches > 0) {
    const skillFactor = (player.attributes.technik + player.attributes.intelligenz) / 2 / 100;
    const rateBase = clamp(0.16 + (skillFactor - 0.5) * 1.0 + form * 0.15, 0.05, 0.9);
    progressiveActions = Math.max(0, Math.round(matches * rateBase * (0.7 + rng() * 0.6)));
  }
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
  // Tore und Vorlagen fließen direkt in die Durchschnittsnote ein - wer pro Spiel
  // spürbar zum Torerfolg beiträgt, bekommt das auch in der Bewertung honoriert,
  // nicht nur in der separaten Tore/Vorlagen-Statistik.
  const productionPerMatch = matches > 0 ? (goals + assists * 0.7) / matches : 0;
  // Verteidiger verhinderte Großchancen, Mittelfeld Ballgewinne/Schlüsselpässe (siehe
  // `bigChancesPrevented`/`progressiveActions` oben, für die jeweilige Position ist
  // immer nur EINE der beiden ungleich 0).
  const bigChancesPerMatch = matches > 0 ? bigChancesPrevented / matches : 0;
  const progressiveActionsPerMatch = matches > 0 ? progressiveActions / matches : 0;

  // Primär-/Sekundärkanal je Position (Bugreport: ZM bekam vorher STRUKTURELL zwei
  // volle Produktionskanäle gleichzeitig - moderater `attackWeight` (0.55) UND die
  // volle `progressiveActions`-Metrik -, während IV/AV/FS/ST jeweils nur einen
  // einzigen nennenswerten Kanal hatten, siehe Diagnose-Backtest: ZM-Performance-
  // Score lag spürbar über allen anderen Positionen). Jede Position bekommt jetzt
  // GENAU EINEN vollgewichteten Primärkanal, passend zur eigentlichen Rolle, plus
  // einen deutlich abgeschwächten Sekundärkanal - kein Doppelzählungs-Vorteil mehr.
  // IV/AV: Defensivarbeit ist der Kern der Rolle, Torbeteiligung nur "nice to have".
  // ZM: Ballgewinne/Schlüsselpässe sind der Kern (Spielgestaltung), Tore/Vorlagen nur
  // ein Bonus obendrauf - NICHT mehr gleichgewichtig neben `progressiveActions`.
  // FS/ST: unverändert reine Torbeteiligungs-Rolle (keine Zweitmetrik vorhanden).
  let primaryPerMatch: number;
  let secondaryPerMatch: number;
  let secondaryWeight: number;
  if (player.position === "IV") {
    primaryPerMatch = bigChancesPerMatch;
    secondaryPerMatch = productionPerMatch;
    secondaryWeight = 0.25;
  } else if (player.position === "AV") {
    primaryPerMatch = bigChancesPerMatch;
    secondaryPerMatch = productionPerMatch;
    secondaryWeight = 0.45;
  } else if (player.position === "ZM") {
    primaryPerMatch = progressiveActionsPerMatch;
    secondaryPerMatch = productionPerMatch;
    secondaryWeight = 0.5;
  } else {
    // FS, ST (TW läuft über die eigene Formel unten)
    primaryPerMatch = productionPerMatch;
    secondaryPerMatch = 0;
    secondaryWeight = 0;
  }
  // Erwartungswert (reliabilityUNabhängig, siehe `productionReliability` unten) -
  // "was ein Spieler dieses Niveaus in dieser Rolle normalerweise produziert".
  // Bleibt strukturell nicht-negativ (baut auf realen, nicht-negativen Zählgrößen
  // auf) - das ist bewusst so, echte Unterperformance kommt NICHT aus einer
  // künstlich negativen Erwartung, sondern aus der Abweichung davon (siehe unten).
  const positionProductionRaw = isGoalkeeper
    ? clamp((matches > 0 ? cleanSheets / matches : 0) * 2.1 + (savePercentage - 63) / 55 + penaltiesSaved * 0.05, -0.6, 1.1)
    : clamp(primaryPerMatch * 1.3 + secondaryPerMatch * secondaryWeight, 0, 1.1);

  // Produktions-Zuverlässigkeit (siehe `Player.productionReliability`, unabhängig
  // von OVR/Potenzial/Trajektorie gewürfelt) - bei GENAU 1.0 (Bevölkerungs-
  // mittelwert) ist dieser Shift 0, `productionFactor` bleibt also für den
  // "typischen" Spieler exakt wie zuvor (keine Regression der bisherigen
  // Kalibrierung). Erst eine deutlich abweichende Zuverlässigkeit verschiebt den
  // Faktor spürbar - bei niedrigen Werten so weit, dass er auch bei ordentlichen
  // rohen Zählgrößen INS NEGATIVE kippen kann: genau das ermöglicht einen hohen
  // OVR bei chronisch enttäuschender Leistung (Actual Production bleibt hinter der
  // Erwartung zurück), ohne die tatsächlich gezeigten Tore/Vorlagen/Zweikampfwerte
  // künstlich gegen 0 zu drücken.
  const reliabilityShift = (player.productionReliability - 1) * 1.7;
  const productionFactor = clamp(positionProductionRaw + reliabilityShift, -1.1, 1.1);
  // "Sommermärchen-Delle" (siehe "sommermaerchen_delle_1"): ein spürbarer, aber
  // vorübergehender Leistungsdämpfer nach einem großen Erfolgshöhepunkt - klingt
  // über die Saisons ab (siehe `ageUpPlayer`), statt die Karriere dauerhaft zu prägen.
  const slumpFactor = player.formSlumpSeasons > 0 ? -0.4 : 0;
  const ratingBase =
    6.0 + (overall - clubStrength) / 45 + form * 0.6 + disziplinFactor + relationshipFactor + productionFactor + slumpFactor;
  const avgRating = clamp(ratingBase + (rng() - 0.5) * 0.6, 3.5, 9.5);

  // Positionsabhängig normalisierte Leistungsbewertung (0-100, siehe `SeasonStats.
  // performanceScore`) - Grundlage für Peak-/Legacy-Berechnung, damit "wie groß war
  // die Karriere" nicht nur über Tore/Vorlagen läuft. 50 = Liga-Durchschnitt, jeder
  // Punkt Ø-Bewertung über/unter 6.0 zählt 10 Punkte, `productionFactor` (siehe oben)
  // bis zu ±22 Punkte oben drauf bzw. abgezogen - ein Innenverteidiger mit
  // Weltklasse-Zweikampfwerten kann so denselben Höchstwert erreichen wie ein
  // Stürmer mit Weltklasse-Torquote, UND ein Spieler mit hohem OVR, aber niedriger
  // `productionReliability`, kann trotz ordentlicher Rohwerte spürbar unter 50 fallen.
  const performanceScore = clamp(Math.round(50 + (avgRating - 6) * 10 + productionFactor * 20), 0, 100);

  // Niedrige Disziplin erhöht die Kartenwahrscheinlichkeit spürbar, hohe senkt sie
  const cardFactor = clamp(1.5 - player.traits.disziplin / 50, 0.5, 1.5);
  const yellowCards = Math.round(matches * 0.12 * (0.5 + rng()) * cardFactor);
  const redCards = rng() < 0.05 * (matches / 30) * cardFactor ? 1 : 0;

  // Tabellenplatz: Vereinsstärke + etwas Zufall, moduliert leicht durch eigene Form.
  // Nenner bewusst auf 93 (statt der rohen Skala bis 100) gesetzt: bei einem Nenner
  // von 100 bräuchte es praktisch Vereinsstärke 90+ MIT Idealglück, um überhaupt auf
  // Tabellenplatz 1-2 zu landen - damit wäre der Titelkampf faktisch nur den 2-3
  // absolut stärksten Vereinen der gesamten Liga vorbehalten. Mit 93 reicht ein
  // wirklich starker (nicht zwingend DER stärkste) Verein plus etwas Losglück, um
  // an der Tabellenspitze mitzuspielen - realistischer für die Titelchancen-Formel
  // unten (`coeffDominance`/`leaguePosition`).
  const strengthNoise = (rng() - 0.5) * 20;
  const effectiveStrength = clubStrength + strengthNoise + (avgRating - 6.5) * 2;
  const leaguePosition = clamp(Math.round(18 - (effectiveStrength / 93) * 17), 1, 18);

  // Tabellen-Ausschnitt für den Saisonrückblick (3 Vereine über/unter dem eigenen,
  // siehe `buildTableSnapshot`) - die Spielanzahl ergibt sich dort aus einer
  // ECHTEN Hin-/Rückrunde der tatsächlichen Vereinsanzahl dieser Liga-Ebene,
  // nicht aus `baseMatches` (das sind die um Kaderrolle/Verletzung reduzierten
  // PERSÖNLICHEN Einsätze des Spielers, mit der Liga-Größe unverwandt).
  const tableSnapshot = buildTableSnapshot(
    league,
    player.club.tier,
    player.club.clubId,
    player.club.name,
    leaguePosition,
    rng
  );

  // ELO-artiger Vereinskoeffizient (Vereinsstärke + Liga-Ansehen + Flair, siehe
  // `clubCoefficient`) statt nur der rohen Stärkezahl - ein "80" in einer Topliga
  // ist ein deutlich ernsterer Titelkandidat als ein "80" in einer schwachen Liga.
  // Auf ~0 (schwacher Klub/schwache Liga) bis ~1 (Top-Klub/Topliga) normalisiert.
  const trophyClubRank = clubLeagueRank(player.club.clubId, player.club.tier, league);
  const trophyCoefficient = clubCoefficient(player.club, league.countryId, trophyClubRank);
  const coeffDominance = clamp((trophyCoefficient - 25) / 140, 0, 1);
  // Eigener Anteil an einem sportlichen Erfolg - deutlich über der Vereinsstärke zu
  // spielen zieht Titel wahrscheinlicher nach sich, deutlich darunter drückt sie.
  const trophyContribution = clamp((overall - clubStrength) / 40, -0.15, 0.35);

  const trophies: string[] = [];
  const trophyPool = TROPHY_POOL_BY_TIER[player.club.tier];
  // Meisterschaft: geht ausschließlich nach Punkten (bei Punktgleichheit Tordifferenz,
  // danach Anzahl Siege absolut) - genau wie im echten Ligabetrieb. Zeigt der
  // Saisonrückblick `leaguePosition === 1`, STEHT der Verein damit schon
  // definitionsgemäß als Punktbester (bzw. nach diesen Tiebreakern) fest - es gibt
  // danach keine weitere Zufallschance mehr, die den Titel trotz Tabellenführung
  // verhindern könnte (frühere `titleChance`-Warscheinlichkeit entfernt: Bugreport
  // "Meisterschale trotz Tabellenplatz 2" zeigte, dass Tabellenplatz und Trophäe nie
  // auseinanderfallen dürfen - das gilt in beide Richtungen, nicht nur gegen Platz 2).
  if (leaguePosition === 1) {
    trophies.push(trophyPool[0]);
  }
  // Aufstiegs-Play-off (nur Liga 2): eigener, von der Pokal-Simulation unabhängiger
  // Zufalls-Slot - eine Aufstiegschance ist ein anderes Konzept als eine Pokal-
  // Teilnahme, auch wenn beide früher denselben generischen "zweiten Trophäen-Slot"
  // teilten. Bewusst NICHT mehr in `trophies` (siehe Bugreport-Review): eine
  // Play-off-CHANCE ist kein tatsächlich gewonnener Titel - landete sie im selben
  // Array wie Meisterschale/Landespokal, zählte sie in `computeSeasonScore` mit
  // vollem Titel-Bonus UND erschien im "🏆 Gewonnen"-Banner, obwohl nichts
  // gewonnen wurde (mit Abstand häufigster "Titel"-Eintrag in der Simulation).
  // Eigener, klar als Chance formulierter Log-Eintrag statt Trophäen-Eintrag.
  if (player.club.tier === 2) {
    const playoffChance = clamp(0.05 + coeffDominance * 0.12 + Math.max(0, trophyContribution) * 0.5, 0.03, 0.35);
    if (rng() < playoffChance) {
      player.log.push({
        season: seasonNumber,
        age: player.age,
        text: `${player.club.name} sichert sich dank ${player.name}s starker Saison einen Platz im Aufstiegs-Play-off - noch kein Titel, aber eine echte Chance auf den Aufstieg.`,
        kind: "positive",
      });
    }
  }

  // Nationaler Pokal (siehe nationalCup.ts) - ALLE Liga-1- UND Liga-2-Vereine des
  // Landes nehmen automatisch teil (kein Qualifikations-Schwellenwert wie bei CL/EL,
  // reale nationale Pokale schließen Zweitligisten ein), daher hier immer berechnet,
  // nicht nur für Erstligisten. Löst die frühere blinde Zufalls-Chance auf
  // "Landespokal" ab (analog zum Ersatz von "Kontinental-Pokal" durch europeanCup.ts).
  // NIE ein Sieg, wenn dieselbe Saison bereits ein entscheidendes Pokal-Aus erlebt hat
  // (siehe `cupExitThisSeason`/`pokal_kraftakt`) - dann direkt "Runde 1" ohne
  // Simulation, sonst würde der Rückblick sich selbst widersprechen.
  const nationalCup: NationalCupResult = player.cupExitThisSeason
    ? { stageReached: "Runde 1", champion: false, underdog: false }
    : computeSeasonNationalCupResult({
        league,
        playerClubId: player.club.clubId,
        playerClubCoefficient: trophyCoefficient,
        rng,
      });
  player.cupExitThisSeason = false;
  if (nationalCup.champion) trophies.push("Landespokal");

  // Europäische Wettbewerbe (Champions Cup/Europa Cup) - siehe europeanCup.ts. Der
  // Struktur-Drift der 10 Ligen (siehe `advanceEuropeanLeagueDrift`) läuft JEDE Saison
  // weiter, unabhängig davon, ob der eigene Verein sich qualifiziert - sonst würden
  // sich Liga-Stärken nur in den Saisons verschieben, in denen der Spieler selbst in
  // Europa mitspielt. Nur Erstligisten können sich qualifizieren - die eigene
  // Qualifikation hängt fest am tatsächlichen Tabellenplatz (+ ggf. Pokalsieg) dieser
  // Saison (siehe `COUNTRY_EUROPEAN_SLOTS` in europeanCup.ts), Zweitliga-Vereine sind
  // dafür strukturell nie vorgesehen (reale nationale Ligasysteme).
  advanceEuropeanLeagueDrift(europeanLeagueDrift, rng);
  const europeanCup =
    player.club.tier === 1
      ? computeSeasonEuropeanCupResult({
          playerCountryId: league.countryId,
          playerClubId: player.club.clubId,
          playerLeaguePosition: leaguePosition,
          playerClubCoefficient: trophyCoefficient,
          league,
          foreignLeagues,
          drift: europeanLeagueDrift,
          playerWonNationalCup: nationalCup.champion,
          rng,
        })
      : null;
  if (europeanCup) {
    // Der Titel selbst läuft über denselben `trophies`-Kanal wie Meisterschaft/Pokal,
    // damit Achievements/Karriere-Score/Sharepic ihn automatisch mitzählen (siehe
    // Trophy-Schleife unten) - nur die Turniertiefe ohne Titel braucht einen
    // separaten Log-Eintrag (siehe unten nach der Trophy-Schleife).
    if (europeanCup.champion) {
      trophies.push(europeanCup.competition === "CL" ? "Champions Cup" : "Europa Cup");
    }
    const stageIndex = EUROPEAN_STAGE_ORDER.indexOf(europeanCup.stageReached);
    const europeanReputationGain = clamp(3 + stageIndex * 3, 0, 24);
    player.reputation = clamp(player.reputation + europeanReputationGain, 0, 100);
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
  player.careerTotals.cleanSheets += cleanSheets;
  player.careerTotals.penaltiesSaved += penaltiesSaved;
  player.careerTotals.bigChancesPrevented += bigChancesPrevented;
  player.careerTotals.progressiveActions += progressiveActions;
  player.careerTotals.trophies.push(...trophies);

  for (const trophy of trophies) {
    const isIndividual = trophy === "Torschützenkönig" || trophy === "Spieler der Saison" || trophy === "Talent der Saison";
    const isEuropean = trophy === "Champions Cup" || trophy === "Europa Cup";
    player.log.push({
      season: seasonNumber,
      age: player.age,
      text: isIndividual
        ? `${player.name} wird als "${trophy}" ausgezeichnet - eine individuelle Krönung der Saison.`
        : isEuropean
        ? `${player.name} gewinnt mit ${player.club.name} die ${trophy}!`
        : `${player.name} gewinnt mit ${player.club.name} die/den ${trophy}.`,
      kind: "milestone",
    });
    if (isIndividual) player.reputation = clamp(player.reputation + 8, 0, 100);
  }
  // Europäische Teilnahme ohne Titel bekommt einen eigenen Log-Eintrag (der Titelfall
  // ist bereits über die Trophy-Schleife oben abgedeckt).
  if (europeanCup && !europeanCup.champion) {
    const compName = europeanCup.competition === "CL" ? "Champions Cup" : "Europa Cup";
    const stageText = europeanCup.stageReached === "Ligaphase" ? "in der Ligaphase" : `im ${europeanCup.stageReached}`;
    player.log.push({
      season: seasonNumber,
      age: player.age,
      text: `${player.club.name} nimmt an der ${compName} teil - ausgeschieden ${stageText}.`,
      kind: "positive",
    });
  }

  // Gehaltssystem: Grundgehalt wird garantiert ausgezahlt, dazu leistungsabhängige
  // Prämien für Tore/Vorlagen (bzw. bei Torhütern weiße Westen/gehaltene Elfmeter),
  // starke Bewertungen und Titel. Europäische Teilnahme bringt zusätzlich TV-/Preisgeld
  // gestaffelt nach Turniertiefe (siehe `EUROPEAN_STAGE_ORDER`) - real ist bereits die
  // reine Teilnahme an der Ligaphase eine spürbare finanzielle Zäsur, nicht erst der Titel.
  const europeanStageIndex = europeanCup ? EUROPEAN_STAGE_ORDER.indexOf(europeanCup.stageReached) : -1;
  const europeanBonus =
    europeanCup && europeanStageIndex >= 0
      ? Math.round((europeanCup.competition === "CL" ? 30000 : 15000) * (europeanStageIndex + 1))
      : 0;
  const performanceBonus = Math.round(
    goals * 400 +
      assists * 250 +
      cleanSheets * 350 +
      penaltiesSaved * 900 +
      (avgRating >= 7.2 ? 6000 : 0) +
      trophies.length * 15000 +
      europeanBonus
  );
  const income = player.contract.wagePerYear + performanceBonus;
  player.wealth += income;

  // Reputation wächst mit guten Leistungen - ein gutes Medienimage verstärkt den Effekt
  const mediaFactor = 1 + (player.traits.medienimage - 50) / 200; // 0.75 .. 1.25
  const repGain = clamp(
    Math.round((avgRating - 6) * 3 * mediaFactor + goals * 0.4 + assists * 0.2 + cleanSheets * 0.5 + penaltiesSaved * 1.8),
    -6,
    14
  );
  player.reputation = clamp(player.reputation + repGain, 0, 100);

  // Verein-Beziehung leicht Richtung Mitte tendieren lassen
  if (avgRating >= 7) player.clubRelation = clamp(player.clubRelation + 3, 0, 100);
  if (avgRating < 5.5) player.clubRelation = clamp(player.clubRelation - 4, 0, 100);

  // Länderspiele dieser Saison: Differenz zum Stand bei Saisonbeginn (Caps können
  // während der Saison über Nationalmannschafts-Events dazukommen).
  const capsThisSeason = Math.max(0, player.nationalTeamCaps - player.capsAtSeasonStart);
  player.capsAtSeasonStart = player.nationalTeamCaps;

  // Nationalmannschafts-Kandidatur-Streak (siehe `Player.nationalTeamCandidacySeasons`,
  // "CAREER NARRATIVE ... TECHNISCHE VERANKERUNG" Abschnitt 19/20/21) - zählt
  // aufeinanderfolgende Saisons auf "nationalmannschaftswürdigem" Niveau (dieselbe
  // grobe Schwelle wie `nationalmannschaft_einladung`s Bekanntheits-/Niveau-Gate in
  // events.ts) OHNE dabei berufen zu werden. Treibt sowohl die Berufungswahrschein-
  // lichkeit (siehe `nationalTeamCallUpChance`) als auch das Auswahlgewicht des
  // Berufungs-Events (siehe `EventTemplate.dynamicWeight`) - ein dauerhaft verdienter
  // Spieler bleibt so nicht unbegrenzt vom reinen Zufall abhängig.
  const nationalTeamWorthy = overall >= 75 && player.reputation >= 45;
  if (capsThisSeason > 0) {
    // Eine echte Snub-Serie (mindestens 3 aufeinanderfolgende "würdige" Saisons ohne
    // Berufung) endet mit der ersten Berufung - als prägender Moment festgehalten
    // (siehe Vorgabe Abschnitt 21/22: "SNUB → CALL-UP → NATIONAL_TEAM_ESTABLISHED").
    if (player.nationalTeamCandidacySeasons >= 3) {
      player.narrativeHistory.push({
        season: player.seasonHistory.length,
        age: player.age,
        type: "NATIONAL_TEAM_CALLUP_AFTER_SNUB",
        label: "Die Einladung ist da - nach Jahren des Wartens",
      });
    }
    player.nationalTeamCandidacySeasons = 0;
  } else if (nationalTeamWorthy) {
    player.nationalTeamCandidacySeasons += 1;
  } else {
    player.nationalTeamCandidacySeasons = 0;
  }

  const { score, tier: scoreTier, factors: scoreFactors } = computeSeasonScore({
    avgRating,
    trophies,
    minutesPlayed,
    possibleMinutes,
    yellowCards,
    redCards,
    capsThisSeason,
    squadRole: player.contract.squadRole,
  });

  const stats: SeasonStats = {
    seasonLabel: seasonLabelForNumber(seasonNumber),
    age: player.age,
    club: player.club.name,
    overallRating: overall,
    attributesAtSeasonStart: { ...player.attributesAtSeasonStart },
    traitsAtSeasonStart: { ...player.traitsAtSeasonStart },
    leagueTier: player.club.tier,
    leagueName: leagueNameForTier(league, player.club.tier),
    matches,
    minutesPlayed,
    possibleMinutes,
    goals,
    assists,
    cleanSheets,
    savePercentage,
    penaltiesSaved,
    bigChancesPrevented,
    progressiveActions,
    capsThisSeason,
    avgRating: Math.round(avgRating * 10) / 10,
    performanceScore,
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
    tableSnapshot,
    europeanCup,
    nationalCup,
    // Noch VOR dieser Zeile gesetzt (siehe Player.loanNarrative) - wird erst nach der
    // finalen "bleiben/zurück/abwarten"-Entscheidung (also NACH dieser Saison) wieder
    // auf `null` zurückgesetzt, hier also zuverlässig noch aktiv, falls diese Saison
    // ein Leihjahr war.
    onLoan: player.loanNarrative !== null,
  };

  player.seasonHistory.push(stats);
  advanceNarrativeThread(player, stats);

  return stats;
}

/**
 * Punkt-Schwellen für die fünf Saison-Bilanz-Stufen - EINZIGE Quelle der Wahrheit,
 * verwendet von `computeSeasonScore` UND `applyLeaguePromotionRelegation` (die nach
 * Auf-/Abstieg nachträglich neu einordnet). Zweite Kalibrierung, nachdem
 * `computeSeasonScore` den separaten (positionsungleich gewichteten)
 * Torbeteiligungs-Faktor verloren hat (siehe Kommentar dort) - der Score fällt seither
 * spürbar kleiner aus (Median-Saison ~20-40 statt vorher ~80-150 Punkte), die
 * Schwellen sind entsprechend niedriger angesetzt und per Simulation (400 Karrieren,
 * ~9.800 Saisons, `sim_tier_distribution.ts`) gegengeprüft - insbesondere darauf, dass
 * sich die Verteilung jetzt über alle Positionen ähnlich anfühlt statt wie zuvor
 * IV/AV/ZM strukturell zu benachteiligen.
 */
const SCORE_TIER_THRESHOLDS = {
  ueberragend: 85,
  stark: 40,
  solide: -5,
  schwierig: -30,
};

function scoreTierForScore(score: number): string {
  if (score >= SCORE_TIER_THRESHOLDS.ueberragend) return "Überragende Saison";
  if (score >= SCORE_TIER_THRESHOLDS.stark) return "Starke Saison";
  if (score >= SCORE_TIER_THRESHOLDS.solide) return "Solide Saison";
  if (score < SCORE_TIER_THRESHOLDS.schwierig) return "Schwierige Saison";
  return "Durchwachsene Saison";
}

/**
 * Mehrfaktorielle Saison-Bilanz. Auf-/Abstieg wird separat nachgetragen (siehe
 * `applyLeaguePromotionRelegation`).
 *
 * Bewusst OHNE eigenen "Torbeteiligungen"-Faktor (frühere Version hatte hier eine
 * zweite, komplett separate Positions-Gewichtungstabelle - `PRODUCTION_MULTIPLIER` -
 * die parallel zu `attackWeight`/`productionFactor` in `simulateSeason` existierte und
 * nie synchron gehalten wurde: Verteidiger/Mittelfeld wurden dadurch faktisch ZWEIMAL
 * unterschiedlich für dieselbe Leistung bewertet, siehe Bugreport). Tore, Vorlagen,
 * verhinderte Großchancen und Ballgewinne/Schlüsselpässe fließen bereits VOLLSTÄNDIG
 * und je Position gleichwertig in `avgRating` ein (siehe `productionFactor` in
 * `simulateSeason`) - `ratingFactor` unten übernimmt diese Bewertung direkt, statt sie
 * ein zweites Mal mit eigenen Gewichten nachzurechnen. Einziges Ergebnis: eine
 * Bestleistung in der eigenen Rolle ist jetzt für JEDE Position ungefähr gleich viel
 * Score wert, und es gibt nur noch EINE Stelle (`productionFactor`), die bei künftigen
 * Balance-Anpassungen gepflegt werden muss statt zwei auseinanderlaufenden.
 */
/**
 * Für welche Einsatzquote eine gegebene Kaderrolle realistisch steht - dieselbe
 * Rechnung wie `simulateSeason` (roleFactor × minutesPerMatchByRole/90), damit
 * "Expected Playing Time" (siehe Vorgabe Abschnitt 15/17) exakt der Quote
 * entspricht, die die Rolle strukturell hergibt. Nur EINE Quelle der Wahrheit
 * für diese Zuordnung - siehe Kommentar bei `computeSeasonScore`.
 */
const EXPECTED_PLAYTIME_RATIO_BY_ROLE: Record<SquadRole, number> = {
  Stammspieler: 0.93,
  Rotation: 0.45,
  Ergänzungsspieler: 0.14,
  Ersatzbank: 0.05,
  Ausbildungsspieler: 0.05,
};

function computeSeasonScore(input: {
  avgRating: number;
  trophies: string[];
  minutesPlayed: number;
  possibleMinutes: number;
  yellowCards: number;
  redCards: number;
  capsThisSeason: number;
  squadRole: SquadRole;
}): { score: number; tier: string; factors: ScoreFactor[] } {
  // Sportliche Leistung: bewusst UM DEN DURCHSCHNITT (6.0) ZENTRIERT statt einer
  // reinen Multiplikation - eine Ø-Bewertung von genau 6.0 (Mittelmaß) trägt damit
  // NICHTS zum Score bei, eine schwache Bewertung zieht ihn spürbar nach unten, eine
  // starke hebt ihn spürbar an. Trägt jetzt (siehe Kommentar oben) das gesamte
  // Gewicht der individuellen Leistung inkl. Torbeteiligung/Abwehrarbeit, da diese
  // bereits vollständig in `avgRating` steckt. Gewicht bewusst erhöht (war: 26) -
  // die tatsächliche sportliche Leistung soll die Saisonwertung klar dominieren.
  const ratingFactor = { label: "Sportliche Leistung (Ø Bewertung)", points: Math.round((input.avgRating - 6) * 32) };

  // Einsatzzeit: NICHT mehr gegen eine für alle Rollen gleiche 55%-Pauschalquote
  // gemessen (Bugreport/Designvorgabe: das bestrafte rechtmäßige Rotations-/
  // Ergänzungsspieler strukturell, obwohl sie exakt die für ihre Rolle erwartbare
  // Einsatzzeit bekommen), sondern gegen die für die AKTUELLE Kaderrolle plausible
  // "Expected Playing Time" (siehe `EXPECTED_PLAYTIME_RATIO_BY_ROLE`) - ein
  // Rotationsspieler mit rollentypischen ~45% Einsatzquote bekommt jetzt einen
  // neutralen Faktor statt eines pauschalen Abzugs, ein NOMINELLER Stammspieler,
  // der durch Verletzung/Vereinskonflikt trotzdem kaum spielt, bleibt weiterhin
  // klar bestraft (großes Delta zur eigenen Rollenerwartung). Deutlich kleinere
  // Skalierung/Kappung als zuvor, weil die verbleibende Differenz jetzt fast immer
  // ein echtes Abweichungssignal ist (nicht mehr strukturelles Rollenrauschen).
  const playTimeRatio = input.possibleMinutes > 0 ? input.minutesPlayed / input.possibleMinutes : 1;
  const expectedPlayTimeRatio = EXPECTED_PLAYTIME_RATIO_BY_ROLE[input.squadRole] ?? 0.45;
  const playTimeFactor = {
    label: "Einsatzzeit",
    points: clamp(Math.round((playTimeRatio - expectedPlayTimeRatio) * 90), -45, 25),
  };

  const factors: ScoreFactor[] = [
    ratingFactor,
    playTimeFactor,
    { label: "Titel", points: input.trophies.length * 50 },
    { label: "Disziplin", points: -Math.round(input.yellowCards * 2 + input.redCards * 15) },
  ];
  if (input.capsThisSeason > 0) {
    factors.push({ label: "Länderspiele", points: input.capsThisSeason * 10 });
  }

  const score = factors.reduce((s, f) => s + f.points, 0);
  return { score, tier: scoreTierForScore(score), factors };
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

/** Anteil des aktuellen Werts, der pro Saison im Alter abgebaut wird - moderner
 * Profifußball erlaubt eine deutlich längere Prime als früher üblich: bis
 * 32/33 ist heute oft noch echtes Topniveau drin, der harte Abbau setzt daher
 * bewusst erst danach ein. ABER: selbst mit dieser verlängerten Prime muss der
 * Abbau ab Mitte 30 spürbar bleiben - ein 36-Jähriger mit praktisch
 * unverändertem Peak-Niveau (90 OVR) wirkt unrealistisch, selbst für
 * Ausnahmeathleten (siehe `declineConditionMultiplier`). Frühere Werte (0.025/
 * 0.05/0.09) ließen genau das zu, weil sie sich mit den Multiplikatoren unten
 * zu weit nach unten kombinieren ließen. Jetzt spürbar steiler: */
function declineRate(age: number): number {
  if (age <= 32) return 0;
  if (age <= 35) return 0.04;
  if (age <= 38) return 0.075;
  return 0.13;
}

/**
 * Individueller Multiplikator auf die altersbedingte Abbaurate (siehe
 * `declineRate`) - zwei Spieler im selben Alter bauen unterschiedlich schnell
 * ab, je nachdem wie robust sie über die Karriere waren:
 * - Physis ist der direkteste Fitness-/Robustheits-Indikator: hohe Physis
 *   (Kraft, Athletik, Regenerationsfähigkeit) verlängert die Prime spürbar,
 *   niedrige beschleunigt den Abbau.
 * - Verletzungshistorie: wer über die Karriere kaum verletzt war, hat den
 *   Körper spürbar weniger strapaziert und baut langsamer ab. Wer viele
 *   Ausfallwochen angesammelt hat, zahlt das Alter über spürbar früheren
 *   Verschleiß zurück.
 * Beide Faktoren multiplizieren sich - ein durchweg gesunder Spieler mit
 * hoher Physis baut spürbar langsamer ab als der Altersschnitt, ein
 * verletzungsanfälliger Spieler mit niedriger Physis entsprechend schneller.
 * Die Bandbreite bleibt bewusst enger als in einer früheren Version: selbst
 * der bestmögliche Fall (Top-Physis, nie verletzt) darf den Abbau nicht auf
 * die Hälfte drücken - sonst bleiben genau die Ausnahmespieler, die man am
 * ehesten bis zum Karriereende spielt, unrealistisch nah am Peak.
 */
function declineConditionMultiplier(player: Player): number {
  const physisFactor = clamp(1.1 - (player.attributes.physis - 50) / 200, 0.8, 1.25);
  const injuryFactor = clamp(0.9 + player.totalInjuryWeeks / 300, 0.9, 1.4);
  return physisFactor * injuryFactor;
}

/**
 * Attribut-spezifischer Abbau-Multiplikator (zusätzlich zu `declineConditionMultiplier`,
 * der nur die individuelle Robustheit abbildet) - körperliche Attribute (Tempo,
 * Physis) bauen im Alter spürbar schneller ab als Erfahrung/Übersicht
 * (Mentalität, Intelligenz), Technik liegt dazwischen (leicht rückläufig durch
 * nachlassende Reaktionsschnelligkeit, aber deutlich stabiler als reine
 * Athletik). Charisma/Image ist keine körperliche Fähigkeit und bleibt fast
 * unberührt vom Alter.
 */
const ATTRIBUTE_DECLINE_MULTIPLIER: Record<AttributeKey, number> = {
  tempo: 1.35,
  physis: 1.2,
  technik: 0.85,
  mentalitaet: 0.55,
  intelligenz: 0.6,
  charisma: 0.75,
};

/** Kaderrolle der GERADE ABGELAUFENEN Saison (siehe `ageUpPlayer` - läuft vor dem
 * saisonalen Rollen-Update in `resolveClubSituation`, spiegelt also exakt die Rolle
 * wider, mit der tatsächlich gespielt wurde) wirkt sich direkt auf die
 * Weiterentwicklung aus: wer wirklich regelmäßig spielt, entwickelt sich in der
 * Wachstumsphase schneller und hält sich in der Abbauphase länger auf hohem
 * Niveau - wer nur auf der Bank sitzt, bekommt spürbar weniger aus seinem
 * Potenzial heraus. Ausbildungsspieler folgen ihrem eigenen Jugendsystem und
 * bleiben unverändert (neutral). */
function squadRoleGrowthMultiplier(role: SquadRole): number {
  if (role === "Stammspieler") return 1.3;
  if (role === "Rotation") return 1.05;
  if (role === "Ergänzungsspieler") return 0.7;
  if (role === "Ersatzbank") return 0.3;
  return 1;
}
function squadRoleDeclineMultiplier(role: SquadRole): number {
  if (role === "Stammspieler") return 0.85;
  if (role === "Rotation") return 1;
  if (role === "Ergänzungsspieler") return 1.25;
  if (role === "Ersatzbank") return 1.6;
  return 1;
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
  // Die Kaderrolle der GERADE ABGELAUFENEN Saison (siehe oben - läuft hier vor dem
  // Rollen-Update in `resolveClubSituation`) entscheidet mit, wie viel vom
  // Potenzial tatsächlich ausgeschöpft wird: echte Wettkampfpraxis als Stammspieler
  // beschleunigt das Wachstum bzw. bremst den Abbau spürbar, ein Dasein auf der
  // Bank bremst nicht nur, sondern kostet echte Substanz - unabhängig vom Alter.
  const roleGrowthMultiplier = squadRoleGrowthMultiplier(player.contract.squadRole);
  const roleDeclineMultiplier = squadRoleDeclineMultiplier(player.contract.squadRole);
  // Individuelle Robustheit (Physis + Verletzungshistorie, siehe dort) moduliert
  // die altersbedingte Abbaurate zusätzlich zur Kaderrolle.
  const conditionDeclineMultiplier = declineConditionMultiplier(player);
  // Performance als Entwicklungssignal: eine deutlich über/unter dem Liga-
  // Durchschnitt (50) liegende `performanceScore`-Saison beschleunigt bzw. bremst
  // das Wachstum zusätzlich zur Kaderrolle - eine starke Saison MIT wenig
  // Einsatzzeit zeigt sich schon in der Rolle (siehe oben), eine schwache Saison
  // TROTZ Stammplatz soll trotzdem als Warnsignal wirken. Die "Performance
  // Reliability" (wie belastbar ist ein einzelnes Saisonsignal) steigt mit dem
  // Alter: mit 14/15 kann eine einzelne schwache Saison die Karriere nicht
  // ausbremsen, ab ~21 zählt sie voll (siehe Vorgabe "Performance-Reliability").
  const lastSeason = player.seasonHistory[player.seasonHistory.length - 1];
  const performanceReliability = clamp((player.age - 15) / 6, 0.12, 1);
  // Bewusst deutlich schwächer skaliert als ein erster Entwurf (war: ±0.6) - über
  // viele Wachstums-Saisons hinweg summiert sich sonst ein systematischer
  // Aufwärtsdrall (die Liga-Durchschnittsleistung `performanceScore` liegt in der
  // Praxis eher leicht über 50, da Spieler tendenziell zu ungefähr passenden
  // Vereinen finden), der die Trajektorie-Streuung (siehe oben) wieder verwässert.
  const performanceGrowthMultiplier = lastSeason
    ? clamp(1 + ((lastSeason.performanceScore - 50) / 100) * performanceReliability * 0.25, 0.88, 1.12)
    : 1;
  const isBenchWarmer = player.contract.squadRole === "Ersatzbank";
  for (const key of ATTRIBUTE_KEYS) {
    const current = player.attributes[key];
    const potential = player.potential[key];
    let rawDelta: number;
    if (gRate > 0) {
      const room = potential - current;
      // `developmentTrajectory` (siehe dort) ist der zentrale Hebel für eine breite
      // Potenzial-Ausschöpfungsverteilung über viele Karrieren - ein Spieler mit
      // niedriger Trajektorie nähert sich seinem Potenzial spürbar langsamer an
      // und kann so trotz hohem Potenzial ein Underperformer/Bust bleiben, ein
      // Spieler mit hoher Trajektorie schöpft dasselbe Potenzial deutlich
      // schneller/vollständiger aus (Overperformer-Fall). Das proportionale
      // Wachstumsmodell (Annäherung an `room` über ~16 Wachstums-Saisons) ist
      // stark kompensierend - über so viele Saisons gleichen sich lineare
      // Trajektorie-Unterschiede sonst zu stark aus (siehe `sim_engine_backtest.ts`:
      // eine rein lineare Anwendung führte selbst bei niedriger Trajektorie kaum zu
      // echten Bust-Karrieren). Ein moderater Exponent (^1.6) verstärkt genau die
      // UNTERE Hälfte der Verteilung zusätzlich, ohne überdurchschnittliche
      // Trajektorien (nahe/über 1.0) nennenswert zu verändern.
      const effectiveTrajectory = Math.pow(player.developmentTrajectory, 1.6);
      rawDelta =
        gRate *
        room *
        effectiveTrajectory *
        workEthicMultiplier *
        trainingEnvironmentMultiplier *
        roleGrowthMultiplier *
        performanceGrowthMultiplier *
        (0.7 + rng() * 0.6);
      rawDelta = Math.max(0, rawDelta);
    } else if (dRate > 0) {
      rawDelta =
        -dRate * current * ATTRIBUTE_DECLINE_MULTIPLIER[key] * roleDeclineMultiplier * conditionDeclineMultiplier * (0.7 + rng() * 0.6);
    } else {
      rawDelta = 0;
    }
    // Reine Bankspieler verlieren zusätzlich leicht an Substanz durch fehlende
    // Wettkampfpraxis - unabhängig von der altersbedingten Wachstums-/Abbaurate,
    // damit ein dauerhafter Bankplatz auch bei jungen Spielern zu einem echten
    // Rückschritt werden kann, nicht nur zu langsamerem Fortschritt.
    if (isBenchWarmer) {
      rawDelta -= current * 0.06 * (0.6 + rng() * 0.6);
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
  if (player.formSlumpSeasons > 0) player.formSlumpSeasons -= 1;
  if (player.secondSpringSeasons > 0) player.secondSpringSeasons -= 1;

  if (player.injury) {
    const remaining = player.injury.weeksOut - 16; // Sommerpause heilt viel
    player.injury = remaining <= 0 ? null : { ...player.injury, weeksOut: remaining };
  }
  // Die pauschale Sommerpausen-Erholung (+12 oben) darf die Fitness NICHT über das
  // hinaus heben, was eine noch nicht auskurierte Verletzung zulässt - sonst könnte
  // ein Spieler mit frischem Kreuzbandriss nach zwei, drei Sommerpausen schon wieder
  // fast 100% Fitness zeigen, obwohl real noch Monate Ausfallzeit anstehen.
  applyInjuryFitnessCeiling(player);

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

// leaguePrestigeRank/leaguePrestigeMultiplier/clubLeagueRank/internationalFlairBonus/
// clubCoefficient sind nach leagueEngine.ts umgezogen (siehe dort) - sie werden auch
// von europeanCup.ts gebraucht, das careerEngine.ts nicht importieren darf (Zirkularität).

/** Geschätztes Jahresgehalt bei einem Verein - richtet sich nach der eigenen
 * Gesamtstärke UND Bekanntheit (beide multiplikativ, nicht nur addiert - ein
 * Weltklasse-Spieler verdient überproportional mehr, nicht nur ein bisschen)
 * sowie dem ELO-artigen Vereins-Koeffizienten (siehe `clubCoefficient`), der
 * exponentiell statt linear einfließt: ein echter Topklub zahlt ein Vielfaches
 * eines Kellerkinds, nicht nur spürbar mehr. Wird sowohl in der Angebots-
 * Vorschau als auch bei der tatsächlichen Zusage verwendet, damit das
 * versprochene Gehalt exakt dem entspricht, was man am Ende bekommt. */
function estimateWage(
  overall: number,
  reputation: number,
  club: { strength: number },
  countryId: CountryId,
  leagueRank?: number
): number {
  const baseline = 8000 + reputation * 900 + overall * 1200;
  const coeff = clubCoefficient(club, countryId, leagueRank);
  // 55 als grober Referenzwert für einen "durchschnittlichen" Erstliga-Verein -
  // Vereine deutlich darüber/darunter skalieren das Gehalt spürbar über- bzw.
  // unterproportional (Potenz statt linearer Faktor). Obergrenze bewusst höher als
  // der ohne Flair-Bonus erreichbare Höchstkoeffizient (siehe `clubCoefficient`),
  // damit selbst die absoluten Top-Vereine der großen Ligen (mit Flair-Aufschlag)
  // nicht alle an derselben Kappungsgrenze landen und sich weiter voneinander
  // abheben.
  const clubMultiplier = clamp(Math.pow(coeff / 55, 1.8), 0.25, 8);
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

/**
 * Bewiesenes Niveau eines aktuellen Stammspielers: wer sich den Stammplatz beim
 * BISHERIGEN Verein bereits erarbeitet hat, hat damit sein Leistungsniveau
 * schon auf Höhe von dessen Vereinsstärke bewiesen - unabhängig davon, wie
 * knapp die reine Attributs-Gesamtstärke das hergibt. Ohne diesen Bodensatz
 * würde `squadRoleForOverall` einen unangefochtenen Stammspieler eines
 * Topklubs bei einem Wechsel zu einem ähnlich starken (oder schwächeren)
 * Verein regelmäßig nur als Rotationsspieler einstufen, obwohl die eigentliche
 * Kaderrolle das Gegenteil zeigt. Gilt NUR für tatsächliche Stammspieler, kein
 * Freifahrtschein für Rotations-/Ergänzungsspieler.
 */
function provenStarterFloor(player: Player, oldClubStrength: number): number {
  if (player.contract.squadRole !== "Stammspieler") return 0;
  const lastStats = player.seasonHistory[player.seasonHistory.length - 1];
  const formBonus = lastStats ? clamp((lastStats.avgRating - 6.5) * 2, -2, 4) : 0;
  return oldClubStrength + 3 + formBonus;
}

/** Für Transfer-Rollenberechnungen (Angebots-Vorschau + tatsächliche Zusage) angepasste
 * Gesamtstärke, die den bewiesenen Stammspieler-Bodensatz mit einbezieht - siehe
 * `provenStarterFloor`. Wird NICHT für Gehalt oder generelle Attributwerte verwendet,
 * ausschließlich für die Kaderrollen-/Versprechen-Logik beim Vereinswechsel. */
function transferEffectiveOverall(player: Player, overall: number, oldClubStrength: number): number {
  return Math.max(overall, provenStarterFloor(player, oldClubStrength));
}

/**
 * Schwellen bewusst gelockert (früher: +5 / -5 / -15): Angebote landen laut
 * `targetStrength`-Formeln (siehe `buildClubOfferEvent`) ohnehin oft schon
 * SPÜRBAR über der eigenen Gesamtstärke - wer zusätzlich noch 5 Punkte BESSER
 * als der neue Verein sein musste, um dort Stammspieler zu werden, geriet bei
 * jedem ambitionierten (aber nachvollziehbaren) Wechsel fast automatisch in
 * Rotation und verlor durch die Kopplung an `squadRoleGrowthMultiplier` dort
 * auch noch an Entwicklungstempo - ein sich selbst verstärkender Teufelskreis,
 * der laut Simulation selbst bei umsichtiger Wechselwahl einen Spieler nahe
 * seinem Karriere-Peak (88+) im Schnitt nur auf ~50% Karriere-Einsatzminuten
 * kommen ließ. Auf ETWA eigenem Niveau (diff >= 0) sollte man realistisch um
 * einen Stammplatz mitspielen können, nicht zwingend deutlich darüber liegen.
 */
/**
 * Torhüter kennen KEINE Rotation/Ergänzungsspieler-Zwischenstufe (siehe
 * `SquadRole`-Doc-Kommentar in types.ts) - anders als bei Feldspielern
 * springt die Rolle binär zwischen "Stammspieler" (Nummer 1) und
 * "Ersatzbank" (Nummer 2/3), ohne die abgestufte Leiter der Feldspieler.
 * Schwelle bewusst leicht großzügiger (diff >= -3 statt >= 0) als bei
 * Feldspielern: die Torwart-Gesamtstärke hängt stark an Physis/Mentalität
 * (siehe POSITION_WEIGHTS.TW) und schwankt dadurch weniger granular - eine
 * zu strikte 0-Schwelle würde sonst realistische Nummer-1-Torhüter knapp
 * unterhalb der Vereinsstärke fälschlich auf die Bank verbannen.
 */
function squadRoleForOverall(overall: number, clubStrength: number, position: Position): SquadRole {
  const diff = overall - clubStrength;
  if (position === "TW") {
    return diff >= -3 ? "Stammspieler" : "Ersatzbank";
  }
  if (diff >= 0) return "Stammspieler";
  if (diff >= -10) return "Rotation";
  if (diff >= -20) return "Ergänzungsspieler";
  return "Ersatzbank";
}

/** Eine Stufe unterhalb der übergebenen Kaderrolle (für ein gebrochenes
 * Einsatzminuten-Versprechen, siehe `rolePromiseChance`) - "Ersatzbank" ist die
 * Talsohle. Für Torhüter (siehe `squadRoleForOverall`) übersprint dies direkt
 * die für sie nicht existente Rotation/Ergänzungsspieler-Zwischenstufe. */
const ROLE_ORDER: SquadRole[] = ["Ersatzbank", "Ergänzungsspieler", "Rotation", "Stammspieler"];
function roleOneStepDown(role: SquadRole, position: Position): SquadRole {
  if (position === "TW") return "Ersatzbank";
  const idx = ROLE_ORDER.indexOf(role);
  if (idx <= 0) return role;
  return ROLE_ORDER[idx - 1];
}

/** Anzeige-Label für die Torwart-Kaderrolle ("Nummer 1"/"Nummer 2") statt der
 * generischen Feldspieler-Begriffe - nur sinnvoll für `position === "TW"`.
 * "Nummer 3" ist rein narrativ (siehe Event-Texte) und bezeichnet denselben
 * mechanischen "Ersatzbank"-Zustand wie "Nummer 2": ein dritter Torwart
 * bekommt in der Praxis genauso selten Einsatzminuten wie ein zweiter, die
 * Unterscheidung ist reine Hackordnung, kein eigener Spielzeit-Zustand. */
export function goalkeeperRoleLabel(role: SquadRole): string {
  if (role === "Stammspieler") return "Nummer 1";
  if (role === "Ausbildungsspieler") return "Nachwuchstorwart";
  return "Nummer 2";
}

/** Anzeige-Text für eine Kaderrolle, positionsabhängig - Torhüter zeigen
 * "Nummer 1"/"Nummer 2" (siehe `goalkeeperRoleLabel`), alle anderen Positionen
 * den regulären `SquadRole`-Text unverändert. Zentrale Stelle für alle
 * UI-/Event-Textstellen, die eine Kaderrolle anzeigen. */
export function squadRoleLabel(role: SquadRole, position: Position): string {
  return position === "TW" ? goalkeeperRoleLabel(role) : role;
}

/**
 * Grobe, rein narrativ/diagnostisch genutzte Klassifikation EINER Vereinsangebots-
 * Entscheidung (siehe `TransferDecisionType`) - beeinflusst KEINE Spiellogik, dient
 * ausschließlich `Player.transferDecisions` (siehe `computeCareerNarrativeState`/
 * `detectCareerPhenotype`). Schwellen über eine 1500-Karrieren-Diagnose-Simulation
 * kalibriert (siehe "CAREER NARRATIVE & DECISION IMPACT SYSTEM" Teil A): ein
 * Vereinsstärke-Sprung von 12+ zählt als klar wahrnehmbarer Auf-/Abstieg, unter 6
 * bei gleichzeitig spürbar besserer Kaderrolle als reiner Spielzeit-Wechsel, ein
 * großer Sprung MIT Rollenrisiko als Prestige-Risiko.
 */
function classifyTransferDecision(
  reason: string,
  isStay: boolean,
  strengthDelta: number,
  roleRankDelta: number,
  wageDeltaPct: number | null
): TransferDecisionType {
  if (isStay) return "STABILITY_DECISION";
  if (reason === "loan") return "PLAYING_TIME_MOVE";
  if (Math.abs(strengthDelta) < 6 && roleRankDelta >= 1) return "PLAYING_TIME_MOVE";
  if (strengthDelta >= 12) {
    return roleRankDelta <= -2 ? "PRESTIGE_RISK_MOVE" : "UPWARD_MOVE";
  }
  if (strengthDelta <= -12) return "DOWNWARD_MOVE";
  if (Math.abs(strengthDelta) < 12 && Math.abs(roleRankDelta) < 1 && wageDeltaPct !== null && wageDeltaPct >= 0.4) {
    return "FINANCIAL_MOVE";
  }
  return "LATERAL_MOVE";
}

/** Protokolliert EINE abgeschlossene Vereinsangebots-Entscheidung in
 * `Player.transferDecisions` (siehe dort) - aufgerufen von `applyClubOfferChoice`
 * NACHDEM der eigentliche Wechsel/Verbleib schon vollzogen ist, mit dem VORHER
 * gültigen Verein/Kaderrolle/Gehalt als Vergleichsbasis. Rein additiv/beobachtend,
 * keine Rückwirkung auf Spiellogik. */
function recordTransferDecision(
  player: Player,
  reason: string,
  isStay: boolean,
  fromClubName: string,
  toClubName: string,
  oldRole: SquadRole,
  offerCard: OfferCardData | undefined,
  oldWage: number
) {
  if (!offerCard || reason === "loan-return") return undefined;
  const strengthDelta = (offerCard.strength ?? 0) - (offerCard.strengthPrev ?? offerCard.strength ?? 0);
  // `offerCard.roleLabel` ist bereits Torwart-übersetzt ("Nummer 1"/"Nummer 2", siehe
  // `goalkeeperRoleLabel`) - hier auf dieselbe Rangskala wie `SQUAD_ROLE_RANK` gemappt.
  const roleLabelRank: Record<string, number> = {
    Stammspieler: SQUAD_ROLE_RANK["Stammspieler"],
    "Nummer 1": SQUAD_ROLE_RANK["Stammspieler"],
    Rotation: SQUAD_ROLE_RANK["Rotation"],
    Ergänzungsspieler: SQUAD_ROLE_RANK["Ergänzungsspieler"],
    Ersatzbank: SQUAD_ROLE_RANK["Ersatzbank"],
    "Nummer 2": SQUAD_ROLE_RANK["Ersatzbank"],
    Nachwuchstorwart: SQUAD_ROLE_RANK["Ausbildungsspieler"],
  };
  const candidateRank = offerCard.roleLabel in roleLabelRank ? roleLabelRank[offerCard.roleLabel] : SQUAD_ROLE_RANK[oldRole];
  const roleRankDelta = candidateRank - SQUAD_ROLE_RANK[oldRole];
  const wageDeltaPct = offerCard.wageDelta !== undefined && oldWage > 0 ? offerCard.wageDelta / oldWage : null;
  const type = classifyTransferDecision(reason, isStay, strengthDelta, roleRankDelta, wageDeltaPct);
  const entry: TransferDecisionEntry = {
    season: player.seasonHistory.length + 1,
    age: player.age,
    type,
    fromClub: fromClubName,
    toClub: toClubName,
    strengthDelta: Math.round(strengthDelta * 10) / 10,
    seasonHistoryIndex: player.seasonHistory.length,
  };
  player.transferDecisions.push(entry);
  return entry;
}

/**
 * Startet den EINEN, gleichzeitig aktiven Narrative-Thread (siehe `NarrativeThread`,
 * "TECHNISCHE VERANKERUNG" Abschnitt 7/12) - ausschließlich für einen klar riskanten
 * Aufstiegswechsel (UPWARD_MOVE/PRESTIGE_RISK_MOVE), und nur, wenn gerade kein anderer
 * Thread läuft (KEIN Multi-Thread-Store, siehe Doc-Kommentar `NarrativeThread`). Der
 * eigentliche Ausgang (Anpassung gelingt/misslingt) wird NICHT hier entschieden,
 * sondern erst über die tatsächliche Einsatzzeit-/Performance-Entwicklung der
 * folgenden Saison(en) - siehe `advanceNarrativeThread` in `simulateSeason`.
 */
function maybeStartNarrativeThread(player: Player, entry: TransferDecisionEntry | undefined) {
  if (!entry || player.activeNarrativeThread) return;
  if (entry.type !== "UPWARD_MOVE" && entry.type !== "PRESTIGE_RISK_MOVE") return;
  player.activeNarrativeThread = {
    type: "BIG_MOVE_ADAPTATION",
    startedSeason: entry.season,
    startedAge: entry.age,
    stage: "ADAPTATION",
    seasonHistoryIndex: entry.seasonHistoryIndex,
  };
}

/** Einsatzquote (0-100) einer Saison - `0`, wenn keine möglichen Minuten bekannt sind. */
function seasonPlaytimePct(s: SeasonStats): number {
  return s.possibleMinutes > 0 ? (s.minutesPlayed / s.possibleMinutes) * 100 : 0;
}

/**
 * Bewegt den EINEN aktiven Narrative-Thread (siehe `NarrativeThread`) anhand der
 * TATSÄCHLICHEN Einsatzzeit-/Performance-Entwicklung der gerade abgeschlossenen
 * Saison weiter - wird einmal je Saison NACH `player.seasonHistory.push(stats)`
 * aufgerufen (siehe `simulateSeason`). Reine Beobachtung realer Werte, keine
 * Rückwirkung auf Spiellogik. Ein Thread, der zu lange (5+ Saisons) ohne klare
 * Auflösung bleibt, läuft neutral aus (kein erzwungenes Happy End, kein
 * erzwungener Rückschlag) - siehe "TECHNISCHE VERANKERUNG" Abschnitt 4/7.
 */
function advanceNarrativeThread(player: Player, stats: SeasonStats) {
  const thread = player.activeNarrativeThread;
  if (!thread) return;
  const hist = player.seasonHistory;
  const currentIdx = hist.length - 1; // die gerade gepushte Saison
  if (currentIdx < thread.seasonHistoryIndex) return;
  const seasonsSinceMove = currentIdx - thread.seasonHistoryIndex + 1;

  if (thread.stage === "ADAPTATION") {
    const baseline = hist[thread.seasonHistoryIndex - 1];
    if (!baseline) {
      player.activeNarrativeThread = null;
      return;
    }
    const playtimeDelta = seasonPlaytimePct(stats) - seasonPlaytimePct(baseline);
    const perfDelta = stats.performanceScore - baseline.performanceScore;
    if (playtimeDelta < -12 || perfDelta < -8) {
      thread.stage = "STRUGGLE";
    } else if (playtimeDelta > 5 && perfDelta > 5) {
      thread.stage = "BREAKTHROUGH";
    } else if (seasonsSinceMove >= 2) {
      // Nach spätestens 2 Saisons ohne klares Bild neutral auslaufen lassen -
      // nicht jeder Wechsel muss ein narrativer Wendepunkt werden.
      player.activeNarrativeThread = null;
      return;
    }
  } else if (thread.stage === "STRUGGLE" || thread.stage === "REBUILD") {
    const prevIdx = currentIdx - 1;
    const prev = prevIdx >= thread.seasonHistoryIndex - 1 ? hist[prevIdx] : undefined;
    const playtimeDelta = prev ? seasonPlaytimePct(stats) - seasonPlaytimePct(prev) : 0;
    const perfDelta = prev ? stats.performanceScore - prev.performanceScore : 0;
    if (thread.stage === "STRUGGLE" && playtimeDelta > 8 && perfDelta > 5) {
      thread.stage = "REBUILD";
    } else if (thread.stage === "REBUILD" && playtimeDelta >= -3 && perfDelta >= -2) {
      thread.stage = "BREAKTHROUGH";
    } else if (seasonsSinceMove >= 5) {
      player.activeNarrativeThread = null;
      return;
    }
  }

  if (thread.stage === "BREAKTHROUGH") {
    player.narrativeHistory.push({
      season: currentIdx,
      age: player.age,
      type: "BIG_MOVE_BREAKTHROUGH",
      label: "Durchbruch nach dem großen Schritt",
    });
    player.activeNarrativeThread = null;
  }
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
  // Dieselben gelockerten Schwellen wie `squadRoleForOverall` (siehe dortiger
  // Kommentar) - Konsistenz zwischen Angebots-Vorschau und tatsächlicher
  // laufender Kaderrolle.
  const roleScore = overall - clubStrength + relationFactor + formFactor;
  if (player.position === "TW") {
    return roleScore >= -3 ? "Stammspieler" : "Ersatzbank";
  }
  if (roleScore >= 0) return "Stammspieler";
  if (roleScore >= -10) return "Rotation";
  if (roleScore >= -20) return "Ergänzungsspieler";
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
  const isGoalkeeper = player.position === "TW";
  // Eine erfolgreich genutzte Bewährungschance schützt die Kaderrolle noch einige
  // Saisons vor dem Abrutschen unter "Rotation" - der Durchbruch bleibt spürbar.
  // Torhüter kennen keine "Rotation"-Zwischenstufe (siehe `squadRoleForOverall`) -
  // die Bewährungschance schützt bei ihnen direkt die Nummer-1-Rolle.
  if (player.roleProtectionSeasons > 0) {
    if (isGoalkeeper) {
      newRole = "Stammspieler";
    } else if (SQUAD_ROLE_RANK[newRole] < SQUAD_ROLE_RANK["Rotation"]) {
      newRole = "Rotation";
    }
  }
  // Vertragliche Stammplatzgarantie: stärkere Absicherung als die Bewährungschance,
  // garantiert für die vereinbarte Dauer mindestens "Stammspieler" - wirkt sich über
  // `roleFactor`/`minutesPerMatchByRole` in `simulateSeason` direkt auf Einsatzminuten
  // und darüber auf Tore/Vorlagen aus, statt nur ein Stimmungs-Bonus zu sein.
  if (player.startingRoleGuaranteeSeasons > 0 && SQUAD_ROLE_RANK[newRole] < SQUAD_ROLE_RANK["Stammspieler"]) {
    newRole = "Stammspieler";
  }
  // Edeljoker-Rolle (siehe "edeljoker_1"): der Trainer nutzt den Spieler dauerhaft
  // gezielt von der Bank statt als gesetzten Stammspieler - deckelt die Kaderrolle
  // bei "Rotation", selbst wenn die reine Gesamtstärke eigentlich mehr hergäbe. Eine
  // vertragliche Stammplatzgarantie (siehe oben) bleibt davon unberührt - ein klares
  // Vertragsversprechen sticht die informelle Trainer-Präferenz. Gilt nicht für
  // Torhüter - "edeljoker_1" schließt die Position aus (Einwechselspieler-Rolle
  // passt konzeptionell nicht zum Torwart).
  if (
    !isGoalkeeper &&
    player.edeljokerLocked &&
    player.startingRoleGuaranteeSeasons <= 0 &&
    SQUAD_ROLE_RANK[newRole] > SQUAD_ROLE_RANK["Rotation"]
  ) {
    newRole = "Rotation";
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
    const newRoleLabel = squadRoleLabel(newRole, player.position);
    entry = {
      season: 0,
      age: player.age,
      text: improved
        ? `${player.name} arbeitet sich bei ${player.club.name} zu einer besseren Rolle im Kader hoch (${newRoleLabel}).`
        : `${player.name} verliert bei ${player.club.name} an Bedeutung im Kader (${newRoleLabel}).`,
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
 *
 * Da die Liga-Pyramide nur zwei Ebenen kennt (siehe `simulateLeaguePromotionRelegation`),
 * kann `wasRelegated` für einen Liga-2-Spieler nie zutreffen - ein Liga-2-Verein hat
 * keine tiefere Liga, in die er absteigen könnte, bleibt bei schwacher Tabellenlage
 * also einfach in Liga 2. Nur Liga-1-Vereine können absteigen, nur Liga-2-Vereine
 * aufsteigen.
 */
export function applyLeaguePromotionRelegation(player: Player, league: LeagueState): LogEntry | null {
  // lastStats VOR der Simulation holen (nicht danach), damit deren leaguePosition als
  // Anker für den Spielerverein dient - sonst könnte diese Simulation dem Spieler
  // einen Tabellenplatz zuweisen, der der bereits im Saisonrückblick gezeigten
  // Platzierung widerspricht (siehe simulateTableAnchored in leagueEngine.ts).
  const lastStats = player.seasonHistory[player.seasonHistory.length - 1];
  const result = simulateLeaguePromotionRelegation(
    league,
    rng,
    lastStats ? { clubId: player.club.clubId, leaguePosition: lastStats.leaguePosition } : undefined
  );

  const wasRelegated = result.relegated.some((c) => c.id === player.club.clubId);
  const wasPromoted = result.promoted.some((c) => c.id === player.club.clubId);

  // Echtes Relegationsspiel (siehe `CountryDef.hasRelegationPlayoff`): der eigene
  // Verein kann hier auch OHNE Auf-/Abstieg beteiligt gewesen sein (das Duell
  // gewonnen/verloren, aber die Liga-Zugehörigkeit blieb dieselbe) - das braucht
  // eigene Log-Einträge, sonst bliebe so ein Saisonhöhepunkt (bzw. -tiefpunkt)
  // völlig unerwähnt (vorher: `return null` ohne jede Reaktion).
  const playoff = result.playoff;
  const playerInPlayoff =
    playoff && (playoff.tier1Club.id === player.club.clubId || playoff.tier2Club.id === player.club.clubId);
  const playerWasTier1InPlayoff = playerInPlayoff && playoff!.tier1Club.id === player.club.clubId;
  const opponentCity = playerInPlayoff
    ? (playerWasTier1InPlayoff ? playoff!.tier2Club.city : playoff!.tier1Club.city)
    : "";

  if (!wasRelegated && !wasPromoted) {
    if (!playerInPlayoff) return null;
    // Relegationsspiel gewonnen, aber die eigene Liga-Zugehörigkeit bleibt gleich:
    // als Liga-1-Verein die Klasse gehalten, oder als Liga-2-Verein den Aufstieg
    // knapp verpasst (der jeweils andere Fall - Liga wechselt sich - läuft über
    // `wasRelegated`/`wasPromoted` unten, inklusive Score/Moral-Effekten).
    const survived = playerWasTier1InPlayoff;
    if (lastStats) {
      lastStats.relegationPlayoff = survived ? "gehalten" : "verpasst";
      // Kleinerer Score-Ausschlag als ein vollständiger Auf-/Abstieg (±40, siehe unten) -
      // ein überstandenes bzw. verlorenes Relegationsspiel ist ein echter, aber
      // schmalerer Erfolg/Rückschlag als der komplette Liga-Wechsel.
      const points = survived ? 15 : -12;
      lastStats.scoreFactors.push({ label: survived ? "Relegationsspiel gehalten" : "Relegationsspiel verloren", points });
      lastStats.score += points;
      lastStats.scoreTier = scoreTierForScore(lastStats.score);
    }
    player.morale = clamp(player.morale + (survived ? 5 : -6), 0, 100);
    const leagueName = leagueNameForTier(league, player.club.tier);
    const text = survived
      ? `${player.club.name} übersteht das Relegationsspiel gegen ${opponentCity} in letzter Sekunde und bleibt in der ${leagueName}.`
      : `${player.club.name} verliert das Relegationsspiel gegen ${opponentCity} und verpasst den Aufstieg in die ${
          league.tier1Name
        } denkbar knapp.`;
    return { season: 0, age: player.age, text, kind: survived ? "positive" : "negative" };
  }

  player.club.tier = wasRelegated ? 2 : 1;
  const personalFormGreat = !!lastStats && lastStats.avgRating >= 6.8;
  if (lastStats) {
    lastStats.relegated = wasRelegated;
    lastStats.promoted = wasPromoted;
    if (playerInPlayoff) lastStats.relegationPlayoff = wasRelegated ? "abgestiegen" : "aufgestiegen";
    const points = wasRelegated ? -40 : 40;
    lastStats.scoreFactors.push({ label: wasRelegated ? "Abstieg" : "Aufstieg", points });
    lastStats.score += points;
    lastStats.scoreTier = scoreTierForScore(lastStats.score);
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
  const text = playerInPlayoff
    ? wasRelegated
      ? `${player.club.name} verliert das Relegationsspiel gegen ${opponentCity} und steigt ab - künftig in der ${leagueName}.`
      : `${player.club.name} gewinnt das Relegationsspiel gegen ${opponentCity} und steigt auf in die ${leagueName} - ${player.name} hat maßgeblich dazu beigetragen.`
    : wasRelegated
      ? personalFormGreat
        ? `${player.club.name} steigt trotz einer starken Saison von ${player.name} ab und spielt künftig in der ${leagueName}.`
        : `${player.club.name} steigt ab und spielt künftig in der ${leagueName}.`
      : `${player.club.name} steigt auf und spielt künftig in der ${leagueName} - ${player.name} hat maßgeblich dazu beigetragen.`;

  return { season: 0, age: player.age, text, kind: wasRelegated ? "negative" : "positive" };
}

// ---------------------------------------------------------------------------
// Sichtbare Vereinswechsel: Profidebüt, Transferangebote, Bankphasen-Druck
// ---------------------------------------------------------------------------

export type ClubOfferReason = "pro-debut" | "opportunity" | "pressure" | "lockruf" | "loan" | "loan-return" | "loan-keep";

const CLUB_OFFER_PREFIX = "club_offer:";

/** Events, deren Auswahl-Bedingung VOR einem Wechsel geprüft wurde (siehe
 * `pickSeasonTemplateIds`, läuft einmal ganz am Saisonanfang) und durch einen
 * innerhalb DERSELBEN Saison später vollzogenen Wechsel sofort hinfällig wird -
 * entweder weil die Prämisse selbst hinfällig wird (Vertrags-Events: "dein
 * Vertrag läuft bald aus" nach frisch unterschriebenem 3-Jahres-Vertrag, siehe
 * `applyClubOfferChoice`), oder weil das Event beim Anzeigen automatisch den
 * AKTUELLEN (neuen) statt des Vereins nennt, an dem die Auswahl-Bedingung
 * eigentlich geprüft wurde (trainerzoff_1: ein frisch begonnener Trainerkonflikt
 * direkt nach der Ankunft beim neuen Verein wirkt unglaubwürdig/wie die nahtlose
 * Fortsetzung des alten Konflikts). Siehe App.tsx `handleChoice`, das diese IDs
 * nach einem echten Wechsel noch in derselben Saison aus der Queue entfernt. */
export const STALE_AFTER_TRANSFER_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  "vertrag_verlaengerung",
  "vertrag_bosman_poker",
  "trainerzoff_1",
]);

export function isClubOfferEvent(templateId: string): boolean {
  return templateId.startsWith(CLUB_OFFER_PREFIX);
}

export function clubOfferTemplateId(reason: ClubOfferReason): string {
  return `${CLUB_OFFER_PREFIX}${reason}`;
}

/** Alter des Profidebüts - fest verdrahtet (siehe `shouldOfferProDebut`). Auch als
 * Cutoff genutzt, um die Jugendakademie-Jahre aus rückblickenden Vereinstreue-/
 * Karriereverlauf-Auswertungen auszuklammern (siehe `buildClubTenures`): die
 * "Vereinszugehörigkeit" im Sinne der Karrierestatistik beginnt erst mit dem
 * ersten Profivertrag, nicht mit der Jugendakademie. */
export const PRO_DEBUT_AGE = 18;

export function shouldOfferProDebut(player: Player): boolean {
  return player.age === PRO_DEBUT_AGE && player.contract.squadRole === "Ausbildungsspieler";
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
  // spürbaren, schnellen Impact: keine Wartezeit mehr - statt erst 1-2 Saisons auf
  // ein Angebot zu warten.
  const cooldown = urgent ? 0 : 2;
  if (player.seasonsSinceTransferEvent < cooldown) return false;
  // Ein aktiv geäußerter Wechselwunsch bekommt garantiert ein Angebot im nächsten
  // Transferfenster - kein Losglück mehr: wer öffentlich sagt, dass er wechseln
  // will, muss sich auch darauf verlassen können.
  if (player.wantsTransfer) return true;
  const chance = notableSeasonEvent ? 0.92 : last?.scoreTier === "Überragende Saison" ? 0.75 : 0.55;
  return (goodForm || notableSeasonEvent) && rng() < chance;
}

/**
 * Seltener, eigenständiger Auslöser für einen spontanen Lockversuch EINES
 * einzelnen (meist größeren) Vereins - unabhängig vom regulären Wechselfenster-
 * System (`shouldTriggerTransferOpportunity`), das schon auf gute Form reagiert
 * und mehrere Kandidaten zeigt. Feuert nur bei nachweislich starker Leistung
 * ("nur wenn die Leistungen stimmen") und nie parallel zu einem bereits aktiv
 * geäußerten Wechselwunsch (der läuft über die reguläre, priorisierte Logik).
 * Bewusst mit niedrigster Priorität in `decideClubOfferInjection` verdrahtet,
 * damit es die bestehenden Auslöser nicht verdrängt, sondern nur die seltenen
 * Lücken füllt, in denen sonst gar kein Vereins-Event fällig wäre.
 */
export function shouldTriggerSingleClubApproach(player: Player): boolean {
  if (player.stage === "jugend") return false;
  if (player.wantsTransfer) return false;
  if (player.injury && player.injury.weeksOut > 0) return false;
  if (player.seasonsSinceTransferEvent < 1) return false;
  const last = player.seasonHistory[player.seasonHistory.length - 1];
  if (!last) return false;
  const strongForm = last.avgRating >= 7.0 || last.scoreTier === "Starke Saison" || last.scoreTier === "Überragende Saison";
  if (!strongForm) return false;
  return rng() < 0.22;
}

/**
 * Auslöser für ein zeitweises Leihgeschäft ins Ausland (siehe `ClubOfferReason`
 * "loan") - bewusst nur für junge Spieler (≤23), die bei ihrem aktuellen Verein
 * nicht auf ausreichend Einsatzzeit kommen: genau die Situation, in der ein
 * Verein einen vielversprechenden, aber noch nicht durchgesetzten Spieler
 * "parkt", statt ihn auf der Bank verkümmern zu lassen. Niedrigste Priorität
 * in `decideClubOfferInjection` - füllt nur die Lücken, in denen sonst gar
 * kein Vereins-Event fällig wäre und keine der oben priorisierten,
 * "aktiveren" Auslöser (Bankdruck-Wechsel, Scouting-Interesse) bereits
 * gegriffen haben.
 */
export function shouldTriggerLoanAbroad(player: Player): boolean {
  if (player.stage === "jugend") return false;
  if (player.age > 24) return false;
  if (player.loanActive) return false;
  if (player.wantsTransfer) return false;
  if (player.injury && player.injury.weeksOut > 0) return false;
  if (player.seasonsSinceTransferEvent < 1) return false;
  const strugglingForMinutes =
    player.contract.squadRole === "Ergänzungsspieler" || player.contract.squadRole === "Ersatzbank";
  if (!strugglingForMinutes) return false;
  // Je länger die Bankphase andauert, desto eher greift der Verein zur Leihe - ein
  // Spieler, der schon mehrere Saisons feststeckt, wird realistisch früher "geparkt"
  // als einer, der gerade erst auf die Bank gerutscht ist. Basis deutlich angehoben
  // (18% -> 35%), damit das narrative Leihjahr (siehe loanStory.ts) im typischen
  // Zeitfenster einer Karriere auch tatsächlich zum Zug kommt, statt eine seltene
  // Ausnahme zu bleiben.
  const chance = clamp(0.35 + player.consecutiveBenchSeasons * 0.12, 0.35, 0.7);
  return rng() < chance;
}

/**
 * Sommerpause-Event (siehe VACATION_TEMPLATE_ID in events.ts) - bewusst NICHT
 * jede Saison, sondern mit einer festen Wahrscheinlichkeit pro Saison, damit es
 * sich in die Häufigkeit der übrigen Karriere-Events einreiht statt als einziges
 * garantiertes Ereignis herauszustechen. 15% pro erwachsener Saison ergibt über
 * eine typische Karriere (Alters-Gate bis Karriereende, oft 15-20 Saisons)
 * simuliert im Schnitt ~2.7 Auftritte - derselbe Häufigkeitsbereich wie die
 * anderen häufigsten regulären Events (siehe Bugreport-Analyse "Häufigkeit aller
 * Events", z.B. lifestyle_ernaehrung/sponsor_schuhe mit Ø 2.1-2.2/Karriere).
 * Ab 20 statt schon ab dem Profidebüt (18) - ein Teenager mitten in den ersten
 * Profijahren hat noch nicht dasselbe Urlaubs-/Luxusbudget-Thema wie ein
 * gestandener Profi.
 */
export function shouldTriggerVacationEvent(player: Player): boolean {
  if (player.age < 20) return false;
  return rng() < 0.15;
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

/**
 * Zielland-Auswahl für Auslandsangebote - bewusst NICHT gleichverteilt über alle
 * neun übrigen Länder, sondern mit realem Transfermarkt-Muster gewichtet: Top-
 * Ligen (niedriger `uefaRank`) haben mehr Scouting-Reichweite/Geld und tauchen
 * daher grundsätzlich etwas häufiger als Zielland auf. Steckt der Spieler
 * gerade in einer wenig angesehenen Liga (`currentLeagueRank` groß), wird
 * dieser Effekt deutlich verstärkt - genau dann jagen die Top-3-Ligen gezielt
 * nach Perlen in kleineren Ligen, statt gleichmäßig über alle Länder zu
 * streuen (siehe Bugreport: eine Karriere blieb fast komplett auf Belgien
 * beschränkt, obwohl die Gesamtstärke längst Top-Liga-Niveau erreicht hatte). */
function pickForeignCountryIds(excludeId: CountryId, count: number, currentLeagueRank: number): CountryId[] {
  const isInWeakLeague = currentLeagueRank >= 5;
  const weighted = COUNTRIES.filter((c) => c.id !== excludeId).map((c) => {
    const rank = c.uefaRank - 1; // 0 = angesehenste Liga der Auswahl
    let weight = 1 / (1 + rank * 0.25);
    if (isInWeakLeague && rank <= 2) weight *= 2.2;
    return { id: c.id, weight };
  });

  const picked: CountryId[] = [];
  for (let i = 0; i < count && weighted.length > 0; i++) {
    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    let r = rng() * totalWeight;
    let idx = weighted.length - 1;
    for (let j = 0; j < weighted.length; j++) {
      r -= weighted[j].weight;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    picked.push(weighted[idx].id);
    weighted.splice(idx, 1);
  }
  return picked;
}

/** Wahrscheinlichkeit, dass unter den Angeboten mindestens ein Auslandsverein ist -
 * steigt mit Bekanntheit/Gesamtstärke, und stark, wenn aktiv ein Wechsel gewünscht wird
 * (der Berater erweitert dann bewusst den Suchradius über die Landesgrenze hinaus). Am
 * Karriereende zieht es die meisten Spieler, die noch in der Heimat spielen, eher
 * seltener in ein komplett neues Land - wer bereits im Ausland spielt, bekommt
 * weiterhin regelmäßig "Auslands"-Angebote, die dann aber gezielt Richtung Heimat
 * zeigen (siehe `buildClubOfferEvent`), statt in ein drittes, neues Land.
 *
 * Zusätzlicher "Scouting-Bonus": eine hohe Gesamtstärke in einer wenig
 * angesehenen Liga (siehe `leaguePrestigeRank`) fällt Scouts der Topligen
 * besonders auf - eine "verkannte Perle in der kleinen Liga" ist ein reales,
 * häufiges Transfermarkt-Muster. Ohne diesen Bonus konnte eine Karriere
 * praktisch komplett in einer einzigen kleinen Liga verlaufen, selbst bei
 * Top-Liga-reifer Gesamtstärke, weil die Chance bis hierhin nur von
 * Bekanntheit/Gesamtstärke absolut, nie vom Kontrast zur eigenen (schwachen)
 * Liga abhing. */
function internationalOfferChance(reason: ClubOfferReason, player: Player, overall: number): number {
  const fameFactor = player.reputation / 250 + overall / 300; // ~0 .. 0.65
  const currentLeagueRank = leaguePrestigeRank(player.country); // 0 (Top-Liga) .. 9 (schwächste)
  const scoutingBonus = clamp((overall - 70) / 30, 0, 1) * clamp(currentLeagueRank / 9, 0, 1) * 0.3; // 0 .. 0.3
  if (player.wantsTransfer) return clamp(0.55 + fameFactor + scoutingBonus, 0.45, 0.92);
  const base =
    reason === "pro-debut"
      ? clamp(0.15 + fameFactor + scoutingBonus, 0.1, 0.55)
      : reason === "opportunity"
      ? clamp(0.3 + fameFactor + scoutingBonus, 0.25, 0.8)
      : clamp(0.15 + fameFactor + scoutingBonus, 0.1, 0.45);
  const isLateCareerAtHome =
    (player.stage === "veteran" || player.stage === "spaetphase") && player.country === player.homeCountryId;
  return isLateCareerAtHome ? base * 0.5 : base;
}

interface OfferCandidate {
  club: ClubState;
  countryId: CountryId;
  countryName: string;
  flag: string;
  leagueLabel: string;
  isForeign: boolean;
  /** Tabellenplatz nach Stärke innerhalb der Erstliga des Kandidaten-Vereins, siehe
   * `clubLeagueRank` - fließt in den "internationaler Flair"-Gehaltsaufschlag ein. */
  leagueRank?: number;
}

/**
 * Sucht unter den früheren Vereinen mit einer echten, mehrjährigen Vergangenheit
 * (siehe `buildClubTenures`, mind. 2 Saisons) einen konkreten Kandidaten für eine
 * "Rückkehr zu einem alten Verein"-Angebotsoption im Karriereherbst - nur dort, wo der
 * Verein noch in einer bekannten Liga (aktuelle oder gecachte Auslandsliga)
 * auffindbar ist. Vereinsnamen sind innerhalb eines Landes eindeutig (siehe
 * `disambiguateCities` in leagues.ts), ein reiner Namensabgleich genügt daher.
 */
function pastClubCandidate(
  player: Player,
  activeLeague: LeagueState,
  foreignLeagues: Partial<Record<CountryId, LeagueState>>
): OfferCandidate | null {
  const tenures = buildClubTenures(player).filter((t) => t.seasons >= 2 && t.club !== player.club.name);
  if (tenures.length === 0) return null;
  const pick = tenures[Math.floor(rng() * tenures.length)];
  const knownLeagues: [CountryId, LeagueState][] = [
    [activeLeague.countryId, activeLeague],
    ...(Object.entries(foreignLeagues) as [CountryId, LeagueState][]),
  ];
  for (const [countryId, lg] of knownLeagues) {
    const club = [...lg.tier1, ...lg.tier2].find((c) => c.city === pick.club);
    if (club && club.id !== player.club.clubId) {
      return {
        club,
        countryId,
        countryName: lg.countryName,
        flag: lg.flag,
        leagueLabel: leagueNameForTier(lg, club.tier),
        isForeign: countryId !== player.country,
        leagueRank: clubLeagueRank(club.id, club.tier, lg),
      };
    }
  }
  return null;
}

function buildClubOfferEvent(
  player: Player,
  league: LeagueState,
  reason: ClubOfferReason,
  foreignLeagues: Partial<Record<CountryId, LeagueState>>
): GameEvent {
  const overall = overallRating(player);
  const currentStrength = player.club.strength;
  // International vergleichbare Anzeige-Variante (siehe `displayClubStrength`) -
  // NUR für Texte, die dem Spieler direkt gezeigt werden. Die eigentliche
  // Spiellogik (Kaderrolle, Einsatzminuten-Versprechen, ...) rechnet weiterhin
  // mit dem rohen `currentStrength` weiter.
  const currentStrengthDisplay = displayClubStrength(currentStrength, player.country);
  const pool = [...league.tier1, ...league.tier2];
  const lastStats = player.seasonHistory[player.seasonHistory.length - 1];

  // Rückkehr von der Leihe (siehe `ClubOfferReason` "loan"): kein Angebots-
  // Vergleich, keine Wahl - der Leihvertrag sieht die Rückkehr zum genau
  // gespeicherten Stammverein vor (siehe `player.loanReturnClub`), garantiert
  // und ohne Alternative. Baut das Event direkt und kehrt früh zurück, bevor
  // die generische Kandidaten-Logik unten überhaupt anläuft.
  if (reason === "loan-return") {
    const back = player.loanReturnClub!;
    const wagePreview = estimateWage(overall, player.reputation, back, player.loanReturnCountryId ?? player.homeCountryId, undefined);
    return {
      id: `cluboffer-${player.age}-loan-return-${Math.round(rng() * 1e6)}`,
      templateId: `${CLUB_OFFER_PREFIX}loan-return`,
      category: "transfer",
      title: "Rückkehr von der Leihe",
      description: `Die vereinbarte Leihzeit bei ${player.club.name} ist vorbei - laut Vertrag geht es jetzt zurück zu ${back.name}. Wie die Leihe verlaufen ist, entscheidet mit darüber, wie du dort empfangen wirst.`,
      choices: [
        {
          id: `club-${back.clubId}`,
          label: `Zurück zu ${back.name}`,
          detail: `${back.tier === 1 ? "1." : "2."} Liga · Vereinsstärke ${displayClubStrength(back.strength, player.loanReturnCountryId ?? player.homeCountryId)} · Gehalt ca. ${formatMoney(wagePreview)}/Jahr`,
          effects: {},
        },
      ],
    };
  }

  let targetStrength: number;
  let excludeCurrent: boolean;
  // "lockruf" und "loan" zeigen bewusst nur EINEN konkreten Kandidaten (siehe
  // unten) statt einer Auswahl - ein einzelner, überraschender Lockversuch
  // bzw. ein einzelnes Leihangebot fühlt sich anders an als organisches
  // Scouting-Interesse mehrerer Vereine gleichzeitig.
  const totalCount = reason === "lockruf" || reason === "loan" ? 1 : 3;
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
  } else if (reason === "lockruf") {
    // Deutlich über dem eigenen Vereinsniveau anpeilen - der Lockversuch soll
    // sich klar wie ein "größerer Verein" anfühlen, nicht wie eine seitliche
    // Bewegung.
    const jumpTarget = currentStrength + 15 + rng() * 20;
    const ratingAnchor = overall + rng() * 6;
    targetStrength = clamp(Math.max(jumpTarget, ratingAnchor), 35, 97);
    excludeCurrent = true;
  } else if (reason === "loan") {
    // Eine Leihe muss weder deutlich stärker noch schwächer sein als der
    // aktuelle Verein - entscheidend ist die Aussicht auf echte Einsatzzeit,
    // nicht das Prestige. Bewusst mit Streuung um das eigene Vereinsniveau.
    targetStrength = clamp(currentStrength - 5 + rng() * 15, 25, 90);
    excludeCurrent = true;
  } else {
    targetStrength = clamp(currentStrength - 18, 22, 90);
    excludeCurrent = true;
  }

  // Ein Teil der Angebote kann aus dem Ausland kommen - realistisch auch schon für
  // Jungspieler beim Profidebüt, nicht erst für etablierte Stars. "lockruf" bleibt
  // bewusst immer inländisch - ein einzelner Auslandskandidat würde die
  // Total-Kandidatenzahl (genau 1, siehe oben) durcheinanderbringen und die
  // pointierte "ein Verein will dich SOFORT"-Prämisse verwässern.
  // "loan" ist immer ein Auslandsgeschäft ("fremde Liga/Kultur" ist der ganze
  // Sinn dahinter), "lockruf" bleibt bewusst immer inländisch (siehe oben).
  const wantsForeign = reason === "loan" ? true : reason === "lockruf" ? false : rng() < internationalOfferChance(reason, player, overall);
  const veryFamous = player.reputation >= 70 || overall >= 80;
  // "loan" zeigt IMMER genau einen Auslandskandidaten (totalCount === 1, siehe
  // oben) - der veryFamous-Bonus (2 statt 1 Auslandsangebot) würde hier den
  // Kandidatenzähler ins Negative treiben.
  const foreignCount = wantsForeign ? (reason !== "loan" && veryFamous && rng() < 0.3 ? 2 : 1) : 0;
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
    leagueRank: clubLeagueRank(c.id, c.tier, league),
  }));

  if (foreignCount > 0) {
    const isLateCareer = player.stage === "veteran" || player.stage === "spaetphase";
    const isAbroad = player.country !== player.homeCountryId;
    // Im Karriereherbst zieht es einen Spieler, der gerade im Ausland spielt, eher
    // zurück in die Heimat als in ein komplett neues drittes Land - einer der
    // "Auslands"-Plätze wird dann gezielt mit dem Heimatland belegt statt zufällig
    // gewählt (siehe `internationalOfferChance` für die Kehrseite: wer schon zuhause
    // spielt, bekommt seltener ein brandneues Auslandsangebot).
    const currentLeagueRank = leaguePrestigeRank(player.country);
    const foreignCountryIds =
      isLateCareer && isAbroad && rng() < 0.7
        ? [player.homeCountryId, ...pickForeignCountryIds(player.country, foreignCount - 1, currentLeagueRank)].slice(
            0,
            foreignCount
          )
        : pickForeignCountryIds(player.country, foreignCount, currentLeagueRank);
    for (const countryId of foreignCountryIds) {
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
        leagueRank: clubLeagueRank(club.id, club.tier, foreignLeague),
      });
    }
  }

  // Im Karriereherbst kommt ein Angebot oft von einem Verein, bei dem man schon
  // einmal länger war ("Rückkehr zu alten Wirkungsstätten") statt nur von völlig
  // neuen Vereinen - ersetzt dazu mit einer gewissen Wahrscheinlichkeit einen der
  // sonst zufällig gewählten Kandidaten (siehe `pastClubCandidate`).
  if ((player.stage === "veteran" || player.stage === "spaetphase") && reason !== "pro-debut" && reason !== "lockruf" && rng() < 0.45) {
    const past = pastClubCandidate(player, league, foreignLeagues);
    if (past && candidates.length > 0 && !candidates.some((c) => c.club.id === past.club.id)) {
      candidates[Math.floor(rng() * candidates.length)] = past;
    }
  }

  const count = candidates.length;

  const choices: EventChoice[] = candidates.map((cand) => {
    // Dieselbe Formel wie bei der tatsächlichen Zusage (siehe `applyClubOfferChoice`),
    // damit das hier gezeigte Gehalt exakt dem entspricht, was man am Ende bekommt.
    const wagePreview = estimateWage(overall, player.reputation, cand.club, cand.countryId, cand.leagueRank);
    // Kaderrolle/Einsatzminuten-Versprechen für einen VEREINSWECHSEL vergleichen die
    // eigene (länderunabhängige) Gesamtstärke mit einem konkreten Zielverein -
    // beide Vereinsstärken (altes UND neues Land) müssen hierfür auf derselben,
    // international vergleichbaren Skala stehen (siehe `displayClubStrength`),
    // sonst entsteht exakt der Bugreport: ein Wechsel zu einem (real deutlich
    // schwächeren) Verein aus einer kleinen Liga wurde als "härter" bewertet als
    // der eigene Stammplatz bei einem Topklub, nur weil beide LOKAL normierten
    // Rohwerte zufällig ähnlich hoch lagen. Betrifft NUR die Wechsel-Entscheidung
    // selbst - die laufende Kaderrolle beim AKTUELLEN Verein (siehe
    // `currentSquadRole`/`resolveClubSituation`) bleibt bewusst auf der rohen,
    // lokalen Skala (dort ist "wie stehe ich innerhalb MEINER Liga da" die
    // richtige Frage, kein Länder-Vergleich).
    const candStrengthForTransfer = displayClubStrength(cand.club.strength, cand.countryId);
    const transferOverall = transferEffectiveOverall(player, overall, currentStrengthDisplay);
    const promisedRole = squadRoleForOverall(transferOverall, candStrengthForTransfer, player.position);
    // Das Einsatzminuten-Versprechen eines NEUEN Vereins ist nie hundertprozentig
    // sicher - je größer der Sprung zwischen eigener Stärke und Vereinsniveau,
    // desto eher bleibt die versprochene Rolle nur ein Lippenbekenntnis (siehe
    // `applyClubOfferChoice`, wo tatsächlich ausgewürfelt wird, ob der Verein das
    // Versprechen einhält).
    const promiseChance = rolePromiseChance(transferOverall, candStrengthForTransfer);
    // Nur eine Gehalts-Differenz zeigen, wenn ein aktuelles Gehalt zum Vergleich
    // existiert (nicht beim allerersten Profivertrag, siehe "pro-debut" - dort
    // wäre "wagePerYear: 0" als Basis eine bedeutungslose "+100%"-Differenz).
    const wageDelta = player.contract.wagePerYear > 0 ? wagePreview - player.contract.wagePerYear : undefined;
    // Strukturierte Kartendaten (siehe `OfferCardData`) für das neue Angebots-
    // Kartenlayout - dieselben bereits berechneten Werte wie im `detail`-Fließtext
    // unten, nur aufgeschlüsselt statt zusammengezogen.
    const offerCard: OfferCardData = {
      headline: cand.club.city,
      league: cand.leagueLabel,
      abroadFlag: cand.isForeign ? cand.flag : undefined,
      strength: candStrengthForTransfer,
      strengthPrev: currentStrengthDisplay,
      wage: wagePreview,
      wageDelta,
      roleLabel: reason === "loan" ? "Leihe" : squadRoleLabel(promisedRole, player.position),
      roleSub: reason === "loan" ? `Rückkehr zu ${player.club.name}` : `${Math.round(promiseChance * 100)}% Erfolgschance`,
      typeLabel: reason === "loan" ? "Leihe" : cand.isForeign ? "Ausland" : "Inland",
      isStay: false,
    };
    return {
      id: `club-${cand.club.id}`,
      label:
        reason === "loan"
          ? `Leihe zu ${cand.club.city} (${cand.flag} ${cand.countryName})`
          : cand.isForeign
          ? `Auslandswechsel zu ${cand.club.city} (${cand.flag} ${cand.countryName})`
          : `Wechsel zu ${cand.club.city}`,
      // Vereinsstärke des Kandidaten DIREKT neben der des aktuellen Vereins, damit
      // der Sprung (oder Rückschritt) auf einen Blick erkennbar ist, statt den
      // eigenen Vereinswert erst im Dashboard nachschlagen zu müssen. Beide über
      // `displayClubStrength` international vergleichbar gemacht - der rohe
      // `strength`-Wert ist rein LOKAL je Liga normiert (siehe dort) und beim
      // Vergleich zweier Vereine aus unterschiedlichen Ländern sonst irreführend
      // (Bugreport: ein Verein aus einer kleinen Liga wirkte mit rohem Wert
      // "stärker" als einer aus der angesehensten Liga der Auswahl). Nur noch als
      // Textfallback (z.B. Sharepic-Caption o.ä.) - die eigentliche Anzeige nutzt
      // jetzt `offerCard` (siehe `EventCard`).
      detail:
        reason === "loan"
          ? `${cand.leagueLabel} · Vereinsstärke ${candStrengthForTransfer} · Ein Jahr Leihe, danach automatische Rückkehr zu ${player.club.name} · Gehalt ca. ${formatMoney(wagePreview)}/Jahr`
          : `${cand.leagueLabel} · Vereinsstärke ${candStrengthForTransfer} (aktuell: ${currentStrengthDisplay}) · Einsatzminuten-Versprechen: ${squadRoleLabel(promisedRole, player.position)} (${Math.round(promiseChance * 100)}% Erfolgschance) · Gehalt ca. ${formatMoney(wagePreview)}/Jahr${cand.isForeign ? " · Auslandswechsel" : ""}`,
      effects: {},
      offerCard,
    };
  });

  if (reason === "pro-debut") {
    // Treue-Option zum eigenen Jugendverein - mit echtem, spürbarem Bonus
    // gegenüber einem Fremdwechsel (bessere Startbeziehung, etwas Moral- und
    // Mentalitätsschub durch die vertraute Umgebung), damit "beim Verein
    // bleiben" eine attraktive und keine bloß neutrale Wahl ist.
    const stayWagePreview = estimateWage(
      overall,
      player.reputation,
      player.club,
      player.country,
      clubLeagueRank(player.club.clubId, player.club.tier, league)
    );
    choices.push({
      id: "stay-debut",
      label: `Profivertrag bei ${player.club.name} unterschreiben`,
      detail: `Bleib deinem Jugendverein treu · Rolle voraussichtlich ${squadRoleLabel(squadRoleForOverall(overall, currentStrength, player.position), player.position)} · Gehalt ca. ${formatMoney(stayWagePreview)}/Jahr · Vertrauensbonus durch die vertraute Umgebung`,
      effects: {},
      offerCard: {
        headline: `Bei ${player.club.name} bleiben`,
        league: leagueNameForTier(league, player.club.tier),
        strength: currentStrengthDisplay,
        wage: stayWagePreview,
        roleLabel: squadRoleLabel(squadRoleForOverall(overall, currentStrength, player.position), player.position),
        roleSub: "Vertrauensbonus durch die vertraute Umgebung",
        typeLabel: "Bleiben",
        isStay: true,
      },
    });
  } else if (reason === "opportunity" || reason === "lockruf") {
    choices.push({
      id: "stay",
      label: `Bei ${player.club.name} bleiben`,
      detail: `Zeigt dem Verein die Treue - stärkt die Vereinsbeziehung. Vereinsstärke bleibt bei ${currentStrengthDisplay}.`,
      effects: {},
      offerCard: {
        headline: `Bei ${player.club.name} bleiben`,
        league: leagueNameForTier(league, player.club.tier),
        strength: currentStrengthDisplay,
        wage: player.contract.wagePerYear,
        roleLabel: "Treue",
        roleSub: "stärkt Vereinsbeziehung",
        typeLabel: "Bleiben",
        isStay: true,
      },
    });
  } else if (reason === "loan") {
    choices.push({
      id: "stay",
      label: `Beim Verein um den Stammplatz kämpfen`,
      detail: `Lehnt die Leihe ab und bleibt bei ${player.club.name} - riskanter, aber keine Reise ins Ungewisse.`,
      effects: {},
      offerCard: {
        headline: `Bei ${player.club.name} bleiben`,
        league: leagueNameForTier(league, player.club.tier),
        strength: currentStrengthDisplay,
        wage: player.contract.wagePerYear,
        roleLabel: "Kämpfen",
        roleSub: "riskant, aber keine Reise ins Ungewisse",
        typeLabel: "Bleiben",
        isStay: true,
      },
    });
  } else if (reason === "pressure") {
    choices.push({
      id: "fight",
      label: player.consecutiveBenchSeasons >= 1 ? "Kämpfen und den Stammplatz zurückerobern" : "Das Verhältnis kitten und bleiben",
      detail: "Riskant, aber du bleibst bei deinem aktuellen Verein.",
      offerCard: {
        headline: `Bei ${player.club.name} bleiben`,
        league: leagueNameForTier(league, player.club.tier),
        strength: currentStrengthDisplay,
        wage: player.contract.wagePerYear,
        roleLabel: player.consecutiveBenchSeasons >= 1 ? "Kämpfen" : "Kitten",
        roleSub: "riskant, aber du bleibst",
        typeLabel: "Bleiben",
        isStay: true,
      },
      effects: {},
    });
  }

  const relegatedEscape = reason === "opportunity" && lastStats?.relegated;
  const promotedReward = reason === "opportunity" && lastStats?.promoted;
  // Ein aktiv geäußerter Wechselwunsch ist eine andere Geschichte als organisches
  // Scouting-Interesse - der Text soll den TATSÄCHLICHEN Auslöser nennen, nicht
  // immer pauschal "Scouts sind aufmerksam geworden" behaupten, wenn der Spieler
  // selbst den Wechsel eingefordert hat (siehe `shouldTriggerTransferOpportunity`).
  const wishDriven = reason === "opportunity" && player.wantsTransfer && !relegatedEscape && !promotedReward;
  // "lockruf" zeigt IMMER genau einen Kandidaten (siehe totalCount oben) - die
  // Rahmung wechselt zufällig zwischen "der Berater bringt es mit" und "der
  // Verein meldet sich direkt", damit die neue Mechanik nicht bei jeder Karriere
  // exakt gleich klingt.
  const lockrufClub = reason === "lockruf" ? candidates[0]?.club.city : undefined;
  const lockrufBeraterFraming = reason === "lockruf" && rng() < 0.5;

  const title =
    reason === "pro-debut"
      ? "Dein erster Profivertrag"
      : relegatedEscape
      ? "Rettungsanker im Sommertransferfenster"
      : promotedReward
      ? "Der Aufstieg zahlt sich im Sommer aus"
      : wishDriven
      ? "Dein Wechselwunsch trägt Früchte"
      : reason === "lockruf"
      ? lockrufBeraterFraming
        ? "Dein Berater bringt ein konkretes Angebot mit"
        : `${lockrufClub} will dich sofort verpflichten`
      : reason === "opportunity"
      ? "Interesse von anderen Vereinen im Sommertransferfenster"
      : reason === "loan"
      ? "Der Verein bietet eine Leihe an"
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
      : wishDriven
      ? `Dein öffentlich geäußerter Wechselwunsch bleibt nicht ungehört - im Sommertransferfenster melden sich prompt ${count} Vereine, die genau darauf gewartet haben.${foreignNote}`
      : reason === "lockruf"
      ? lockrufBeraterFraming
        ? `${lastSeasonRef}hat dein Berater im Hintergrund die Fühler ausgestreckt - ${lockrufClub} (Vereinsstärke ${candidates[0] ? displayClubStrength(candidates[0].club.strength, candidates[0].countryId) : ""}) legt jetzt ein einzelnes, konkretes Angebot auf den Tisch. Kein Vorgeplänkel, direkt mit Konditionen: annehmen oder bei ${player.club.name} (Vereinsstärke ${currentStrengthDisplay}) bleiben.`
        : `${lastSeasonRef}meldet sich der Verein völlig überraschend (Vereinsstärke ${candidates[0] ? displayClubStrength(candidates[0].club.strength, candidates[0].countryId) : ""}) mit einem einzelnen, konkreten Angebot. Kein Vorgeplänkel, direkt mit Konditionen: annehmen oder bei ${player.club.name} (Vereinsstärke ${currentStrengthDisplay}) bleiben.`
      : reason === "opportunity"
      ? `${lastSeasonRef}sind Scouts auf ${player.name} bei ${player.club.name} aufmerksam geworden. Im Sommertransferfenster erkundigen sich ${count} Vereine nach dir.${foreignNote}`
      : reason === "loan"
      ? `${deriveLoanReason(player).text} Konkret bietet der Verein eine einjährige Leihe zu ${candidates[0]?.club.city} (${candidates[0]?.flag} ${candidates[0]?.countryName}) an. Du hast dabei kaum Mitsprache bei der Wahl - Vorgabe ist Vorgabe. Nach einem Jahr geht es garantiert zurück zu ${player.club.name}.`
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
  // Höchste Priorität, noch vor dem Profidebüt: eine laufende Leihe (siehe
  // `ClubOfferReason` "loan") endet nicht zufällig, sondern erzwingt im
  // nächsten Sommertransferfenster GARANTIERT die vertraglich vereinbarte
  // Rückkehr zum Stammverein - kein Losglück, keine Konkurrenz zu anderen
  // Auslösern.
  if (player.loanActive) {
    player.seasonsSinceTransferEvent = 0;
    return "loan-return";
  }
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
  // Niedrigste Priorität: der seltene, direkte Lockversuch eines einzelnen
  // Vereins füllt nur die Lücken, in denen keiner der obigen (höher
  // priorisierten) Auslöser schon gegriffen hat.
  if (shouldTriggerSingleClubApproach(player)) {
    player.seasonsSinceTransferEvent = 0;
    return "lockruf";
  }
  // Niedrigste Priorität von allen: ein zeitweises Leihgeschäft für junge
  // Spieler ohne ausreichend Einsatzzeit (siehe `shouldTriggerLoanAbroad`) -
  // füllt nur die Lücken, in denen wirklich kein anderer Auslöser gegriffen hat.
  if (shouldTriggerLoanAbroad(player)) {
    player.seasonsSinceTransferEvent = 0;
    return "loan";
  }
  return null;
}

/**
 * "Hard Priority" für narrative Ereignisse (siehe "EVENT-POOL INTEGRATION"
 * Abschnitt 4/5) - reserviert bei einem ECHTEN, mehrere Saisons anhaltenden
 * Karriere-Wendepunkt (TURNING_POINT) gezielt einen Slot für ein passendes
 * narratives Event, statt es dem reinen Zufall der gewichteten Auswahl (siehe
 * `EventTemplate.dynamicWeight`, das nur die "soft priority" abdeckt) zu
 * überlassen. Greift bewusst SELTEN (nur bei anhaltenden, nicht bei jeder
 * kleinen Schwankung) - der Aufrufer (App.tsx `handleStartSeason`) ERSETZT
 * damit einen der bereits von `pickSeasonTemplateIds` gezogenen Slots, statt
 * einen zusätzlichen sechsten hinzuzufügen (Basis-Ziehung bleibt bei 3-5).
 */
export function decideNarrativeEventInjection(
  player: Player,
  usedTemplateIds: Set<string>,
  recentTemplateSeasons: Record<string, number>,
  seasonNumber: number
): string | null {
  const eligible = (id: string): boolean => {
    const t = getTemplateById(id);
    if (!t) return false;
    if (player.age < t.minAge || player.age > t.maxAge) return false;
    if (t.unique && usedTemplateIds.has(id)) return false;
    const last = recentTemplateSeasons[id];
    if (last !== undefined && seasonNumber - last < TEMPLATE_HARD_MIN_GAP) return false;
    return t.condition ? t.condition(player) : true;
  };

  const thread = player.activeNarrativeThread;
  if (thread) {
    const seasonsSinceMove = player.seasonHistory.length - thread.seasonHistoryIndex;
    // Anhaltende Anpassungsschwierigkeiten (mindestens 2 Saisons) nach einem
    // großen Wechsel - genau der Fall, den Abschnitt 4/5 als Beispiel nennt.
    if (thread.stage === "STRUGGLE" && seasonsSinceMove >= 2 && eligible("narrative_kaltes_wasser")) {
      return "narrative_kaltes_wasser";
    }
    // Der Wiederaufbau nach einer schwierigen Phase ist selbst ein Wendepunkt -
    // verdient denselben garantierten Slot wie der negative Fall.
    if (thread.stage === "REBUILD" && eligible("narrative_platz_gefunden")) {
      return "narrative_platz_gefunden";
    }
  }
  // Eine lange Nationalmannschafts-Kandidatur-Serie (siehe
  // `Player.nationalTeamCandidacySeasons`) ohne Berufung ist ebenfalls ein
  // echter Wendepunkt-Kandidat, nicht nur eine Randnotiz.
  if (player.nationalTeamCandidacySeasons >= 5 && eligible("narrative_berufungsfrust")) {
    return "narrative_berufungsfrust";
  }
  return null;
}

/** Setzt ein Element an eine bestimmte Position (geklemmt auf die Array-Länge). */
export function insertAt<T>(arr: T[], item: T, index: number): T[] {
  const i = clamp(index, 0, arr.length);
  return [...arr.slice(0, i), item, ...arr.slice(i)];
}

/**
 * Wie `insertAt`, hält die Saison danach aber im bestehenden 3-5-Event-Budget
 * (siehe "EVENT-POOL INTEGRATION" Abschnitt 1/8: Transferangebote/Storyline-
 * Fortsetzungen/narrative Events zählen ALS eines der 3-5 Slots, statt
 * zusätzlich addiert zu werden - Beispiel Abschnitt 8: "Nicht: 4 normale Events
 * + 1 Transfer + 1 Narrative Event, wenn dadurch 6 Events entstehen würden").
 * Entfernt dafür bei Bedarf ein bereits vorhandenes, NICHT geschütztes
 * ("organisches", aus der zufälligen Basis-Ziehung stammendes) Element -
 * `guaranteed` sammelt alle bereits garantiert eingeplanten IDs (Storyline/
 * Angebot/narrative Hard-Priority/Sommerpause), damit spätere Aufrufe
 * einander nicht gegenseitig verdrängen. Bleiben nur noch geschützte Elemente
 * übrig (sehr seltener Grenzfall mehrerer gleichzeitiger Wendepunkte in
 * derselben Saison), wird ausnahmsweise über das Budget hinaus eingefügt,
 * statt bereits garantierten Inhalt wieder zu verwerfen.
 */
export function insertWithinBudget(
  ids: string[],
  id: string,
  index: number,
  guaranteed: Set<string>,
  maxTotal: number
): string[] {
  if (ids.includes(id)) {
    guaranteed.add(id);
    return ids;
  }
  let next = insertAt(ids, id, index);
  guaranteed.add(id);
  while (next.length > maxTotal) {
    let removeIdx = -1;
    for (let i = next.length - 1; i >= 0; i--) {
      if (!guaranteed.has(next[i])) {
        removeIdx = i;
        break;
      }
    }
    if (removeIdx < 0) break; // Grenzfall: alles geschützt, Budget ausnahmsweise überschritten.
    next = [...next.slice(0, removeIdx), ...next.slice(removeIdx + 1)];
  }
  return next;
}

/** Ergebnis einer `club_offer`-Entscheidung - enthält zusätzlich die neue aktive
 * Liga, falls der Wechsel ins Ausland führte (siehe `GameState.foreignLeagues`). */
export interface ClubOfferResult {
  feedback: ChoiceFeedback;
  newActiveLeague?: LeagueState;
  /** IDs bereits fällig eingeplanter Fortsetzungs-Stufen vereinsgebundener Storylines
   * (Rivalität/Trainerzoff/Vereinsikone), die mit diesem Wechsel enden (siehe
   * `CLUB_BOUND_STORYLINES` unten). Eine Fortsetzung kann für DIESELBE Saison schon
   * in der Warteschlange stehen, bevor der Wechsel passiert (Saison-Events werden
   * vorab ausgewählt) - App.tsx muss diese IDs nach einem echten Wechsel noch aus
   * der Warteschlange entfernen, sonst würde z.B. "Zoff mit dem Trainer" beim ALTEN
   * Verein nach dem Wechsel fälschlich beim NEUEN Verein weitererzählt. */
  endedStorylineTemplateIds?: string[];
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
  // Für `Player.transferDecisions` (siehe `recordTransferDecision`) - VOR jeder
  // Mutation eingefroren, da Kaderrolle/Gehalt/Vereinsname unten überschrieben werden.
  const decisionOldRole = player.contract.squadRole;
  const decisionOldWage = player.contract.wagePerYear;
  const decisionOldClubName = player.club.name;
  const decisionOfferCard = event.choices.find((c) => c.id === choiceId)?.offerCard;

  // Die finale Entscheidung nach dem narrativen Leihjahr (siehe loanStory.ts) -
  // beendet den exklusiven Event-State IMMER, unabhängig davon, welche der drei
  // Optionen (bleiben/zurück/abwarten) gewählt wird.
  if (reason === "loan-keep") player.loanNarrative = null;

  if (choiceId === "loan-stay") {
    // Aus der Leihe wird ein dauerhafter Wechsel beim AKTUELLEN (Leih-)Verein -
    // kein Kandidaten-Fund nötig (der Spieler ist ja schon dort), nur ein
    // frischer Vertrag + Vertrauensbonus, weil der Verein aktiv um die
    // dauerhafte Verpflichtung geworben hat.
    const overall = overallRating(player);
    const wage = estimateWage(
      overall,
      player.reputation,
      player.club,
      player.country,
      clubLeagueRank(player.club.clubId, player.club.tier, league)
    );
    player.contract = { club: player.club.name, yearsLeft: 3, wagePerYear: wage, squadRole: currentSquadRole(player, player.club.strength) };
    player.clubRelation = clamp(player.clubRelation + 15, 0, 100);
    player.loanActive = false;
    player.loanReturnClub = null;
    player.loanReturnCountryId = null;
    player.clubChangesCount += 1;
    const text = `${player.name} bleibt dauerhaft bei ${player.club.name} - aus der Leihe wird ein fester Wechsel.`;
    player.log.push({ season: 0, age: player.age, text, kind: "positive" });
    recordTransferDecision(player, "loan-keep", false, decisionOldClubName, player.club.name, decisionOldRole, decisionOfferCard, decisionOldWage);
    return {
      feedback: {
        choiceId,
        text,
        kind: "positive",
        deltaLines: [`Fester Vertrag bei ${player.club.name}`, `Gehalt: ${formatMoney(wage)} / Jahr`, "Vereinsbeziehung +15"],
      },
    };
  }

  // "Abwarten" führt vertraglich trotzdem zurück zum Stammverein (die Leihe ist
  // vorbei, ein Verbleib "in der Schwebe" gibt es nicht) - fällt bewusst in
  // denselben Rückkehr-Pfad wie eine explizite Rückkehr weiter unten, nur mit
  // offenem Wechselwunsch statt endgültigem Schlussstrich.
  const isOpenFuture = choiceId === "loan-wait";
  const resolvedChoiceId = isOpenFuture && player.loanReturnClub ? `club-${player.loanReturnClub.clubId}` : choiceId;

  if (resolvedChoiceId === "stay") {
    player.clubRelation = clamp(player.clubRelation + 10, 0, 100);
    player.morale = clamp(player.morale + 5, 0, 100);
    player.wantsTransfer = false;
    const text = `${player.name} bleibt ${player.club.name} treu.`;
    player.log.push({ season: 0, age: player.age, text, kind: "positive" });
    recordTransferDecision(player, reason, true, decisionOldClubName, player.club.name, decisionOldRole, decisionOfferCard, decisionOldWage);
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
    const wage = estimateWage(
      overall,
      player.reputation,
      player.club,
      player.country,
      clubLeagueRank(player.club.clubId, player.club.tier, league)
    );
    const newRole = squadRoleForOverall(overall, player.club.strength, player.position);
    player.contract = { club: player.club.name, yearsLeft: 3, wagePerYear: wage, squadRole: newRole };
    player.clubRelation = 75;
    player.morale = clamp(player.morale + 10, 0, 100);
    player.attributes.mentalitaet = clamp(player.attributes.mentalitaet + 1, 1, 99);
    player.traits.arbeitsmoral = clamp(player.traits.arbeitsmoral + 3, 0, 100);
    player.wantsTransfer = false;
    const text = `${player.name} unterschreibt treu beim eigenen Jugendverein ${player.club.name} den ersten Profivertrag.`;
    player.log.push({ season: 0, age: player.age, text, kind: "milestone" });
    recordTransferDecision(player, reason, true, decisionOldClubName, player.club.name, decisionOldRole, decisionOfferCard, decisionOldWage);
    return {
      feedback: {
        choiceId,
        text,
        kind: "positive",
        deltaLines: [
          `Neue Rolle im Kader: ${squadRoleLabel(newRole, player.position)}`,
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
    recordTransferDecision(player, reason, true, decisionOldClubName, player.club.name, decisionOldRole, decisionOfferCard, decisionOldWage);
    return {
      feedback: { choiceId, text, kind: "positive", deltaLines: ["Vereinsbeziehung +15", "Moral +8", "Bankphasen-Druck sinkt"] },
    };
  }

  const clubId = resolvedChoiceId.replace(/^club-/, "");
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
  const oldClubId = player.club.clubId;
  const oldTier = player.club.tier;
  const wageCountryId = movingCountryId ?? player.country;
  player.club = { clubId: chosen.id, name: chosen.city, country: targetLeague.countryName, tier: chosen.tier, strength: chosen.strength };
  const wage = estimateWage(overall, player.reputation, chosen, wageCountryId, clubLeagueRank(chosen.id, chosen.tier, targetLeague));
  // Derselbe bewiesene Stammspieler-Bodensatz wie in der Angebots-Vorschau (siehe
  // `transferEffectiveOverall`), damit das dort gezeigte Versprechen exakt dem
  // entspricht, was hier tatsächlich ausgewürfelt wird - dieselbe international
  // vergleichbare Skala wie in `buildClubOfferEvent` (siehe `displayClubStrength`
  // dort), altes UND neues Land jeweils mit dem eigenen Länderansehen normiert.
  const transferOverall = transferEffectiveOverall(player, overall, displayClubStrength(oldStrength, oldCountryId));
  const promisedRole = squadRoleForOverall(transferOverall, displayClubStrength(chosen.strength, wageCountryId), player.position);
  // Das in der Angebots-Vorschau gezeigte Einsatzminuten-Versprechen (siehe
  // `buildClubOfferEvent`) wird hier tatsächlich ausgewürfelt: je größer der
  // Sprung zwischen eigener Stärke und Vereinsniveau, desto eher bleibt es ein
  // Lippenbekenntnis und die tatsächliche Rolle fällt eine Stufe niedriger aus.
  const promiseChance = rolePromiseChance(transferOverall, displayClubStrength(chosen.strength, wageCountryId));
  const promiseKept = rng() < promiseChance;
  const newRole = promiseKept ? promisedRole : roleOneStepDown(promisedRole, player.position);
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
    // Einmal im Ausland gespielt heißt für die "Ligalegende" (siehe computeAchievements)
    // dauerhaft raus - auch eine spätere Heimkehr macht die Karriere nicht rückwirkend
    // wieder zu einer reinen Ein-Land-Karriere.
    player.playedAbroad = true;
  }

  const leagueLabel = leagueNameForTier(targetLeague, chosen.tier);

  const kind: LogEntry["kind"] =
    reason === "pro-debut"
      ? "milestone"
      : reason === "pressure"
      ? "negative"
      : reason === "loan-return" || reason === "loan-keep"
      ? "info"
      : "positive";
  const text =
    reason === "pro-debut"
      ? `${player.name} unterschreibt den ersten Profivertrag bei ${chosen.city} (${leagueLabel}).`
      : reason === "loan"
      ? `${player.name} wird für ein Jahr an ${chosen.city} (${targetLeague.flag} ${targetLeague.countryName}, ${leagueLabel}) verliehen.`
      : reason === "loan-return"
      ? `${player.name} kehrt nach der Leihe zu ${chosen.city} zurück.`
      : reason === "loan-keep"
      ? isOpenFuture
        ? `${player.name} lässt die Zukunft vorerst offen und kehrt nach der Leihe zu ${chosen.city} zurück.`
        : `${player.name} kehrt nach der Leihe zu ${chosen.city} zurück.`
      : movingCountryId
      ? `${player.name} wagt den Auslandswechsel von ${oldName} zu ${chosen.city} (${targetLeague.flag} ${targetLeague.countryName}, ${leagueLabel}).`
      : `${player.name} wechselt von ${oldName} zu ${chosen.city} (${leagueLabel}).`;
  if (reason === "loan-keep" && isOpenFuture) player.wantsTransfer = true;
  player.log.push({ season: 0, age: player.age, text, kind });

  // Ergebnis des Einsatzminuten-Versprechens als eigener Log-Eintrag - klar
  // getrennt von der reinen Wechsel-Meldung, damit sichtbar wird, WARUM die
  // tatsächliche Rolle ggf. von der versprochenen abweicht. Bei der Rückkehr
  // von der Leihe entfällt das (siehe Cointoss-Block unten stattdessen).
  if (reason !== "loan-return" && reason !== "loan-keep") {
    player.log.push({
      season: 0,
      age: player.age,
      text: promiseKept
        ? `${chosen.city} hält das Einsatzminuten-Versprechen ein - ${player.name} startet als ${squadRoleLabel(newRole, player.position)}.`
        : `${chosen.city} hält das Einsatzminuten-Versprechen nicht ein - ${player.name} landet zunächst nur als ${squadRoleLabel(newRole, player.position)} im Kader.`,
      kind: promiseKept ? "positive" : "negative",
    });
  }

  // Leihgeschäft: Buchhaltung für die garantierte Rückkehr (siehe
  // `decideClubOfferInjection`) bzw. Auflösung + Cointoss-Bonus bei der
  // tatsächlichen Rückkehr - bewusst als echter Münzwurf (nicht an die
  // Leih-Saison-Bewertung gekoppelt), weil die Perspektive nach einer Leihe
  // laut Vorgabe bewusst UNGEWISS bleiben soll, nicht kalkulierbar.
  if (reason === "loan") {
    player.loanActive = true;
    player.loanReturnClub = { clubId: oldClubId, name: oldName, country: league.countryName, tier: oldTier, strength: oldStrength };
    player.loanReturnCountryId = oldCountryId;
    // Startet den exklusiven Leihjahr-Event-State (siehe loanStory.ts/App.tsx
    // handleChoice) - der Grund wurde bereits VOR dem Wechsel anhand des alten
    // Vereins/der alten Kaderrolle abgeleitet (siehe `buildClubOfferEvent`),
    // hier erneut ermittelt (identischer Spielerzustand zu diesem Zeitpunkt in
    // derselben Funktion, keine zusätzliche State-Übergabe nötig).
    const reasonInfo = deriveLoanReason(player);
    player.loanNarrative = {
      reasonId: reasonInfo.id,
      reasonTitle: reasonInfo.title,
      reasonText: reasonInfo.text,
      loanClubName: chosen.city,
      momentum: 0,
      momentumEmoji: "🟡",
      momentumLabel: "Neutral",
      decisions: [],
      overallAtLoanStart: overall,
      attributesAtLoanStart: { ...player.attributes },
    };
  } else if (reason === "loan-return" || reason === "loan-keep") {
    player.loanActive = false;
    player.loanReturnClub = null;
    player.loanReturnCountryId = null;
    const coinToss = rng() < 0.5;
    if (coinToss) {
      player.reputation = clamp(player.reputation + 6, 0, 100);
      player.morale = clamp(player.morale + 6, 0, 100);
      player.roleProtectionSeasons = Math.max(player.roleProtectionSeasons, 2);
      player.log.push({
        season: 0,
        age: player.age,
        text: `${player.name} kehrt gereift von der Leihe zurück und überzeugt beim alten Verein von Beginn an.`,
        kind: "positive",
      });
    } else {
      player.morale = clamp(player.morale - 4, 0, 100);
      player.clubRelation = clamp(player.clubRelation - 3, 0, 100);
      player.log.push({
        season: 0,
        age: player.age,
        text: `${player.name} tut sich nach der Rückkehr von der Leihe zunächst schwer, sich wieder einzufügen.`,
        kind: "negative",
      });
    }
  }

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
    ...(reason === "loan-return" || reason === "loan-keep"
      ? []
      : [
          promiseKept
            ? `Einsatzminuten-Versprechen eingehalten (${Math.round(promiseChance * 100)}% Chance)`
            : `Einsatzminuten-Versprechen NICHT eingehalten (${Math.round(promiseChance * 100)}% Chance verpasst) - Vereinsbeziehung startet niedriger`,
        ]),
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
  // Eine Rückkehr ins eigene Heimatland ist davon ausgenommen: vertraute Sprache,
  // Kultur und Umfeld machen "Heimkehr" zu etwas durchweg Positivem statt eines
  // Eingewöhnungs-Risikos wie bei jedem anderen Auslandswechsel.
  if (movingCountryId) {
    const isHomecoming = movingCountryId === player.homeCountryId;
    if (isHomecoming) {
      player.morale = clamp(player.morale + 10, 0, 100);
      player.clubRelation = clamp(player.clubRelation + 5, 0, 100);
      deltaLines.push("🏡 Heimkehr: vertraute Sprache, Kultur und Umfeld sorgen für einen runden Start");
      player.log.push({ season: 0, age: player.age, text: `${player.name} kehrt in die Heimat zurück und kommt sofort gut an.`, kind: "positive" });
    } else {
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
    }

    if (player.relationshipStatus !== "single") {
      const partnerLabel = player.partnerName ?? "Der Partner";
      // Bei einer Heimkehr zieht der Partner deutlich lieber und leichter mit.
      const partnerThriveChance = isHomecoming ? 0.85 : 0.6;
      if (rng() < partnerThriveChance) {
        player.morale = clamp(player.morale + 3, 0, 100);
        deltaLines.push(
          isHomecoming ? `${partnerLabel} freut sich sichtlich über die Rückkehr in die Heimat` : `${partnerLabel} zieht mit und gibt Rückhalt beim Neustart`
        );
      } else {
        player.morale = clamp(player.morale - 3, 0, 100);
        deltaLines.push(`${partnerLabel} tut sich mit dem Umzug zunächst schwer`);
      }
    }
  }

  const recordedDecision = recordTransferDecision(
    player,
    reason,
    false,
    decisionOldClubName,
    chosen.city,
    decisionOldRole,
    decisionOfferCard,
    decisionOldWage
  );
  maybeStartNarrativeThread(player, recordedDecision);
  return {
    feedback: { choiceId, text, kind, deltaLines },
    newActiveLeague,
    endedStorylineTemplateIds: endedThreads.map((t) => t.nextTemplateId),
  };
}

/**
 * Abschnitt 7+8: baut die Entscheidung am ENDE des narrativen Leihjahres - ob
 * der Leihverein eine dauerhafte Verpflichtung anbietet (Wahrscheinlichkeit
 * abhängig von der tatsächlichen Saisonbewertung + wie gut der Spieler zum
 * Verein passt, siehe `loanClubKeepChance`) und, falls ja, die Wahl zwischen
 * bleiben/zurück/abwarten. Direkt als GameEvent gebaut (wie
 * `buildRetirementEvent`) statt über `EVENT_TEMPLATES` - kein Zufalls-Draw,
 * wird von App.tsx `handleContinueFromSummary` unmittelbar nach der
 * Saisonbilanz einer Leih-Saison erzwungen. Der `club_offer:`-Präfix im
 * `templateId` lässt App.tsx die Auflösung automatisch an das bereits
 * bestehende `applyClubOfferChoice` weiterreichen (siehe `isClubOfferEvent`).
 */
export function buildLoanFutureEvent(player: Player): GameEvent {
  const narrative = player.loanNarrative!;
  const back = player.loanReturnClub!;
  const overall = overallRating(player);
  const tier = computeLoanSummaryTier(narrative.decisions.map((d) => d.modifiedRoll));
  const keepChance = loanClubKeepChance(tier.id, overall, player.club.strength);
  const offerMade = rng() < keepChance;
  const backDetail = `${back.tier === 1 ? "1." : "2."} Liga · Vereinsstärke ${displayClubStrength(back.strength, player.loanReturnCountryId ?? player.homeCountryId)}`;

  if (!offerMade) {
    return {
      id: `loan-future-${player.age}-${Math.round(rng() * 1e6)}`,
      templateId: `${CLUB_OFFER_PREFIX}loan-keep`,
      category: "leihe",
      title: "Zurück zum Stammverein",
      description: `${player.club.name} möchte dich nicht dauerhaft verpflichten. Du kehrst nach Ablauf der Leihe zu ${back.name} zurück.`,
      choices: [{ id: `club-${back.clubId}`, label: `Zurück zu ${back.name}`, detail: backDetail, effects: {} }],
    };
  }

  return {
    id: `loan-future-${player.age}-${Math.round(rng() * 1e6)}`,
    templateId: `${CLUB_OFFER_PREFIX}loan-keep`,
    category: "leihe",
    title: "Der Leihverein möchte dich behalten",
    description: `Deine Leistungen bei ${player.club.name} haben überzeugt - der Verein möchte dich dauerhaft verpflichten.`,
    choices: [
      { id: "loan-stay", label: "Ich möchte bleiben", detail: `Dauerhafter Wechsel zu ${player.club.name}`, effects: {} },
      { id: `club-${back.clubId}`, label: "Ich möchte zurück", detail: `Rückkehr zu ${back.name} · ${backDetail}`, effects: {} },
      { id: "loan-wait", label: "Ich möchte abwarten", detail: "Offene Verhandlung - die Zukunft bleibt vorerst offen", effects: {} },
    ],
  };
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
  // Vereinszugehörigkeit im Sinne der Karrierestatistik ("Vereinstreue",
  // Karriereverlauf, "Vereinsgeschichte von X") beginnt erst mit dem ersten
  // Profivertrag - die Jugendakademie-Jahre zählen bewusst nicht mit (siehe
  // `PRO_DEBUT_AGE`).
  for (const s of player.seasonHistory) {
    if (s.age < PRO_DEBUT_AGE) continue;
    const last = tenures[tenures.length - 1];
    // Eine Leih-Saison (siehe `SeasonStats.onLoan`) bildet IMMER eine eigene,
    // exakt eine Saison lange Zugehörigkeit - verschmilzt weder mit der Zeit
    // beim Stammverein davor noch (bei dauerhaftem Verbleib nach der Leihe) mit
    // den Saisons beim selben Verein danach. Das "(L)"-Kürzel (siehe
    // `ClubTenure.onLoan`) soll sich sonst sonst fälschlich auf eine ganze,
    // längere Vereinszugehörigkeit erstrecken, obwohl nur eine einzelne Saison
    // davon tatsächlich eine Leihe war.
    if (last && last.club === s.club && !last.onLoan && !s.onLoan) {
      last.toAge = s.age;
      last.seasons += 1;
      last.avgScore += s.score;
      if (s.promoted) last.promoted = true;
      if (s.relegated) last.relegated = true;
    } else {
      tenures.push({
        club: s.club,
        fromAge: s.age,
        toAge: s.age,
        seasons: 1,
        avgScore: s.score,
        promoted: s.promoted,
        relegated: s.relegated,
        onLoan: s.onLoan,
      });
    }
  }
  for (const t of tenures) {
    t.avgScore = Math.round(t.avgScore / t.seasons);
  }
  return tenures;
}

// Dünner Re-Export: die eigentliche Logik lebt in types.ts (siehe dort), damit
// auch events.ts (kann careerEngine.ts nicht importieren, zirkulärer Import)
// spätcarriere-Events daran koppeln kann, ohne sie kurz vor Karriereende zu ziehen.
export const shouldOfferRetirement = isNearRetirement;

/**
 * Titel-Gewichtung nach Wettbewerbsstufe (siehe Vorgabe Abschnitt 33) - ein
 * Champions-Cup-Sieg muss deutlich mehr Legacy erzeugen als ein Landespokal.
 * Individuelle Auszeichnungen (Torschützenkönig etc.) laufen bewusst NICHT hier
 * mit ein - die boosten schon direkt `player.reputation` (siehe `simulateSeason`),
 * fließen also über den Bekanntheits-Faktor unten ein, statt hier doppelt zu zählen.
 */
const TROPHY_LEGACY_POINTS: Record<string, number> = {
  "Zweitliga-Meisterschaft": 90,
  Landespokal: 105,
  Meisterschale: 150,
  "Europa Cup": 260,
  "Champions Cup": 420,
};

/** Für den Legendary-Season-Bonus (siehe Vorgabe Abschnitt 38): nur die "großen"
 * Wettbewerbstitel zählen, ein Landespokal allein macht noch keine legendäre Saison. */
const LEGENDARY_SEASON_TROPHIES = new Set(["Meisterschale", "Europa Cup", "Champions Cup"]);

/**
 * Legacy-Score: bewertet die GESAMTE Karriere (siehe Vorgabe Abschnitt 31/39,
 * Abgrenzung zu `computeSeasonScore`, das nur EINE Saison bewertet). Zielbild
 * der Gewichtung (kalibriert über 1000+ simulierte Karrieren, siehe
 * sim_legacy_*.ts): ~30% Karriere-/Peak-Performance, ~35% sportliche
 * Erfolge/Output (Titel nach Wettbewerbsstufe + Tore/Vorlagen), ~13% Status
 * (Bekanntheit + Nationalmannschaft), ~10% Vermögen (log-skaliert statt linear -
 * siehe Bugreport: die alte lineare `wealth/5000`-Formel machte Vermögen zu
 * knapp 57% des GESAMTEN Scores, weit vor jeder sportlichen Leistung), ~12%
 * Karrieregeschichte/Soft Factors (Charakter, Vereinstreue, Verletzungshistorie,
 * Familie). Diese Prozentsätze sind ein Zielbild, keine exakte Formel - die
 * konkreten Konstanten unten wurden iterativ gegen die Simulation kalibriert.
 */
export function computeLegacy(player: Player): { score: number; tier: string; factors: ScoreFactor[] } {
  const t = player.careerTotals;
  const history = player.seasonHistory;

  // --- Sportliche Performance (Karriere-Ø + Peak, siehe Vorgabe Abschnitt 30) ---
  const careerPerformanceAvg = history.length > 0 ? history.reduce((s, x) => s + x.performanceScore, 0) / history.length : 50;
  const topSeasons = [...history].sort((a, b) => b.performanceScore - a.performanceScore).slice(0, 3);
  const peakPerformanceAvg = topSeasons.length > 0 ? topSeasons.reduce((s, x) => s + x.performanceScore, 0) / topSeasons.length : 50;

  // --- Titel nach Wettbewerbsstufe gewichtet (siehe `TROPHY_LEGACY_POINTS`) ---
  const titlePoints = t.trophies.reduce((sum, trophy) => sum + (TROPHY_LEGACY_POINTS[trophy] ?? 0), 0);

  // --- Legendary-Season-Bonus (Vorgabe Abschnitt 38): außergewöhnliche Saison-
  // Performance (Top-15%-Bereich) KOMBINIERT mit einem großen Titel in derselben
  // Saison - bewusst selten (braucht beides gleichzeitig) und mit festem, nicht
  // weiter skalierendem Betrag, damit daraus keine neue dominante Punktquelle wird.
  const legendarySeasons = history.filter((s) => s.performanceScore >= 85 && s.trophies.some((tr) => LEGENDARY_SEASON_TROPHIES.has(tr)));
  const legendaryBonus = legendarySeasons.length * 60;

  // --- Vermögen: log-skaliert statt linear (siehe Funktions-Kommentar oben) -
  // zusätzliches Vermögen bleibt immer positiv, der Grenznutzen sinkt aber stark:
  // 50 Mio. sind bei Weitem nicht doppelt so viel Legacy wert wie 5 Mio.
  const wealthPoints = Math.round(40 * Math.log(1 + Math.max(0, player.wealth) / 100000));

  const factors: ScoreFactor[] = [
    { label: "Karriere-Performance", points: Math.round((careerPerformanceAvg - 50) * 18) },
    { label: "Peak-Performance", points: Math.round((peakPerformanceAvg - 50) * 10) },
    { label: "Titel", points: titlePoints },
    { label: "Tore", points: Math.round(t.goals * 0.8) },
    { label: "Vorlagen", points: Math.round(t.assists * 0.6) },
    { label: "Bekanntheit", points: Math.round(player.reputation * 1.8) },
    { label: "Nationalmannschaft", points: Math.round(player.nationalTeamCaps * 4 + player.nationalTeamGoals * 8) },
    { label: "Vermögen", points: wealthPoints },
    // Gestaffelt statt einer harten 3-Stufen-Klippe: die allermeisten Karrieren
    // laufen realistisch über 3-4 Vereine, nicht nur einen einzigen - das zählt
    // hier bewusst noch als "treu" (spürbar positiv), statt neutral/bestraft zu
    // werden. Erst ab 5+ Wechseln kippt der Faktor ins Negative.
    { label: "Vereinstreue", points: clamp(50 - player.clubChangesCount * 10, -35, 55) },
    { label: "Familie", points: (player.relationshipStatus === "verheiratet" ? 35 : 0) + player.children * 18 },
    { label: "Verletzungshistorie", points: player.totalInjuryWeeks >= 60 ? -70 : player.totalInjuryWeeks <= 10 ? 40 : 0 },
    {
      label: "Charakter & Image",
      points: Math.round(
        1.6 * (player.traits.arbeitsmoral - 50 + (player.traits.disziplin - 50) + (player.traits.medienimage - 50) + (player.traits.fuehrung - 50))
      ),
    },
  ];
  if (legendaryBonus > 0) {
    factors.push({ label: "Legendäre Saison(s)", points: legendaryBonus });
  }

  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));

  let tier = "Vereinsspieler";
  if (score >= 1400) tier = "Weltklasse-Legende";
  else if (score >= 850) tier = "Nationale Ikone";
  else if (score >= 500) tier = "Publikumsliebling";
  else if (score >= 220) tier = "Solider Profi";

  return { score, tier, factors };
}

// ---------------------------------------------------------------------------
// Achievements ("Erfolge") - werden am Karriereende einmalig berechnet
// ---------------------------------------------------------------------------

/**
 * Vermögens-Erfolg, gestaffelt statt einer einzelnen Schwelle: eine Simulation
 * über 300 Karrieren zeigte, dass die alte einzelne Schwelle (2 Mio.) bei den
 * im Spiel üblichen Gehältern praktisch IMMER erreicht wurde (P10 der
 * simulierten Karrieren lag schon bei über 3 Mio.) - das Achievement war damit
 * kaum aussagekräftig. Absteigend geprüft, nur die höchste erreichte Stufe
 * wird gezeigt (kein Zuschütten mit 3 redundanten Badges gleichzeitig).
 */
/** Länderspiel-Erfolg, ebenfalls gestaffelt (siehe `WEALTH_TIERS`) statt einer
 * einzelnen Schwelle - passend zur neu gestaffelten Berufungslogik (siehe
 * `nationalTeamCallUpChance` in events.ts): 20+ bleibt ein solider Nationalspieler-
 * Meilenstein, 100+ ist der seltene "Wunderkind"-Legendenstatus. */
const NATIONAL_TEAM_TIERS: { id: string; label: string; description: string; threshold: number }[] = [
  { id: "nationalmannschaft_legende", label: "Nationalmannschafts-Legende", description: "Über 100 Länderspiele - eine echte Institution in der Nationalelf.", threshold: 100 },
  { id: "nationalmannschaft_stuetze", label: "Nationalmannschafts-Stütze", description: "Über 50 Länderspiele - ein fester Bestandteil der Nationalelf.", threshold: 50 },
  { id: "nationalspieler", label: "Nationalspieler", description: "20 oder mehr Länderspiele bestritten.", threshold: 20 },
];

const WEALTH_TIERS: { id: string; label: string; description: string; threshold: number }[] = [
  { id: "wirtschaftsimperium", label: "Eigenes Wirtschaftsimperium", description: "Über 25 Mio. € Karrierevermögen - ein eigenes Wirtschaftsimperium neben dem Fußball.", threshold: 25_000_000 },
  { id: "fussball_kroesus", label: "Fußball-Krösus", description: "Über 15 Mio. € Karrierevermögen erwirtschaftet.", threshold: 15_000_000 },
  { id: "multimillionaer", label: "Multimillionär", description: "Über 8 Mio. € Karrierevermögen erwirtschaftet.", threshold: 8_000_000 },
  { id: "millionaer", label: "Selfmade-Millionär", description: "Über 2 Mio. € Karrierevermögen erwirtschaftet.", threshold: 2_000_000 },
];

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Karriere-Erzählzustand (siehe `CareerNarrativeState`) - REIN ABGELEITET aus
 * bereits vorhandenen Daten (`seasonHistory`/`transferDecisions`/`nationalTeamCaps`/
 * aktuellen Attributen), kein eigenes Persistenz-Feld, keine Rückwirkung auf
 * Spiellogik. Kann jederzeit (laufende Karriere oder am Karriereende) neu berechnet
 * werden - siehe Vorgabe "CAREER NARRATIVE & DECISION IMPACT SYSTEM" Teil B.
 *
 * Der Vorher/Nachher-Vergleich je Entscheidung (`DecisionImpact`) folgt exakt der in
 * der 1500-Karrieren-Diagnose (Teil A) validierten Methodik: bis zu 2 Saisons VOR
 * bzw. NACH der Entscheidung gemittelt (kein naiver Einzelsaison-Vergleich), der
 * Trend VOR der Entscheidung (halbe Steigung) als Erwartungswert-Basis für den
 * tatsächlichen `perfImpact`.
 */
/** Trend aus zwei Fenstern (jüngst vs. davor) ableiten - `null`/leere Fenster geben
 * bewusst "stable" zurück (keine Über-Interpretation ohne genug Datenpunkte). Schwelle
 * bewusst moderat (>4 Punkte auf der 0-100-`performanceScore`-Skala bzw. 4 Prozentpunkte
 * Einsatzquote bzw. 3 Punkte Vereinsstärke), damit nicht jede Mikro-Schwankung schon
 * als "Trend" gilt. */
function trendFrom(recentAvg: number | null, priorAvg: number | null, threshold: number): NarrativeTrend {
  if (recentAvg === null || priorAvg === null) return "stable";
  const delta = recentAvg - priorAvg;
  if (delta > threshold) return "rising";
  if (delta < -threshold) return "falling";
  return "stable";
}

export function computeCareerNarrativeState(player: Player): CareerNarrativeState {
  const hist = player.seasonHistory;
  const decisionImpacts: DecisionImpact[] = player.transferDecisions.map((d) => {
    const preStart = Math.max(0, d.seasonHistoryIndex - 2);
    const pre = hist.slice(preStart, d.seasonHistoryIndex);
    const post = hist.slice(d.seasonHistoryIndex, d.seasonHistoryIndex + 2);
    const prePerf = pre.length > 0 ? avg(pre.map((s) => s.performanceScore)) : null;
    const postPerf = post.length > 0 ? avg(post.map((s) => s.performanceScore)) : null;
    let perfImpact: number | null = null;
    if (prePerf !== null && postPerf !== null) {
      const preSlope = pre.length >= 2 ? pre[pre.length - 1].performanceScore - pre[0].performanceScore : 0;
      perfImpact = postPerf - (prePerf + preSlope * 0.5);
    }
    return { ...d, prePerf, postPerf, perfImpact };
  });

  const withImpact = decisionImpacts.filter((d) => d.perfImpact !== null);
  // Gewichtung berücksichtigt neben dem rohen Impact auch, ob die Entscheidung einen
  // später ABGESCHLOSSENEN Thread ausgelöst hat (siehe `Player.narrativeHistory`,
  // Vorgabe "TECHNISCHE VERANKERUNG" Abschnitt 17) - ein kurzfristig negativer
  // Wechsel, der Saisons später zum Durchbruch führte, zählt mehr als ein kurzfristig
  // positiver ohne erkennbare Nachwirkung.
  const definingDecision =
    withImpact.length > 0
      ? withImpact.reduce((best, d) => {
          const dWeight = Math.abs(d.perfImpact!) * (threadOutcomeBoost(player, d.seasonHistoryIndex) ? 1.6 : 1);
          const bestWeight = Math.abs(best.perfImpact!) * (threadOutcomeBoost(player, best.seasonHistoryIndex) ? 1.6 : 1);
          return dWeight > bestWeight ? d : best;
        })
      : null;

  // Explizite Ceiling Breaks (siehe `Player.ceilingBreaks`) - NICHT mehr aus dem
  // rohen Attribut-vs-Potential-Zustand abgeleitet (siehe Doc-Kommentar `CareerNarrativeState`).
  const ceilingBreaks = player.ceilingBreaks;

  const peakOverall = hist.length > 0 ? Math.max(...hist.map((s) => s.overallRating)) : overallRating(player);
  const nationalTeamSnub = peakOverall >= 80 && player.nationalTeamCaps === 0;

  // Trend-Fenster: jüngste (bis zu) 2 Saisons vs. die (bis zu) 3 Saisons davor.
  const recentWindow = hist.slice(-2);
  const priorWindow = hist.slice(Math.max(0, hist.length - 5), Math.max(0, hist.length - 2));
  const recentPerf = recentWindow.length > 0 ? avg(recentWindow.map((s) => s.performanceScore)) : null;
  const priorPerf = priorWindow.length > 0 ? avg(priorWindow.map((s) => s.performanceScore)) : null;
  const recentPlaytime =
    recentWindow.length > 0
      ? avg(recentWindow.filter((s) => s.possibleMinutes > 0).map((s) => (s.minutesPlayed / s.possibleMinutes) * 100))
      : null;
  const priorPlaytime =
    priorWindow.length > 0
      ? avg(priorWindow.filter((s) => s.possibleMinutes > 0).map((s) => (s.minutesPlayed / s.possibleMinutes) * 100))
      : null;
  const recentClub = recentWindow.length > 0 ? avg(recentWindow.map((s) => s.overallRating)) : null;
  const priorClub = priorWindow.length > 0 ? avg(priorWindow.map((s) => s.overallRating)) : null;

  const performanceTrend = trendFrom(recentPerf, priorPerf, 4);
  const playingTimeTrend = trendFrom(recentPlaytime, priorPlaytime, 4);
  // Vereinsniveau-Trend nutzt bewusst dieselbe `overallRating`-Zeitreihe wie oben (kein
  // separates Vereinsstärke-Tracking in `SeasonStats`) - als Näherung dafür, ob sich das
  // eigene sportliche Niveau/Umfeld zuletzt spürbar verändert hat.
  const clubLevelTrend = trendFrom(recentClub, priorClub, 3);

  // Ausgang der ZULETZT abgeschlossenen Entscheidung (mit vorhandenem Nachher-Fenster).
  const recentDecisionOutcome = [...withImpact].reverse().find((d) => hist.length - d.seasonHistoryIndex <= 3) ?? null;

  return {
    decisionImpacts,
    definingDecision,
    ceilingBreaks,
    nationalTeamSnub,
    peakOverall,
    performanceTrend,
    playingTimeTrend,
    clubLevelTrend,
    recentDecisionOutcome,
    activeThread: player.activeNarrativeThread,
  };
}

/** true, wenn die Entscheidung an `seasonHistoryIndex` einen Thread ausgelöst hat, der
 * später mit `BREAKTHROUGH` in `Player.narrativeHistory` abgeschlossen wurde (siehe
 * `advanceNarrativeThread`) - Hilfsfunktion für `computeCareerNarrativeState`s
 * `definingDecision`-Gewichtung. */
function threadOutcomeBoost(player: Player, seasonHistoryIndex: number): boolean {
  return player.narrativeHistory.some(
    (h) => h.type === "BIG_MOVE_BREAKTHROUGH" && Math.abs(h.season - seasonHistoryIndex) <= 4
  );
}

/**
 * Erkennt den (die) prägenden Karriere-Phänotyp(en) einer (idealerweise beendeten,
 * funktioniert aber auch für eine laufende) Karriere - siehe `CareerPhenotype`. Rein
 * beschreibend, greift in KEINE Spiellogik ein. Prioritätsreihenfolge unten grob nach
 * Seltenheit/Aussagekraft gestaffelt: der erste zutreffende Check wird `primary`, alle
 * weiteren zutreffenden (nicht offensichtlich redundanten) Checks landen in
 * `secondary`. Schwellen über dieselbe 1500-Karrieren-Diagnose kalibriert wie
 * `computeCareerNarrativeState`.
 */
export function detectCareerPhenotype(player: Player): CareerPhenotypeResult {
  const hist = player.seasonHistory;
  const narrative = computeCareerNarrativeState(player);
  const matches: CareerPhenotype[] = [];

  const careerAvgPerf = hist.length > 0 ? avg(hist.map((s) => s.performanceScore)) : 50;
  const third = Math.max(1, Math.floor(hist.length / 3));
  const early = hist.slice(0, third);
  const late = hist.slice(Math.max(third, hist.length - third));
  // Bewusst NUR `performanceScore` (Leistung), kein reiner OVR-Vergleich - genau der
  // "falsch-positive Typ D" aus der Diagnose (später OVR-Peak trotz durchgehend
  // schwacher Leistung) darf hier NICHT als Late Bloomer durchrutschen.
  const earlyPerf = early.length > 0 ? avg(early.map((s) => s.performanceScore)) : null;
  const latePerf = late.length > 0 ? avg(late.map((s) => s.performanceScore)) : null;

  // LATE_BLOOMER: ECHTER Leistungs-Turnaround (nicht nur später OVR-Peak, siehe
  // Doc-Kommentar `CareerPhenotype` - der "falsch-positive Typ D" aus der Diagnose
  // bleibt hier bewusst außen vor).
  if (hist.length >= 6 && earlyPerf !== null && latePerf !== null && earlyPerf < 45 && latePerf > 55) {
    matches.push("LATE_BLOOMER");
  }

  // WONDERKIND_DELIVERED/BUST: `developmentTrajectory` > 1.0 ist mathematisch nur bei
  // einem Wunderkind-Bonus (siehe `rollDevelopmentTrajectory`/`createPlayer`) erreichbar
  // - ein zuverlässiger (wenn auch unvollständiger) Proxy, ohne die Trajektorie-Logik
  // selbst anzufassen.
  if (player.developmentTrajectory > 1.0) {
    matches.push(narrative.peakOverall >= 82 && careerAvgPerf >= 55 ? "WONDERKIND_DELIVERED" : "WONDERKIND_BUST");
  }

  if (player.clubChangesCount === 0 && hist.length >= 5) matches.push("ONE_CLUB_LEGEND");
  if (player.clubChangesCount >= 5) matches.push("JOURNEYMAN");

  if (player.nationalTeamCaps >= 40) matches.push("NATIONAL_TEAM_ICON");
  if (narrative.nationalTeamSnub) matches.push("NATIONAL_TEAM_SNUB");

  const bigTitles = player.careerTotals.trophies.filter((t) => t === "Meisterschale" || t === "Champions Cup" || t === "Europa Cup").length;
  if (bigTitles >= 3) matches.push("TROPHY_COLLECTOR");
  if (narrative.peakOverall >= 80 && bigTitles === 0) matches.push("NEARLY_MAN");

  if (player.totalInjuryWeeks >= 60 && narrative.peakOverall >= 70) matches.push("INJURY_PRONE_SURVIVOR");

  // LATE_CAREER_RESURGENCE: ein DOWNWARD_MOVE/LATERAL_MOVE nach dem 30. Geburtstag,
  // dem ein spürbarer Leistungssprung folgte - der "Ich bin noch nicht fertig"-Moment.
  const lateCareerBoost = narrative.decisionImpacts.find(
    (d) => d.age >= 30 && (d.type === "DOWNWARD_MOVE" || d.type === "LATERAL_MOVE") && d.perfImpact !== null && d.perfImpact > 8
  );
  if (lateCareerBoost) matches.push("LATE_CAREER_RESURGENCE");

  // BOOM_OR_BUST_MOVER: mindestens eine Entscheidung mit sehr großem Ausschlag in
  // beide Richtungen - ein Spieler, dessen Karriere sich an einzelnen mutigen (oder
  // riskanten) Wechseln entscheidet, statt gleichmäßig zu verlaufen.
  const hasBoom = narrative.decisionImpacts.some((d) => d.perfImpact !== null && d.perfImpact > 15);
  const hasBust = narrative.decisionImpacts.some((d) => d.perfImpact !== null && d.perfImpact < -15);
  if (hasBoom && hasBust) matches.push("BOOM_OR_BUST_MOVER");

  if (narrative.ceilingBreaks.length > 0) matches.push("CEILING_BREAKER");

  // STEADY_PROFESSIONAL: durchgehend nah am Liga-Durchschnitt, kein Ausreißer nach
  // oben oder unten - der ruhige Gegenpol zu Wonderkind/Late-Bloomer/Boom-or-Bust.
  if (
    hist.length >= 6 &&
    earlyPerf !== null &&
    latePerf !== null &&
    Math.abs(earlyPerf - 50) < 12 &&
    Math.abs(latePerf - 50) < 12 &&
    !hasBoom &&
    !hasBust
  ) {
    matches.push("STEADY_PROFESSIONAL");
  }

  if (matches.length === 0) {
    // Fallback: nie ganz ohne Phänotyp - je nach grobem Karriereniveau.
    matches.push(narrative.peakOverall >= 70 ? "STEADY_PROFESSIONAL" : "NEARLY_MAN");
  }

  const [primary, ...secondary] = matches;
  return { primary, secondary };
}

export function computeAchievements(player: Player): Achievement[] {
  const t = player.careerTotals;
  const avgRatingOverall =
    player.seasonHistory.length > 0
      ? player.seasonHistory.reduce((s, x) => s + x.avgRating, 0) / player.seasonHistory.length
      : 6;
  const wasCaptain = player.log.some((e) => e.text.includes("Kapitänsbinde") || e.text.includes("Mannschaftskapitän"));
  const lowMatchSeasons = player.seasonHistory.filter((s) => s.matches < 10).length;
  const wealthTier = WEALTH_TIERS.find((tier) => player.wealth >= tier.threshold);
  const nationalTeamTier = NATIONAL_TEAM_TIERS.find((tier) => player.nationalTeamCaps >= tier.threshold);

  const defs: { id: string; label: string; description: string; positive: boolean; condition: boolean }[] = [
    { id: "torjaeger", label: "Torjäger", description: "Über 150 Karrieretore erzielt.", positive: true, condition: t.goals >= 150 },
    { id: "vorlagengeber", label: "Vorlagengeber", description: "Über 100 Karrierevorlagen aufgelegt.", positive: true, condition: t.assists >= 100 },
    { id: "titelsammler", label: "Titelsammler", description: "Mindestens 5 Titel gewonnen.", positive: true, condition: t.trophies.length >= 5 },
    { id: "weltklasse", label: "Weltklasse-Niveau", description: "Karriere-Ø-Bewertung von mindestens 7,5.", positive: true, condition: avgRatingOverall >= 7.5 },
    ...(nationalTeamTier ? [{ id: nationalTeamTier.id, label: nationalTeamTier.label, description: nationalTeamTier.description, positive: true, condition: true }] : []),
    // Schwelle bewusst bei 4 statt 1 (siehe Legacy-Faktor "Vereinstreue" oben) -
    // 3-4 Vereine über eine ganze Karriere sind der Normalfall, nicht die
    // Ausnahme, und zählen als "treu" statt nur der reine Ein-Klub-Sonderfall.
    { id: "vereinstreue", label: "Vereinstreue", description: "Höchstens 4 Vereinswechsel in der ganzen Karriere.", positive: true, condition: player.clubChangesCount <= 4 },
    {
      id: "ligalegende",
      label: "Ligalegende",
      description: "Die gesamte Karriere in einem einzigen Land bestritten - nie ins Ausland gewechselt.",
      positive: true,
      condition: !player.playedAbroad && t.matches >= 100,
    },
    ...(wealthTier ? [{ id: wealthTier.id, label: wealthTier.label, description: wealthTier.description, positive: true, condition: true }] : []),
    { id: "gebildet", label: "Kluger Kopf", description: "Hohes Bildungsniveau (80+) neben dem Profialltag gepflegt.", positive: true, condition: player.education >= 80 },
    { id: "familienmensch", label: "Familienmensch", description: "Verheiratet mit mindestens einem Kind.", positive: true, condition: player.relationshipStatus === "verheiratet" && player.children >= 1 },
    { id: "kapitaen", label: "Führungsspieler", description: "Wurde zum Mannschaftskapitän ernannt.", positive: true, condition: wasCaptain },
    { id: "nationalkapitaen", label: "Nationalmannschaftskapitän", description: "Führte die Nationalmannschaft aufs Feld.", positive: true, condition: player.nationalTeamCaptain },
    { id: "individuelle_krone", label: "Individuelle Krönung", description: "Mindestens einmal als Torschützenkönig oder Spieler der Saison ausgezeichnet.", positive: true, condition: t.trophies.some((tr) => tr === "Torschützenkönig" || tr === "Spieler der Saison") },
    { id: "europapokalsieger", label: "Europapokalsieger", description: "Champions Cup oder Europa Cup gewonnen.", positive: true, condition: t.trophies.some((tr) => tr === "Champions Cup" || tr === "Europa Cup") },
    { id: "geschichtenerzaehler", label: "Bewegte Karriere", description: "Mindestens drei mehrjährige Geschichten bis zum Ende durchlebt.", positive: true, condition: player.completedStorylines.length >= 3 },
    { id: "verletzungsanfaellig", label: "Verletzungsanfällig", description: "Über 60 Wochen der Karriere verletzt ausgefallen.", positive: false, condition: player.totalInjuryWeeks >= 60 },
    { id: "vielwechsler", label: "Vielwechsler", description: "Sechs oder mehr Vereinswechsel - nie richtig sesshaft geworden.", positive: false, condition: player.clubChangesCount >= 6 },
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

/**
 * Karriereweg nach dem aktiven Fußball - baut bewusst nicht nur auf den reinen
 * Fußball-Attributen auf, sondern auf den Charakterzügen, die sich über die
 * Karriere durch die getroffenen Lebensentscheidungen geformt haben (Medienimage
 * z.B. aus PR-/Boulevard-Events, Führungsstärke aus Kapitäns-/Konfliktentscheidungen,
 * Disziplin aus Trainingsfleiß vs. Party-Momenten). Deckt bewusst ein "wholesome"
 * Spektrum an Szenarien ab, nicht nur positive: eine verkorkste Medien-/Disziplin-Bilanz
 * führt zu einer eigenen, unschönen Fortsetzung statt in eines der Erfolgs-Narrative
 * gepresst zu werden.
 */
interface PostCareerOutcome {
  path: string;
  /** Vollständiger Abschlusssatz - nimmt den Spielernamen selbst entgegen, damit
   * er unabhängig von `buildEpilogue` wiederverwendbar bleibt. */
  line: (name: string) => string;
}

/** Ein möglicher Karriereweg nach dem aktiven Fußball - mit Eignungs-Check
 * (`eligible`) und einer Stärke (`strength`), die messen soll, wie deutlich
 * dieser Archetyp gerade FÜR DIESEN Spieler zutrifft (höherer Wert = klareres
 * Signal). `tier` gruppiert nach erzählerischer Priorität (siehe `choosePostCareerOutcome`):
 * je niedriger die Zahl, desto eher gewinnt dieser Archetyp gegen einen aus
 * einer höheren Tier-Nummer, unabhängig von dessen Stärke. */
interface PostCareerArchetype extends PostCareerOutcome {
  tier: number;
  eligible: (player: Player) => boolean;
  strength: (player: Player) => number;
}

/** Anteil des dominantesten Vereins an der Gesamt-Saisonanzahl der Karriere -
 * gemeinsam genutzt von der "Vereinsgeschichte"-Einleitung UND vom
 * "Vereinslegende"-Archetyp (siehe unten), damit beide dieselbe Datenbasis
 * verwenden. */
function clubDominance(player: Player): { club: string; share: number } | null {
  const tenures = buildClubTenures(player);
  const totalSeasons = tenures.reduce((sum, t) => sum + t.seasons, 0);
  if (totalSeasons === 0) return null;
  const dominant = tenures.reduce<(typeof tenures)[number] | undefined>(
    (best, t) => (!best || t.seasons > best.seasons ? t : best),
    undefined
  );
  if (!dominant) return null;
  return { club: dominant.club, share: dominant.seasons / totalSeasons };
}

/**
 * Elf mögliche Fortsetzungen nach dem aktiven Fußball - bewusst kein reines
 * "positiv vs. negativ", sondern ein breites, glaubwürdiges Spektrum (siehe
 * die einzelnen Tier-Kommentare für die Priorisierungslogik):
 *
 * Tier 0 (Negativ-Narrativ, übersticht alles andere): Zwielichtige Geschäfte
 * Tier 1 (Sonderfall Alter/Umstände, unabhängig vom Charakterprofil): Comeback-Kandidat
 * Tier 2 (Attribut-KOMBINATIONEN - zwei starke Werte sind aussagekräftiger als einer):
 *        Taktikfuchs, TV-Experte, Vereinslegende, Kritiker mit Kante, Der Unternehmer
 * Tier 3 (Einzelattribut-Archetypen): Jugendvorbild, Jugendtrainer
 * Tier 4 (Default, immer verfügbar): Familienleben ODER Stiller Aussteiger
 */
function postCareerArchetypes(player: Player): PostCareerArchetype[] {
  const { intelligenz, charisma, physis, mentalitaet } = player.attributes;
  const { fuehrung, medienimage, disziplin } = player.traits;
  const { education } = player;
  const dominance = clubDominance(player);

  return [
    // Tier 0 - nie ein positives Medienbild aufgebaut UND wiederholt
    // disziplinlos aufgefallen: bleibt auch als Ex-Profi im Rampenlicht, nur
    // aus den falschen Gründen. Übersticht als einziger negativer Archetyp
    // erzählerisch alles andere.
    {
      path: "Zwielichtige Geschäfte & Boulevard-Schlagzeilen",
      tier: 0,
      eligible: () => medienimage <= 25 && disziplin <= 35,
      strength: () => 100 - medienimage + (100 - disziplin),
      line: (name) =>
        `Mit Medienimage (${medienimage}) und Disziplin (${disziplin}) tief im Keller bleibt ${name} auch nach der Karriere ein gern gesehener Gast in den Boulevardspalten - weniger wegen sportlicher Verdienste - Richtung Zwielichtige Geschäfte & Boulevard-Schlagzeilen.`,
    },
    // Tier 1 - Sonderfall: wer jung und noch in Top-Form aufhört, hinterlässt
    // ein offenes Kapitel statt eines klaren Abschlusses - unabhängig davon,
    // was die übrigen Charakterwerte sonst nahelegen würden.
    {
      path: "Der Comeback-Kandidat",
      tier: 1,
      eligible: () => player.age < 30 && physis >= 65 && mentalitaet >= 65,
      strength: () => physis + mentalitaet,
      line: (name) =>
        `Noch immer in bemerkenswerter Verfassung (Physis ${physis}, Mentalität ${mentalitaet}) schließt ${name} eine Rückkehr auf den Platz nicht komplett aus - das Kapitel bleibt vorerst offen - Richtung Der Comeback-Kandidat.`,
    },
    // Tier 2 - Kopf UND Führungsqualität sprechen für die Trainerbank.
    {
      path: "Taktikfuchs",
      tier: 2,
      eligible: () => intelligenz >= 65 && fuehrung >= 60,
      strength: () => intelligenz + fuehrung,
      line: (name) =>
        `Dank Intelligenz (${intelligenz}) und Führungsstärke (${fuehrung}) liegt für ${name} der Weg auf die Trainerbank nahe - Richtung Taktikfuchs.`,
    },
    // Tier 2 - Charisma UND ein gepflegtes Medienbild (Disziplin schließt den
    // Skandal-Fall bereits aus) sprechen für die glatte Rolle vor der Kamera.
    {
      path: "TV-Experte & Medien",
      tier: 2,
      eligible: () => charisma > 60 && medienimage > 55 && disziplin >= 45,
      strength: () => charisma + medienimage,
      line: (name) =>
        `Dank Charisma (${charisma}) und Medienimage (${medienimage}) liegt für ${name} die Rolle vor der Kamera nahe - Richtung TV-Experte & Medien.`,
    },
    // Tier 2 - sehr hoher Medienbekanntheitsgrad, aber ohne die Politur eines
    // TV-Experten (niedrigere Disziplin) - der unbequeme, schafzüngige Typ statt
    // des glatten Pundits.
    {
      path: "Der Kritiker mit Kante",
      tier: 2,
      eligible: () => medienimage > 55 && disziplin < 45 && !(medienimage <= 25 && disziplin <= 35),
      strength: () => medienimage + (100 - disziplin),
      line: (name) =>
        `Dank Medienimage (${medienimage}) trotz rauer Kante (Disziplin ${disziplin}) positioniert sich ${name} als scharfzüngiger TV-Experte, der auch vor unbequemen Wahrheiten nicht zurückschreckt - Richtung Der Kritiker mit Kante.`,
    },
    // Tier 2 - sehr hoher Vereinsanteil PLUS Führungsstärke, aber ohne das
    // fachliche Profil (Intelligenz/Bildung) für die Trainerbank - die
    // Identifikation bleibt, aber in einer symbolischen statt fachlichen Rolle.
    {
      path: "Vereinslegende",
      tier: 2,
      eligible: () => !!dominance && dominance.share > 0.7 && fuehrung >= 60 && intelligenz < 55 && education < 55,
      strength: () => (dominance ? fuehrung + dominance.share * 100 : 0),
      line: (name) =>
        `Nach all den Jahren bei ${dominance?.club ?? player.club.name} (Führungsstärke ${fuehrung}) bleibt ${name} dem Verein als Botschafter und Vereinslegende eng verbunden - Richtung Vereinslegende.`,
    },
    // Tier 2 - hohe Intelligenz OHNE ausgeprägten Teamgedanken: der strategische
    // Einzelgänger statt des Trainerbank-Typs.
    {
      path: "Der Unternehmer",
      tier: 2,
      eligible: () => intelligenz >= 65 && fuehrung < 45,
      strength: () => intelligenz + (100 - fuehrung),
      line: (name) =>
        `Dank Intelligenz (${intelligenz}) abseits des klassischen Teamgedankens steigt ${name} nach dem Karriereende ins eigene Business ein - vom Rasen in die Vorstandsetage - Richtung Der Unternehmer.`,
    },
    // Tier 3 - hohe Führungsstärke auch ohne ausgeprägten Fußball-IQ - der
    // natürliche Kapitänstyp, aus dem später mit hoher Wahrscheinlichkeit selbst
    // ein Trainer wird.
    {
      path: "Jugendvorbild mit Trainerambitionen",
      tier: 3,
      eligible: () => fuehrung >= 70,
      strength: () => fuehrung,
      line: (name) =>
        `Dank Führungsstärke (${fuehrung}) liegt für ${name} eine Zukunft als Mentor der jungen Generation nahe - Richtung Jugendvorbild mit Trainerambitionen.`,
    },
    // Tier 3 - Bildung als Einzelsignal: strukturierte Ausbildung/Lizenzen statt
    // natürlicher Autorität wie beim Jugendvorbild.
    {
      path: "Jugendtrainer & Ausbildung",
      tier: 3,
      eligible: () => education > 65,
      strength: () => education,
      line: (name) =>
        `Dank Bildung (${education}) liegt für ${name} die strukturierte Nachwuchsarbeit nahe - Richtung Jugendtrainer & Ausbildung.`,
    },
  ];
}

/** Durchschnitt über alle 6 Fußball-Attribute + 4 Charakterzüge - entscheidet
 * zwischen den beiden Default-Pfaden (Tier 4), wenn kein Archetyp aus den
 * höheren Tiers zutrifft: eine insgesamt solide, nur eben unauffällige Bilanz
 * liest sich als bewusste Wahl (Familienleben), eine insgesamt schwache
 * Bilanz eher als unauffälliges Verschwinden (Stiller Aussteiger). */
function averageProfileLevel(player: Player): number {
  const values = [...ATTRIBUTE_ORDER.map((k) => player.attributes[k]), ...TRAIT_ORDER.map((k) => player.traits[k])];
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function choosePostCareerOutcome(player: Player): PostCareerOutcome {
  const eligible = postCareerArchetypes(player).filter((a) => a.eligible(player));
  if (eligible.length > 0) {
    eligible.sort((a, b) => a.tier - b.tier || b.strength(player) - a.strength(player));
    return eligible[0];
  }

  // Tier 4 - kein Archetyp trifft klar genug zu: zwei neutrale Defaults statt
  // eines einzigen "Familienleben" für praktisch jeden unauffälligen Spieler.
  if (averageProfileLevel(player) >= 50) {
    return {
      path: "Familienleben abseits der Medien",
      line: (name) =>
        `Ohne einen klaren Ausreißer nach oben zieht sich ${name} bewusst aus dem Rampenlicht zurück und konzentriert sich auf das Leben neben dem Platz - Richtung Familienleben abseits der Medien.`,
    };
  }
  return {
    path: "Der stille Aussteiger",
    line: (name) =>
      `Ohne einen klaren Höhepunkt in der Bilanz verschwindet ${name} nach dem Karriereende weitgehend aus der Öffentlichkeit, ohne dass eine neue Rolle erkennbar wird - Richtung Der stille Aussteiger.`,
  };
}

export function pickPostCareerPath(player: Player): string {
  return choosePostCareerOutcome(player).path;
}

function topAttributeHighlight(player: Player): { label: string; value: number } {
  let bestKey = ATTRIBUTE_ORDER[0];
  let bestVal = -Infinity;
  for (const key of ATTRIBUTE_ORDER) {
    if (player.attributes[key] > bestVal) {
      bestVal = player.attributes[key];
      bestKey = key;
    }
  }
  return { label: ATTRIBUTE_LABEL[bestKey], value: bestVal };
}

function topTraitHighlight(player: Player): { label: string; value: number } {
  let bestKey = TRAIT_ORDER[0];
  let bestVal = -Infinity;
  for (const key of TRAIT_ORDER) {
    if (player.traits[key] > bestVal) {
      bestVal = player.traits[key];
      bestKey = key;
    }
  }
  return { label: TRAIT_LABEL[bestKey], value: bestVal };
}

/** Fasst den Beziehungsstatus + Kinder zu einem Satz zusammen - die "Lebensentscheidungen"
 * abseits des Platzes, die während der Karriere getroffen wurden. */
function familyLine(player: Player): string {
  const hasKidsClause = player.children === 0 ? "" : player.children === 1 ? " und hat ein Kind" : ` und hat ${player.children} Kinder`;
  switch (player.relationshipStatus) {
    case "verheiratet":
      return `Privat ist ${player.name} verheiratet${hasKidsClause}.`;
    case "verlobt":
      return `Privat ist ${player.name} verlobt${hasKidsClause}.`;
    case "in_beziehung":
      return `Privat führt ${player.name} eine feste Beziehung${hasKidsClause}.`;
    default:
      return player.children > 0
        ? `Privat ist ${player.name} alleinerziehend mit ${player.children === 1 ? "einem Kind" : `${player.children} Kindern`}.`
        : `Privat blieb ${player.name} während der aktiven Karriere ungebunden.`;
  }
}

/** "Vereinsgeschichte" ist nur angebracht, wenn ein Klub tatsächlich die Mehrheit
 * der Karriere getragen hat - bei einer Karriere quer durch mehrere Vereine ohne
 * klaren Schwerpunkt wäre die Zuschreibung an einen einzelnen Verein irreführend,
 * dann geht die Karriere allgemeiner in die "Fußballgeschichte" ein. */
function clubLegacyPhrase(player: Player, tier: string): string {
  const dominance = clubDominance(player);
  if (dominance && dominance.share > 0.5) {
    return `Die Karriere geht als "${tier}" in die Vereinsgeschichte von ${dominance.club} ein.`;
  }
  return `Die Karriere geht als "${tier}" in die Fußballgeschichte ein.`;
}

export function buildEpilogue(player: Player, tier: string): string {
  const years = player.age - player.birthAge;
  const trophyText =
    player.careerTotals.trophies.length > 0
      ? `${player.careerTotals.trophies.length} Titel in der Vitrine`
      : "keinem Titel, aber vielen unvergesslichen Momenten";
  const intro = `Nach ${years} Jahren im Profifußball beendet ${player.name} die aktive Karriere mit ${player.careerTotals.goals} Toren, ${player.careerTotals.assists} Vorlagen und ${trophyText}. ${clubLegacyPhrase(player, tier)}`;

  const topAttr = topAttributeHighlight(player);
  const topTrait = topTraitHighlight(player);
  const attrLine = `Auf dem Platz war ${player.name} vor allem für ${topAttr.label} (${topAttr.value}) bekannt, abseits des Rasens für ${topTrait.label} (${topTrait.value}).`;

  const outcome = choosePostCareerOutcome(player);

  // Ein karriereprägender Moment (siehe "historisches_spiel_1") rahmt die Karriere
  // rückblickend - namentlich für immer mit diesem einen Ereignis verknüpft, egal
  // wie die restliche Karriere sonst verlief.
  const definingMomentLine = player.definingMoment
    ? ` Bis heute wird ${player.name} vor allem mit einem einzigen Moment in Verbindung gebracht: ${player.definingMoment.text}`
    : "";

  return [intro, attrLine, familyLine(player), outcome.line(player.name) + definingMomentLine].join(" ");
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

