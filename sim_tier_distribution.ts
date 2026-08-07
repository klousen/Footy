// Wiederverwendbares Simulations-Harness für die Saison-Score-Tier-Verteilung nach
// Position (siehe Bugreport "Balance-Problem in der Saison-Score-Berechnung"). Simuliert
// N zufällige Karrieren (Position/Land/Entscheidungen jeweils zufällig, realistische
// Rücktrittslogik) und zählt, wie oft welches Tier (Überragend/Stark/Solide/
// Durchwachsen/Schwierig) pro Position vergeben wird - bewusst als echtes .ts-Skript im
// Repo belassen (nicht wie sonst Scratch-Datei), damit es nach künftigen
// Balance-Änderungen an `computeSeasonScore`/`simulateSeason` einfach erneut mit
// `npx tsx sim_tier_distribution.ts` laufen gelassen werden kann.
import {
  createPlayer,
  finalizeYouthClub,
  pickSeasonTemplateIds,
  dueStorylineTemplateIds,
  decideClubOfferInjection,
  clubOfferTemplateId,
  insertAt,
  buildEventFromId,
  isClubOfferEvent,
  applyClubOfferChoice,
  applyChoice,
  simulateSeason,
  ageUpPlayer,
  resolveClubSituation,
  applyLeaguePromotionRelegation,
  computeAchievements,
  shouldOfferRetirement,
} from "./src/engine/careerEngine";
import type { Position, AttributeKey, GameState } from "./src/engine/types";

const POSITIONS: Position[] = ["TW", "IV", "AV", "ZM", "FS", "ST"];
const FOCUS: AttributeKey[] = ["technik", "tempo", "physis", "mentalitaet", "intelligenz", "charisma"];
const COUNTRIES = ["germany", "england", "spain", "italy", "france", "portugal", "belgium", "netherlands", "turkey", "poland"];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const tierCounts: Record<string, number> = {};
const tierByPosition: Record<Position, Record<string, number>> = {} as any;
const scoresByPosition: Record<Position, number[]> = {} as any;
for (const pos of POSITIONS) {
  tierByPosition[pos] = {};
  scoresByPosition[pos] = [];
}
let totalSeasons = 0;
let totalCareers = 0;
const NUM_CAREERS = 400;

for (let c = 0; c < NUM_CAREERS; c++) {
  const position = pickRandom(POSITIONS);
  const focus = pickRandom(FOCUS);
  const country = pickRandom(COUNTRIES);
  const { player, league, offers } = createPlayer(`Sim ${c}`, position, focus, country as any);
  finalizeYouthClub(player, league, pickRandom(offers).id);

  let usedTemplateIds = new Set<string>();
  let recentTemplateSeasons: Record<string, number> = {};
  const foreignLeagues: Record<string, any> = {};
  let seasonNumber = 0;
  totalCareers++;

  for (let s = 0; s < 25; s++) {
    if (player.age >= 39) break;
    if (player.age >= 32 && shouldOfferRetirement(player) && Math.random() < 0.5) break;

    player.attributesAtSeasonStart = { ...player.attributes };
    player.traitsAtSeasonStart = { ...player.traits };
    seasonNumber++;

    let ids = pickSeasonTemplateIds(player, usedTemplateIds, recentTemplateSeasons, seasonNumber);
    for (const storyId of dueStorylineTemplateIds(player, seasonNumber)) {
      ids = insertAt(ids, storyId, Math.min(1, ids.length));
    }
    const offerReason = decideClubOfferInjection(player);
    if (offerReason) {
      const insertIndex = offerReason === "pressure" ? Math.ceil(ids.length / 2) : 0;
      ids = insertAt(ids, clubOfferTemplateId(offerReason), insertIndex);
    }
    usedTemplateIds = new Set([...usedTemplateIds, ...ids]);

    for (const id of ids) {
      const event = buildEventFromId(id, player, league, foreignLeagues);
      if (event.choices.length === 0) continue;
      const choice = pickRandom(event.choices);
      if (isClubOfferEvent(event.templateId)) {
        applyClubOfferChoice(player, league, event, choice.id, foreignLeagues);
      } else {
        const fakeState = { player, seasonNumber } as unknown as GameState;
        applyChoice(fakeState, choice);
      }
    }

    const stats = simulateSeason(player, seasonNumber, league, foreignLeagues, {});
    ageUpPlayer(player);
    resolveClubSituation(player, league);
    applyLeaguePromotionRelegation(player, league);
    const all = computeAchievements(player);
    player.unlockedAchievementIds = [...player.unlockedAchievementIds, ...all.filter((a) => !player.unlockedAchievementIds.includes(a.id)).map((a) => a.id)];

    tierCounts[stats.scoreTier] = (tierCounts[stats.scoreTier] ?? 0) + 1;
    tierByPosition[position][stats.scoreTier] = (tierByPosition[position][stats.scoreTier] ?? 0) + 1;
    scoresByPosition[position].push(stats.score);
    totalSeasons++;
  }
}

const TIER_ORDER = ["Überragende Saison", "Starke Saison", "Solide Saison", "Durchwachsene Saison", "Schwierige Saison"];

console.log(`\n=== ${totalCareers} Karrieren, ${totalSeasons} simulierte Saisons ===\n`);
console.log("Gesamtverteilung:");
for (const tier of TIER_ORDER) {
  const n = tierCounts[tier] ?? 0;
  const pct = ((n / totalSeasons) * 100).toFixed(1);
  console.log(`  ${tier.padEnd(22)} ${String(n).padStart(5)}  ${pct.padStart(5)}%`);
}

const allScores: number[] = [];
for (const pos of POSITIONS) allScores.push(...scoresByPosition[pos]);
allScores.sort((a, b) => a - b);
function pct(p: number) {
  return allScores[Math.floor(allScores.length * p)];
}
console.log("\nScore-Perzentile (über alle Positionen):");
console.log(`  P10=${pct(0.1)} P25=${pct(0.25)} P50=${pct(0.5)} P60=${pct(0.6)} P75=${pct(0.75)} P85=${pct(0.85)} P90=${pct(0.9)} P95=${pct(0.95)} P99=${pct(0.99)}`);

console.log("\nNach Position:");
for (const pos of POSITIONS) {
  const total = Object.values(tierByPosition[pos]).reduce((a, b) => a + b, 0);
  const scores = scoresByPosition[pos].sort((a, b) => a - b);
  const median = scores.length ? scores[Math.floor(scores.length / 2)] : NaN;
  console.log(`\n  ${pos} (n=${total}, Median-Score=${median}):`);
  for (const tier of TIER_ORDER) {
    const n = tierByPosition[pos][tier] ?? 0;
    const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
    console.log(`    ${tier.padEnd(22)} ${String(n).padStart(5)}  ${pct.padStart(5)}%`);
  }
}
