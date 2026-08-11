// PERSÖNLICHES INVESTMENT-SYSTEM ("Aktivierung statt Kauf")
//
// Bewusst KEIN Economy-/Shop-System: Geld kauft niemals direkt OVR,
// PerformanceScore oder Attribute. Ein Investment wird gegen Geld AKTIVIERT,
// wirkt für eine begrenzte Anzahl Saisons NUR auf bestehende Wahrscheinlichkeiten/
// Systeme (siehe die einzelnen Hook-Kommentare in careerEngine.ts:
// `ageUpPlayer` für Entwicklungschance, `applyEffects` für Verletzungsrisiko,
// `simulateSeason`/`applyClubOfferChoice` für Einsatzzeit/Vertragsoptionen),
// läuft danach aus und geht in einen Cooldown. Maximal EIN persönliches
// Investment gleichzeitig aktiv (siehe `Player.activeInvestment`) - der Spieler
// muss priorisieren, statt sich beliebig viele Vorteile gleichzeitig zu
// aktivieren.
//
// Narrative Integration bewusst OHNE eigene Phänotypen/Narrative-Threads: die
// Effekte fließen ausschließlich in bereits vom Narrative-System gelesene
// Größen (Attributwachstum -> `performanceScore`-Trends, siehe LATE_BLOOMER;
// Verletzungswochen -> `totalInjuryWeeks`, siehe INJURY_PRONE_SURVIVOR;
// Einsatzzeit/Vertragsoptionen -> Kaderrolle/Gehalt) - die bestehenden
// Phänotyp-Checks (`detectCareerPhenotype`) erkennen einen dadurch begünstigten
// Verlauf also automatisch, ohne dass hier ein neuer Check nötig wäre. Das
// entspricht der Vorgabe "Investments sollen bestehende Narrative unterstützen,
// nicht die Narrative-Engine aufblasen".
import { clamp } from "./data";
import type { Player, PersonalInvestmentId, LogEntry } from "./types";
import { ATTRIBUTE_LABEL } from "./labels";

export interface InvestmentDefinition {
  id: PersonalInvestmentId;
  label: string;
  /** Kurzer, nutzerfacing Effekt-Text OHNE Zahlen (siehe Vorgabe "keine
   * komplizierten Zahlenboni") - für die Angebots-Karte im Dashboard-Panel. */
  effectSummary: string;
  /** Etwas ausführlicherer Flavor-Satz für den Log-Eintrag bei Aktivierung. */
  narrativeFlavor: (player: Player) => string;
  durationSeasons: number;
  cooldownSeasons: number;
  /** Kostenformel (siehe Vorgabe): `clamp(Jahresgehalt × investmentFactor,
   * minimumCost, maximumCost)` - je Investment eigene Faktoren/Grenzen, aus
   * der bestehenden Gehaltsspanne abgeleitet (siehe `estimateWage` in
   * careerEngine.ts: realistisch ~15.000 € bis deutlich über 1 Mio. €/Jahr). */
  costFactor: number;
  minCost: number;
  maxCost: number;
  /** Freischaltung - Alter/Vertragsstatus, KEINE OVR-Schranke (siehe Vorgabe
   * "Karriereentwicklung nicht künstlich an OVR koppeln"). */
  isUnlocked: (player: Player) => boolean;
}

const investmentDefinitions: InvestmentDefinition[] = [
  {
    id: "privattrainer",
    label: "Privattrainer",
    effectSummary: "Kleine zusätzliche Chance auf spürbare Entwicklungsfortschritte.",
    narrativeFlavor: (p) => `${p.name} engagiert einen Privattrainer für die individuelle Weiterentwicklung.`,
    durationSeasons: 3,
    cooldownSeasons: 2,
    costFactor: 0.08,
    minCost: 4_000,
    maxCost: 120_000,
    isUnlocked: (p) => p.age >= 18 && p.contract.squadRole !== "Ausbildungsspieler",
  },
  {
    id: "spezialtraining",
    label: "Spezialtraining",
    effectSummary: `Erhöht die Chance auf kleine Fortschritte beim gewählten Fokusattribut.`,
    narrativeFlavor: (p) => `${p.name} bucht ein maßgeschneidertes Spezialtraining mit Schwerpunkt ${ATTRIBUTE_LABEL[p.focusAttribute]}.`,
    durationSeasons: 2,
    cooldownSeasons: 2,
    costFactor: 0.1,
    minCost: 5_000,
    maxCost: 140_000,
    isUnlocked: (p) => p.age >= 19,
  },
  {
    id: "profi_recovery",
    label: "Profi-Recovery",
    effectSummary: "Senkt das Risiko und die Schwere neuer Verletzungen.",
    narrativeFlavor: (p) => `${p.name} stellt die Regeneration auf ein professionelles Recovery-Programm um.`,
    durationSeasons: 2,
    cooldownSeasons: 2,
    costFactor: 0.14,
    minCost: 8_000,
    maxCost: 180_000,
    isUnlocked: (p) => p.age >= 19,
  },
  {
    id: "ernaehrungsberatung",
    label: "Ernährungsberatung",
    effectSummary: "Wirkt sich leicht positiv auf Physis und Alterungsverlauf aus.",
    narrativeFlavor: (p) => `${p.name} lässt sich fortan professionell ernährungsberaten.`,
    durationSeasons: 3,
    cooldownSeasons: 3,
    costFactor: 0.05,
    minCost: 3_000,
    maxCost: 90_000,
    isUnlocked: (p) => p.age >= 20,
  },
  {
    id: "berater_coach",
    label: "Berater/Coach",
    effectSummary: "Bessere Vertrags-/Transferoptionen und eine leicht bessere Chance auf Einsatzzeit.",
    narrativeFlavor: (p) => `${p.name} holt sich mit einem erfahrenen Berater/Coach professionelle Unterstützung abseits des Platzes.`,
    durationSeasons: 3,
    cooldownSeasons: 3,
    costFactor: 0.12,
    minCost: 10_000,
    maxCost: 200_000,
    isUnlocked: (p) => p.age >= 21,
  },
  {
    id: "reha_experte",
    label: "Reha-Experte",
    effectSummary: "Verkürzt die verbleibende Ausfallzeit einer laufenden Verletzung moderat.",
    narrativeFlavor: (p) => `${p.name} holt sich für die laufende Verletzung einen spezialisierten Reha-Experten dazu.`,
    // Kein mehrjähriger Passiv-Effekt wie bei den übrigen Investments - die
    // Wirkung (Verkürzung der Ausfallzeit) tritt SOFORT bei Aktivierung ein
    // (siehe `activateInvestment` unten). Belegt trotzdem für eine Saison den
    // "max. 1 aktiv"-Slot, damit es sich weiterhin wie eine echte Entscheidung
    // anfühlt statt wie ein beliebig oft nutzbarer Sofort-Kauf.
    durationSeasons: 1,
    cooldownSeasons: 2,
    costFactor: 0.2,
    minCost: 15_000,
    maxCost: 250_000,
    // Einzige Ausnahme von "keine harte Schranke": diese Freischaltung ist
    // AN eine laufende Verletzung gekoppelt (siehe Vorgabe "nur während einer
    // passenden Verletzung") - das ist der ganze Sinn des Investments, keine
    // künstliche OVR-/Alters-Hürde.
    isUnlocked: (p) => !!p.injury && p.injury.weeksOut > 0,
  },
];

export const INVESTMENT_DEFINITIONS: Record<PersonalInvestmentId, InvestmentDefinition> = Object.fromEntries(
  investmentDefinitions.map((d) => [d.id, d])
) as Record<PersonalInvestmentId, InvestmentDefinition>;

/** Kostenformel: `clamp(Jahresgehalt × investmentFactor, minimumCost,
 * maximumCost)` - siehe Vorgabe. Bleibt für junge Profis mit noch kleinem
 * Gehalt relevant (Mindestkosten), ohne bei Top-Gehältern unbegrenzt zu
 * skalieren (Höchstkosten). */
export function investmentCost(id: PersonalInvestmentId, player: Player): number {
  const def = INVESTMENT_DEFINITIONS[id];
  const raw = player.contract.wagePerYear * def.costFactor;
  return Math.round(clamp(raw, def.minCost, def.maxCost) / 100) * 100;
}

/** Aktuell aktivierbare Investments - freigeschaltet, kein Cooldown, UND kein
 * anderes Investment bereits aktiv (max. 1 gleichzeitig, siehe Datei-Kommentar).
 * Bewusst UNABHÄNGIG von der Bezahlbarkeit (siehe Angebots-Karten an anderer
 * Stelle im Spiel, z.B. Vereinsangebote: unbezahlbare/unpassende Optionen
 * werden weiterhin gezeigt, nur entsprechend markiert, nicht versteckt). */
export function availableInvestmentIds(player: Player): PersonalInvestmentId[] {
  if (player.activeInvestment) return [];
  return investmentDefinitions
    .filter((d) => d.isUnlocked(player) && (player.investmentCooldowns[d.id] ?? 0) <= 0)
    .map((d) => d.id);
}

export function hasActiveInvestment(player: Player, id: PersonalInvestmentId): boolean {
  return player.activeInvestment?.id === id;
}

/** Aktiviert ein Investment - zieht die Kosten ab, setzt `activeInvestment`,
 * gibt einen Log-Eintrag zurück (`null`, falls die Voraussetzungen nicht mehr
 * gelten - Sicherheitsnetz für den Event-Auslöse-Pfad, siehe
 * `EffectDelta.activateInvestmentId`, dasselbe Prinzip wie `quietWeekFallback`
 * bei Events: zwischen Anzeige und tatsächlicher Anwendung kann sich der
 * Spielerzustand geändert haben). */
export function activateInvestment(player: Player, id: PersonalInvestmentId, season: number): LogEntry | null {
  const def = INVESTMENT_DEFINITIONS[id];
  if (!def.isUnlocked(player)) return null;
  if (player.activeInvestment) return null;
  if ((player.investmentCooldowns[id] ?? 0) > 0) return null;
  const cost = investmentCost(id, player);
  if (player.wealth < cost) return null;

  player.wealth -= cost;
  player.activeInvestment = { id, seasonsRemaining: def.durationSeasons };

  // Reha-Experte: sofortige, moderate Verkürzung der LAUFENDEN Ausfallzeit
  // statt eines mehrjährigen Passiv-Effekts (siehe Definitions-Kommentar oben).
  if (id === "reha_experte" && player.injury) {
    const reduction = Math.max(1, Math.round(player.injury.weeksOut * 0.3));
    player.injury = { ...player.injury, weeksOut: Math.max(0, player.injury.weeksOut - reduction) };
    if (player.injury.weeksOut === 0) player.injury = null;
  }

  return {
    season,
    age: player.age,
    text: def.narrativeFlavor(player),
    kind: "positive",
  };
}

/** Einmal pro Saison (siehe `ageUpPlayer` in careerEngine.ts) aufgerufen:
 * zählt die Restlaufzeit des aktiven Investments und alle Cooldowns herunter. */
export function tickInvestments(player: Player): void {
  if (player.activeInvestment) {
    const remaining = player.activeInvestment.seasonsRemaining - 1;
    if (remaining <= 0) {
      const def = INVESTMENT_DEFINITIONS[player.activeInvestment.id];
      player.investmentCooldowns[player.activeInvestment.id] = def.cooldownSeasons;
      player.activeInvestment = null;
    } else {
      player.activeInvestment = { ...player.activeInvestment, seasonsRemaining: remaining };
    }
  }
  for (const key of Object.keys(player.investmentCooldowns) as PersonalInvestmentId[]) {
    const remaining = (player.investmentCooldowns[key] ?? 0) - 1;
    if (remaining <= 0) delete player.investmentCooldowns[key];
    else player.investmentCooldowns[key] = remaining;
  }
}
