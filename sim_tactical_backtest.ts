// Backtest für die taktischen Taktiktafel-Events (siehe "Handoff: Taktische
// Entscheidungs-Events" §9 "Backtest-Hinweis" + Nutzer-Diskussion zu
// matchGoalDelta/matchAssistDelta). Zwei Fragen:
//
//   1. Erzeugt die `successChance`-Formel (resolveTacticalOutcome) bei
//      Amateur- vs. Weltklasse-Spielern plausible, spürbare Streuung?
//   2. Blähen `matchGoalDelta`/`matchAssistDelta` die Karriere-Tor-/
//      Vorlagenstatistik unrealistisch auf (Doppelzählungs-/Cap-Sorge aus
//      der Diskussion)?
//
// Simuliert N vollständige Karrieren, exakt wie sim_legacy_backtest.ts, außer
// dass taktische Choices hier (anders als in den bestehenden Sim-Skripten!)
// tatsächlich über `resolveTacticalOutcome` aufgelöst werden, bevor
// `applyChoice` läuft - genau wie App.tsx `handleChoice` es tut. Lauffähig
// mit `npx tsx sim_tactical_backtest.ts`.
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
  shouldOfferRetirement,
  overallRating,
} from "./src/engine/careerEngine";
import { resolveTacticalOutcome } from "./src/engine/tacticalEvents";
import type { Position, AttributeKey, GameState } from "./src/engine/types";

const POSITIONS: Position[] = ["TW", "IV", "AV", "ZM", "FS", "ST"];
const FOCUS: AttributeKey[] = ["technik", "tempo", "physis", "mentalitaet", "intelligenz", "charisma"];
const COUNTRIES = ["germany", "england", "spain", "italy", "france", "portugal", "belgium", "netherlands", "turkey", "poland"];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const NUM_CAREERS = 1000;

// --- successChance-Streuung nach Gesamtstärke-Tier bei Ziehung (Frage 1) ---
const OVR_BUCKETS = [
  { label: "Amateur (<50)", max: 50 },
  { label: "Solide (50-64)", max: 65 },
  { label: "Stark (65-79)", max: 80 },
  { label: "Weltklasse (80+)", max: Infinity },
];
function bucketFor(ovr: number): string {
  return OVR_BUCKETS.find((b) => ovr < b.max)!.label;
}
const successByBucket: Record<string, { wins: number; total: number }> = {};
for (const b of OVR_BUCKETS) successByBucket[b.label] = { wins: 0, total: 0 };
const successByRisk: Record<string, { wins: number; total: number }> = { low: { wins: 0, total: 0 }, mid: { wins: 0, total: 0 }, high: { wins: 0, total: 0 } };

// --- Tor-/Vorlagen-Inflation durch matchGoalDelta/matchAssistDelta (Frage 2) ---
let careersWithTacticalGoals = 0;
let totalTacticalGoals = 0;
let totalTacticalAssists = 0;
let totalTacticalDraws = 0;
let totalSeasons = 0;
let totalEventsDrawn = 0;
const drawsByTemplateId: Record<string, number> = {};
const careerGoalsByPosition: Record<Position, number[]> = {} as any;
const careerTacticalGoalShareByPosition: Record<Position, number[]> = {} as any;
for (const pos of POSITIONS) {
  careerGoalsByPosition[pos] = [];
  careerTacticalGoalShareByPosition[pos] = [];
}

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
  let careerTacticalGoals = 0;
  let careerTacticalAssists = 0;

  for (let s = 0; s < 25; s++) {
    if (player.age >= 39) break;
    if (player.age >= 32 && shouldOfferRetirement(player) && Math.random() < 0.5) break;

    player.attributesAtSeasonStart = { ...player.attributes };
    player.traitsAtSeasonStart = { ...player.traits };
    seasonNumber++;
    totalSeasons++;

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
      totalEventsDrawn++;
      const choice = pickRandom(event.choices);
      if (event.tactical) drawsByTemplateId[event.templateId] = (drawsByTemplateId[event.templateId] ?? 0) + 1;
      if (isClubOfferEvent(event.templateId)) {
        applyClubOfferChoice(player, league, event, choice.id, foreignLeagues);
        continue;
      }
      const fakeState = { player, seasonNumber } as unknown as GameState;
      if (choice.tacticalOption) {
        const ovr = overallRating(player);
        const bucket = bucketFor(ovr);
        const resolved = resolveTacticalOutcome(player, choice.tacticalOption, Math.random);
        totalTacticalDraws++;
        successByBucket[bucket].total++;
        successByRisk[choice.tacticalOption.risk].total++;
        // "Erfolg" = das per Konvention beste Outcome (outcomes[0], siehe
        // TacticalOutcome-Kommentar in types.ts) wurde gewürfelt - NICHT `type ===
        // "pos"`, weil einige risikoarme Optionen ihr bestes/wahrscheinlichstes
        // Outcome bewusst als "neutral" typisieren (z.B. "Ballbesitz gehalten"),
        // ohne dadurch weniger "die Option hat funktioniert" zu sein.
        if (resolved.outcome === choice.tacticalOption.outcomes[0]) {
          successByBucket[bucket].wins++;
          successByRisk[choice.tacticalOption.risk].wins++;
        }
        if (resolved.effects.matchGoalDelta) {
          totalTacticalGoals += resolved.effects.matchGoalDelta;
          careerTacticalGoals += resolved.effects.matchGoalDelta;
        }
        if (resolved.effects.matchAssistDelta) {
          totalTacticalAssists += resolved.effects.matchAssistDelta;
          careerTacticalAssists += resolved.effects.matchAssistDelta;
        }
        applyChoice(fakeState, { ...choice, effects: resolved.effects });
      } else {
        applyChoice(fakeState, choice);
      }
    }

    simulateSeason(player, seasonNumber, league, foreignLeagues, {});
    ageUpPlayer(player);
    resolveClubSituation(player, league);
    applyLeaguePromotionRelegation(player, league);
  }

  if (careerTacticalGoals > 0 || careerTacticalAssists > 0) careersWithTacticalGoals++;
  careerGoalsByPosition[position].push(player.careerTotals.goals);
  const totalCareerProduction = player.careerTotals.goals + player.careerTotals.assists;
  const tacticalShare = totalCareerProduction > 0 ? (careerTacticalGoals + careerTacticalAssists) / totalCareerProduction : 0;
  careerTacticalGoalShareByPosition[position].push(tacticalShare);
}

console.log(`\n=== ${NUM_CAREERS} vollständige Karrieren simuliert (Taktik-Events aktiv) ===\n`);

console.log("--- Frage 0: Wie oft kommen die taktischen Board-Events überhaupt vor? ---");
console.log(`  Simulierte Saisons insgesamt: ${totalSeasons} (Ø ${(totalSeasons / NUM_CAREERS).toFixed(1)} Saisons/Karriere)`);
console.log(`  Events insgesamt gezogen (alle Kategorien): ${totalEventsDrawn} (Ø ${(totalEventsDrawn / totalSeasons).toFixed(2)}/Saison)`);
console.log(
  `  Davon taktische Board-Events (Kondition erfüllt): ${totalTacticalDraws} (${((totalTacticalDraws / totalEventsDrawn) * 100).toFixed(1)}% aller Events, Ø ${(
    totalTacticalDraws / NUM_CAREERS
  ).toFixed(2)}/Karriere, Ø ${(totalTacticalDraws / totalSeasons).toFixed(3)}/Saison)`
);
console.log("\n  Pro Event-Template:");
for (const [id, n] of Object.entries(drawsByTemplateId).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${id.padEnd(38)} ${String(n).padStart(5)}  (Ø ${(n / NUM_CAREERS).toFixed(2)}/Karriere)`);
}
console.log("");

console.log("--- Frage 1: successChance-Streuung nach Gesamtstärke ---");
console.log(`(insgesamt ${totalTacticalDraws} taktische Entscheidungen gezogen)\n`);
for (const b of OVR_BUCKETS) {
  const s = successByBucket[b.label];
  const rate = s.total > 0 ? ((s.wins / s.total) * 100).toFixed(1) : "n/a";
  console.log(`  ${b.label.padEnd(20)} n=${String(s.total).padStart(6)}  Erfolgsquote(bestes Outcome)=${rate}%`);
}
console.log("\n  Nach Risiko-Stufe:");
for (const risk of ["low", "mid", "high"]) {
  const s = successByRisk[risk];
  const rate = s.total > 0 ? ((s.wins / s.total) * 100).toFixed(1) : "n/a";
  console.log(`  ${risk.padEnd(6)} n=${String(s.total).padStart(6)}  Erfolgsquote=${rate}%`);
}

console.log("\n--- Frage 2: Tor-/Vorlagen-Inflation durch taktische Events ---");
console.log(`  Karrieren mit mind. 1 taktischem Tor/Vorlage: ${careersWithTacticalGoals}/${NUM_CAREERS} (${((careersWithTacticalGoals / NUM_CAREERS) * 100).toFixed(1)}%)`);
console.log(`  Summe taktische Tore (matchGoalDelta):    ${totalTacticalGoals}  (Ø ${(totalTacticalGoals / NUM_CAREERS).toFixed(2)} / Karriere)`);
console.log(`  Summe taktische Vorlagen (matchAssistDelta): ${totalTacticalAssists}  (Ø ${(totalTacticalAssists / NUM_CAREERS).toFixed(2)} / Karriere)`);

console.log("\n  Nach Position (Ø Karriere-Tore gesamt, Ø Anteil taktischer Events an Tore+Vorlagen):");
for (const pos of POSITIONS) {
  const goals = careerGoalsByPosition[pos];
  const shares = careerTacticalGoalShareByPosition[pos];
  const avgGoals = goals.reduce((a, b) => a + b, 0) / (goals.length || 1);
  const avgShare = (shares.reduce((a, b) => a + b, 0) / (shares.length || 1)) * 100;
  console.log(`    ${pos.padEnd(4)} n=${String(goals.length).padStart(4)}  Ø Karriere-Tore=${avgGoals.toFixed(1).padStart(6)}  Ø taktischer Anteil=${avgShare.toFixed(1)}%`);
}
