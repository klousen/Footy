// Backtest für den neu gewichteten Legacy-Score (siehe Handoff "Karriereende-Logik
// neu gewichten" Abschnitt 2/3, Rückfrage 1 an den Nutzer: "~1000 Karrieren reichen").
// Simuliert N vollständige Karrieren bis zum (zufällig gewählten) Karriereende und
// prüft, wie sich `computeLegacy` über die sechs Legacy-Stufen verteilt - Zielbild
// aus dem Handoff: grob Unbekannt ~15% · Solider Profi ~30% · Etabliert ~30% ·
// Aushängeschild ~17% · Legende ~6% · Unsterblich ~2%. Bewusst als echtes .ts-Skript
// im Repo belassen (wie `sim_tier_distribution.ts`), erneut lauffähig mit
// `npx tsx sim_legacy_backtest.ts` nach künftigen Legacy-Formel-Änderungen.
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
  computeLegacy,
  shouldOfferRetirement,
} from "./src/engine/careerEngine";
import type { Position, AttributeKey, GameState } from "./src/engine/types";

const POSITIONS: Position[] = ["TW", "IV", "AV", "ZM", "FS", "ST"];
const FOCUS: AttributeKey[] = ["technik", "tempo", "physis", "mentalitaet", "intelligenz", "charisma"];
const COUNTRIES = ["germany", "england", "spain", "italy", "france", "portugal", "belgium", "netherlands", "turkey", "poland"];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const NUM_CAREERS = 1000;

const LEGACY_STUFEN = [
  { threshold: 0, label: "Unbekannter Profi" },
  { threshold: 300, label: "Solider Profi" },
  { threshold: 550, label: "Etablierter Profi" },
  { threshold: 850, label: "Aushängeschild" },
  { threshold: 1150, label: "Legende" },
  { threshold: 1450, label: "Unsterblich" },
];
const stufeCounts: Record<string, number> = {};
const stufeByPosition: Record<Position, Record<string, number>> = {} as any;
const scoresByPosition: Record<Position, number[]> = {} as any;
const groupTotalsByPosition: Record<Position, { A: number[]; B: number[]; C: number[] }> = {} as any;
for (const pos of POSITIONS) {
  stufeByPosition[pos] = {};
  scoresByPosition[pos] = [];
  groupTotalsByPosition[pos] = { A: [], B: [], C: [] };
}
const allScores: number[] = [];
const factorSums: Record<string, number> = {};
const factorCounts: Record<string, number> = {};

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

    simulateSeason(player, seasonNumber, league, foreignLeagues, {});
    ageUpPlayer(player);
    resolveClubSituation(player, league);
    applyLeaguePromotionRelegation(player, league);
    const all = computeAchievements(player);
    player.unlockedAchievementIds = [...player.unlockedAchievementIds, ...all.filter((a) => !player.unlockedAchievementIds.includes(a.id)).map((a) => a.id)];
  }

  const legacy = computeLegacy(player);
  stufeCounts[legacy.tier] = (stufeCounts[legacy.tier] ?? 0) + 1;
  stufeByPosition[position][legacy.tier] = (stufeByPosition[position][legacy.tier] ?? 0) + 1;
  scoresByPosition[position].push(legacy.score);
  allScores.push(legacy.score);
  const [groupA, groupB, groupC] = legacy.groups;
  groupTotalsByPosition[position].A.push(groupA.total);
  groupTotalsByPosition[position].B.push(groupB.total);
  groupTotalsByPosition[position].C.push(groupC.total);
  for (const f of legacy.factors) {
    factorSums[f.label] = (factorSums[f.label] ?? 0) + f.points;
    factorCounts[f.label] = (factorCounts[f.label] ?? 0) + 1;
  }
}

console.log("\nØ Punkte je Faktor (über alle Karrieren):");
for (const label of Object.keys(factorSums).sort((a, b) => factorSums[b] / factorCounts[b] - factorSums[a] / factorCounts[a])) {
  console.log(`  ${label.padEnd(45)} Ø ${(factorSums[label] / factorCounts[label]).toFixed(1)}`);
}

const STUFE_ORDER = LEGACY_STUFEN.map((s) => s.label);

console.log(`\n=== ${NUM_CAREERS} vollständige Karrieren simuliert ===\n`);
console.log("Legacy-Stufen-Verteilung (Ziel: ~15/30/30/17/6/2%):");
for (const stufe of STUFE_ORDER) {
  const n = stufeCounts[stufe] ?? 0;
  const pct = ((n / NUM_CAREERS) * 100).toFixed(1);
  console.log(`  ${stufe.padEnd(20)} ${String(n).padStart(5)}  ${pct.padStart(5)}%`);
}

allScores.sort((a, b) => a - b);
function pct(p: number) {
  return allScores[Math.floor(allScores.length * p)];
}
console.log("\nScore-Perzentile (über alle Positionen):");
console.log(`  P10=${pct(0.1)} P25=${pct(0.25)} P50=${pct(0.5)} P60=${pct(0.6)} P75=${pct(0.75)} P85=${pct(0.85)} P90=${pct(0.9)} P95=${pct(0.95)} P99=${pct(0.99)} Max=${allScores[allScores.length - 1]}`);

console.log("\nNach Position:");
for (const pos of POSITIONS) {
  const total = Object.values(stufeByPosition[pos]).reduce((a, b) => a + b, 0);
  const scores = scoresByPosition[pos].sort((a, b) => a - b);
  const median = scores.length ? scores[Math.floor(scores.length / 2)] : NaN;
  const avgA = groupTotalsByPosition[pos].A.reduce((a, b) => a + b, 0) / (groupTotalsByPosition[pos].A.length || 1);
  const avgB = groupTotalsByPosition[pos].B.reduce((a, b) => a + b, 0) / (groupTotalsByPosition[pos].B.length || 1);
  const avgC = groupTotalsByPosition[pos].C.reduce((a, b) => a + b, 0) / (groupTotalsByPosition[pos].C.length || 1);
  console.log(`\n  ${pos} (n=${total}, Median-Score=${median}, Ø Gruppe A/B/C=${avgA.toFixed(0)}/${avgB.toFixed(0)}/${avgC.toFixed(0)}):`);
  for (const stufe of STUFE_ORDER) {
    const n = stufeByPosition[pos][stufe] ?? 0;
    const p = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
    console.log(`    ${stufe.padEnd(20)} ${String(n).padStart(5)}  ${p.padStart(5)}%`);
  }
}

