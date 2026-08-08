// Narratives Leihjahr - siehe Player.loanNarrative in types.ts.
//
// Ein Spieler, der bei seinem Stammverein kaum zum Einsatz kommt, wird für eine
// Saison verliehen und durchlebt dabei drei aufeinanderfolgende Entscheidungen
// mit echtem Würfelwurf (1W6) + Momentum, statt der Saison als normale Mischung
// zufälliger Events. Solange `player.loanNarrative` gesetzt ist, gilt das
// Leihjahr als EXKLUSIVER Event-State (siehe careerEngine.ts
// `applyClubOfferChoice`/App.tsx `handleChoice`): keine anderen saisonalen
// Events, keine normale Auswahl über `pickSeasonTemplateIds`.
//
// Bewusst als eigenes, in sich geschlossenes Modul (wie europeanCup.ts/
// nationalCup.ts) - reine Logik, kein React, KEINE Abhängigkeit von
// careerEngine.ts (vermeidet einen zirkulären Import: careerEngine.ts
// importiert von hier, nicht umgekehrt - dieselbe Regel wie events.ts).

import { clamp } from "./data";
import { POSITION_WEIGHTS } from "./types";
import type { Attributes, AttributeKey, EffectDelta, LogEntry, Player, Position } from "./types";

// ---------------------------------------------------------------------------
// Warum wird verliehen? (Abschnitt 1)
// ---------------------------------------------------------------------------

export type LoanReasonId = "spielzeit" | "stagnation" | "konkurrenz" | "eigenwunsch" | "planung";

export interface LoanReason {
  id: LoanReasonId;
  title: string;
  text: string;
}

/**
 * Leitet den Leihgrund aus dem TATSÄCHLICHEN Spielerzustand ab (Priorität von
 * "am eindeutigsten belegt" zu generischem Fallback) - rein narrativ, keine
 * Spiellogik hängt daran. `shouldTriggerLoanAbroad` (careerEngine.ts) hat zu
 * diesem Zeitpunkt bereits geprüft, dass überhaupt eine Leihe plausibel ist
 * (junger Spieler, kaum Einsatzzeit) - diese Funktion wählt nur noch die
 * passendste von mehreren möglichen Erklärungen.
 */
export function deriveLoanReason(player: Player): LoanReason {
  const strugglingForMinutes =
    player.contract.squadRole === "Ergänzungsspieler" || player.contract.squadRole === "Ersatzbank";
  const lastTwo = player.seasonHistory.slice(-2);
  const stagnating = lastTwo.length === 2 && Math.abs(lastTwo[1].overallRating - lastTwo[0].overallRating) <= 1;

  if (player.consecutiveBenchSeasons >= 1 || strugglingForMinutes) {
    return {
      id: "spielzeit",
      title: "Zu wenig Spielzeit",
      text: `In der vergangenen Saison kamst du bei ${player.club.name} kaum zum Einsatz. Der Verein möchte dir Spielpraxis ermöglichen und stimmt deshalb einer Leihe zu.`,
    };
  }
  if (stagnating) {
    return {
      id: "stagnation",
      title: "Stagnierende Entwicklung",
      text: `Deine Entwicklung bei ${player.club.name} ist zuletzt ins Stocken geraten. Ein Tapetenwechsel mit mehr Verantwortung soll neuen Schwung bringen.`,
    };
  }
  if (player.contract.squadRole === "Rotation") {
    return {
      id: "konkurrenz",
      title: "Starke Konkurrenz auf der Position",
      text: `Auf deiner Position ist die Konkurrenz bei ${player.club.name} groß - für regelmäßige Einsätze reicht es aktuell nicht. Eine Leihe soll dir die Spielzeit verschaffen, die dir hier fehlt.`,
    };
  }
  if (player.wantsTransfer) {
    return {
      id: "eigenwunsch",
      title: "Der Wunsch nach mehr Spielzeit",
      text: `Du hast selbst deutlich gemacht, dass du mehr Spielpraxis brauchst. ${player.club.name} kommt dem Wunsch mit einer Leihe entgegen.`,
    };
  }
  if (player.contract.yearsLeft <= 1) {
    return {
      id: "planung",
      title: "Keine langfristige Planung",
      text: `${player.club.name} plant mittelfristig nicht fest mit dir und schickt dich auf Leihbasis, um deinen Marktwert nicht brach liegen zu lassen.`,
    };
  }
  return {
    id: "spielzeit",
    title: "Zu wenig Spielzeit",
    text: `Bei ${player.club.name} kommst du nicht auf die Einsatzzeit, die du bräuchtest. Der Verein möchte dir Spielpraxis ermöglichen und stimmt deshalb einer Leihe zu.`,
  };
}

// ---------------------------------------------------------------------------
// Attribut-/OVR-Hilfen - übersetzt die "OVR"/"Attribut"-Sprache der drei
// Leih-Entscheidungen in echte Attribut-Deltas über das bereits bestehende
// Positionsgewichtungssystem (siehe POSITION_WEIGHTS in types.ts) - KEIN neuer
// paralleler "OVR"-Wert auf dem Spieler, die tatsächliche Gesamtstärken-
// Veränderung ergibt sich rein rechnerisch daraus (wie überall sonst im Spiel).
// ---------------------------------------------------------------------------

function topAttributes(position: Position, count: number): AttributeKey[] {
  const weights = POSITION_WEIGHTS[position];
  return (Object.keys(weights) as AttributeKey[]).sort((a, b) => weights[b] - weights[a]).slice(0, count);
}

/** Ein Punktzuwachs/-abzug auf EIN einzelnes, am stärksten gewichtetes Attribut
 * - für "OVR"-formulierte Ausgänge (konzentrierter Effekt) und einfache
 * "±1 Attribut"-Ausgänge. */
function singleAttributeDelta(position: Position, points: number): Partial<Attributes> {
  const [primary] = topAttributes(position, 1);
  return { [primary]: points } as Partial<Attributes>;
}

/** Für "+2 Attribute" (zwei UNTERSCHIEDLICHE Attribute, je +1) - verteilt auf
 * die zwei am stärksten gewichteten Attribute der Position. */
function twinAttributeDelta(position: Position): Partial<Attributes> {
  const [a, b] = topAttributes(position, 2);
  return { [a]: 1, [b]: 1 } as Partial<Attributes>;
}

// ---------------------------------------------------------------------------
// Würfel + Momentum (Abschnitt 4)
// ---------------------------------------------------------------------------

export interface LoanMomentum {
  emoji: string;
  label: string;
  /** Modifikator, der auf den NÄCHSTEN Wurf angewendet wird. */
  modifier: number;
}

export const NEUTRAL_MOMENTUM: LoanMomentum = { emoji: "🟡", label: "Neutral", modifier: 0 };

/** Dieselben Stufengrenzen wie bei den Entscheidungs-Ausgängen selbst (1 /
 * 2-3 / 4-5 / 6) - ein Wurf, der sich wie ein "Durchbruch" anfühlt, erzeugt
 * auch Momentum wie ein Durchbruch für die nächste Entscheidung. */
function momentumForModifiedRoll(modifiedRoll: number): LoanMomentum {
  if (modifiedRoll <= 1) return { emoji: "🔴", label: "Schlechter Lauf", modifier: -1 };
  if (modifiedRoll <= 3) return { emoji: "🟡", label: "Neutral", modifier: 0 };
  if (modifiedRoll <= 5) return { emoji: "🟢", label: "Guter Lauf", modifier: 1 };
  return { emoji: "🔥", label: "Durchbruch", modifier: 2 };
}

export interface LoanRoll {
  raw: number;
  incomingMomentum: LoanMomentum;
  modifiedRoll: number;
  /** Momentum, das aus DIESEM Ergebnis für den NÄCHSTEN Wurf entsteht. */
  outgoingMomentum: LoanMomentum;
}

function rollLoanDice(rng: () => number, incomingMomentum: LoanMomentum): LoanRoll {
  const raw = Math.floor(rng() * 6) + 1;
  const modifiedRoll = clamp(raw + incomingMomentum.modifier, 1, 6);
  return { raw, incomingMomentum, modifiedRoll, outgoingMomentum: momentumForModifiedRoll(modifiedRoll) };
}

// ---------------------------------------------------------------------------
// Die drei Leih-Entscheidungen (Abschnitt 3)
// ---------------------------------------------------------------------------

export interface LoanOutcome {
  text: string;
  kind: LogEntry["kind"];
  effects: EffectDelta;
  /** Kurze, an der Spec orientierte Stichpunkte ("Einsatzchance +10") für die
   * Würfel-Ergebnis-Anzeige - siehe Abschnitt 9 Beispiel. */
  deltaLabel: string[];
}

export interface LoanChoiceDef {
  id: "a" | "b" | "c";
  label: string;
  detail: string;
  resolve: (modifiedRoll: number, position: Position) => LoanOutcome;
}

export interface LoanDecisionDef {
  templateId: string;
  title: string;
  description: (loanClubName: string) => string;
  choices: LoanChoiceDef[];
}

export const LOAN_DECISION_TEMPLATE_IDS = ["leihjahr_entscheidung_1", "leihjahr_entscheidung_2", "leihjahr_entscheidung_3"];

export const LOAN_DECISIONS: LoanDecisionDef[] = [
  // Ereignis 1 - Schwieriger Start
  {
    templateId: LOAN_DECISION_TEMPLATE_IDS[0],
    title: "Schwieriger Start",
    description: (loanClubName) =>
      `Bei ${loanClubName} bekommst du zunächst weniger Spielzeit als erwartet - der Trainer setzt erst einmal auf eingespielte Kräfte. Wie reagierst du?`,
    choices: [
      {
        id: "a",
        label: "„Ich kämpfe mich in die Mannschaft.“",
        detail: "Fokus: Einsatzzeit",
        resolve: (roll) => {
          if (roll <= 1)
            return {
              text: "Der Trainer bleibt skeptisch - du kommst kaum an ihm vorbei.",
              kind: "negative",
              effects: { clubRelation: -5 },
              deltaLabel: ["Einsatzchance -5"],
            };
          if (roll <= 3)
            return {
              text: "Du trainierst hart, aber der Trainer lässt sich noch nicht überzeugen.",
              kind: "info",
              effects: {},
              deltaLabel: [],
            };
          if (roll <= 5)
            return {
              text: "Der Trainer nimmt dich stärker wahr, erste Kurzeinsätze folgen.",
              kind: "positive",
              effects: { clubRelation: 10 },
              deltaLabel: ["Einsatzchance +10"],
            };
          return {
            text: "Der Trainer ist beeindruckt - du drängst dich unübersehbar in seine Pläne.",
            kind: "positive",
            effects: { clubRelation: 20, roleProtectionSeasons: 1 },
            deltaLabel: ["Einsatzchance +20"],
          };
        },
      },
      {
        id: "b",
        label: "„Ich arbeite gezielt an meinen Schwächen.“",
        detail: "Fokus: Entwicklung",
        resolve: (roll, position) => {
          if (roll <= 1)
            return {
              text: "Der Fokus aufs Training geht auf Kosten deiner Frische - ohne sichtbaren Fortschritt.",
              kind: "negative",
              effects: { attributes: singleAttributeDelta(position, -1) },
              deltaLabel: ["Attribut -1"],
            };
          if (roll <= 3)
            return {
              text: "Solide Trainingswochen, aber noch kein echter Sprung.",
              kind: "info",
              effects: {},
              deltaLabel: [],
            };
          if (roll <= 5)
            return {
              text: "Die Extraarbeit zahlt sich sichtbar aus.",
              kind: "positive",
              effects: { attributes: singleAttributeDelta(position, 1) },
              deltaLabel: ["Attribut +1"],
            };
          return {
            text: "Ein echter Entwicklungssprung - der Trainerstab ist beeindruckt.",
            kind: "positive",
            effects: { attributes: twinAttributeDelta(position) },
            deltaLabel: ["Attribute +2"],
          };
        },
      },
      {
        id: "c",
        label: "„Ich will sofort zeigen, dass ich besser bin.“",
        detail: "Fokus: Risiko",
        resolve: (roll, position) => {
          if (roll <= 1)
            return {
              text: "Der forsche Auftritt kommt beim Trainer und der Kabine schlecht an.",
              kind: "negative",
              effects: { clubRelation: -10, attributes: singleAttributeDelta(position, -1) },
              deltaLabel: ["Einsatzchance -10", "Attribut -1"],
            };
          if (roll <= 3)
            return {
              text: "Der Auftritt verpufft weitgehend - weder positiv noch negativ aufgefallen.",
              kind: "info",
              effects: {},
              deltaLabel: [],
            };
          if (roll <= 5)
            return {
              text: "Dein selbstbewusstes Auftreten setzt ein Zeichen.",
              kind: "positive",
              effects: { clubRelation: 10 },
              deltaLabel: ["Einsatzchance +10"],
            };
          return {
            text: "Ein Paukenschlag - du beweist sofort, dass du hier hingehörst.",
            kind: "positive",
            effects: { clubRelation: 20, attributes: singleAttributeDelta(position, 1), roleProtectionSeasons: 1 },
            deltaLabel: ["Einsatzchance +20", "Attribut +1"],
          };
        },
      },
    ],
  },
  // Ereignis 2 - Die Chance
  {
    templateId: LOAN_DECISION_TEMPLATE_IDS[1],
    title: "Die Chance",
    description: (loanClubName) =>
      `Nach einigen Monaten fällt bei ${loanClubName} ein Stammspieler aus deiner Position aus - deine Chance. Wie gehst du sie an?`,
    choices: [
      {
        id: "a",
        label: "„Ich nutze die Chance.“",
        detail: "Ausgewogen",
        resolve: (roll, position) => {
          if (roll <= 1)
            return {
              text: "Die Chance nutzt du nicht - dein Ersatz enttäuscht, und du rutschst wieder zurück.",
              kind: "negative",
              effects: { clubRelation: -10 },
              deltaLabel: ["Einsatzchance -10"],
            };
          if (roll <= 3)
            return {
              text: "Ordentliche Einsätze, ohne dich endgültig durchzusetzen.",
              kind: "info",
              effects: {},
              deltaLabel: [],
            };
          if (roll <= 5)
            return {
              text: "Du nutzt die Gelegenheit und überzeugst konstant.",
              kind: "positive",
              effects: { attributes: singleAttributeDelta(position, 1) },
              deltaLabel: ["Attribut +1 (Gesamtstärke steigt)"],
            };
          return {
            text: "Eine Galavorstellung genau zur richtigen Zeit.",
            kind: "positive",
            effects: { attributes: singleAttributeDelta(position, 2) },
            deltaLabel: ["Attribut +2 (Gesamtstärke steigt deutlich)"],
          };
        },
      },
      {
        id: "b",
        label: "„Ich gehe ins Risiko.“",
        detail: "High Risk / High Reward",
        resolve: (roll, position) => {
          if (roll <= 1)
            return {
              text: "Der riskante Ansatz geht gründlich daneben.",
              kind: "negative",
              effects: { attributes: singleAttributeDelta(position, -1) },
              deltaLabel: ["Gesamtstärke sinkt"],
            };
          if (roll <= 4)
            return {
              text: roll === 2 ? "Nichts Halbes und nichts Ganzes." : "Solide, aber unspektakuläre Leistungen.",
              kind: "info",
              effects: {},
              deltaLabel: [],
            };
          if (roll === 5)
            return {
              text: "Der Mut zahlt sich aus.",
              kind: "positive",
              effects: { attributes: singleAttributeDelta(position, 1) },
              deltaLabel: ["Gesamtstärke steigt"],
            };
          return {
            text: "Der Sprung ins kalte Wasser gelingt spektakulär - der Stammplatz gehört jetzt dir.",
            kind: "positive",
            effects: { attributes: singleAttributeDelta(position, 2), startingRoleGuaranteeSeasons: 1 },
            deltaLabel: ["Gesamtstärke steigt deutlich", "Stammplatz"],
          };
        },
      },
      {
        id: "c",
        label: "„Ich stelle die Mannschaft über mich.“",
        detail: "Fokus: Mentalität / Teamplay",
        resolve: (roll) => {
          if (roll <= 2)
            return {
              text: "Der Teamgeist wird honoriert, sportlich bleibt es aber folgenlos für dich persönlich.",
              kind: "info",
              effects: {},
              deltaLabel: [],
            };
          if (roll <= 4)
            return {
              text: "Deine Einstellung stabilisiert deinen Stand in der Kabine.",
              kind: "info",
              effects: { clubRelation: 5 },
              deltaLabel: ["Einsatzchance +5"],
            };
          if (roll === 5)
            return {
              text: "Dein Teamgeist bleibt nicht unbemerkt - du reifst als Führungsspieler.",
              kind: "positive",
              effects: { attributes: { mentalitaet: 1 } },
              deltaLabel: ["Mentalität +1"],
            };
          return {
            text: "Der Trainer lobt dich öffentlich als Vorbild - die Belohnung folgt auf dem Platz.",
            kind: "positive",
            effects: { attributes: { mentalitaet: 1 }, clubRelation: 10 },
            deltaLabel: ["Mentalität +1", "Einsatzchance +10"],
          };
        },
      },
    ],
  },
  // Ereignis 3 - Saisonfinale
  {
    templateId: LOAN_DECISION_TEMPLATE_IDS[2],
    title: "Saisonfinale",
    description: (loanClubName) =>
      `Noch fünf Spiele bei ${loanClubName}. Du hast dich entweder etabliert oder kämpfst weiterhin um deine Rolle - wie willst du die Saison beenden?`,
    choices: [
      {
        id: "a",
        label: "„Ich will die Saison mit einem Knall beenden.“",
        detail: "High Risk / High Reward",
        resolve: (roll, position) => {
          if (roll <= 1)
            return {
              text: "Der Alles-oder-nichts-Ansatz geht daneben - ein enttäuschender Ausklang.",
              kind: "negative",
              effects: { attributes: singleAttributeDelta(position, -1) },
              deltaLabel: ["Gesamtstärke sinkt"],
            };
          if (roll <= 3)
            return {
              text: "Die letzten Spiele verlaufen unspektakulär.",
              kind: "info",
              effects: {},
              deltaLabel: [],
            };
          if (roll === 4)
            return {
              text: "Ein starker Auftritt zum Saisonende.",
              kind: "positive",
              effects: { attributes: singleAttributeDelta(position, 1) },
              deltaLabel: ["Attribut +1"],
            };
          if (roll === 5)
            return {
              text: "Du beendest die Saison mit einer richtig starken Serie.",
              kind: "positive",
              effects: { attributes: singleAttributeDelta(position, 1) },
              deltaLabel: ["Gesamtstärke steigt"],
            };
          return {
            text: "Ein Paukenschlag zum Abschluss - die Saison endet mit einem echten Knall.",
            kind: "positive",
            effects: { attributes: singleAttributeDelta(position, 2) },
            deltaLabel: ["Gesamtstärke steigt deutlich"],
          };
        },
      },
      {
        id: "b",
        label: "„Ich will meine Leistungen stabilisieren.“",
        detail: "Geringeres Risiko",
        resolve: (roll, position) => {
          if (roll <= 2)
            return {
              text: "Trotz vorsichtiger Herangehensweise schleichen sich Nachlässigkeiten ein.",
              kind: "negative",
              effects: { attributes: singleAttributeDelta(position, -1) },
              deltaLabel: ["Attribut -1"],
            };
          if (roll <= 4)
            return {
              text: "Eine unauffällige, solide Schlussphase.",
              kind: "info",
              effects: {},
              deltaLabel: [],
            };
          if (roll === 5)
            return {
              text: "Konstanz zahlt sich aus - eine gefestigte Schlussphase.",
              kind: "positive",
              effects: { attributes: singleAttributeDelta(position, 1) },
              deltaLabel: ["Attribut +1"],
            };
          return {
            text: "Eine makellose Schlussphase rundet die Leihe stark ab.",
            kind: "positive",
            effects: { attributes: singleAttributeDelta(position, 1) },
            deltaLabel: ["Gesamtstärke steigt"],
          };
        },
      },
      {
        id: "c",
        label: "„Ich will unbedingt Stammspieler bleiben.“",
        detail: "Fokus: Einsatzzeit",
        resolve: (roll, position) => {
          if (roll <= 1)
            return {
              text: "Der Trainer dreht dich zurück - vom Stammplatz plötzlich weit entfernt.",
              kind: "negative",
              effects: { clubRelation: -10 },
              deltaLabel: ["Einsatzchance -10"],
            };
          if (roll <= 3)
            return {
              text: "Du bleibst Teil der Rotation, ohne dich weiter durchzusetzen.",
              kind: "info",
              effects: {},
              deltaLabel: [],
            };
          if (roll <= 5)
            return {
              text: "Du festigst deinen Platz in der Startelf.",
              kind: "positive",
              effects: { clubRelation: 5 },
              deltaLabel: ["Einsatzchance +5 (Stammspieler)"],
            };
          return {
            text: "Du beendest die Saison unangefochten als Stammspieler.",
            kind: "positive",
            effects: { clubRelation: 10, attributes: singleAttributeDelta(position, 1) },
            deltaLabel: ["Einsatzchance +10", "Attribut +1"],
          };
        },
      },
    ],
  },
];

export interface LoanDecisionResolution {
  roll: LoanRoll;
  outcome: LoanOutcome;
  choiceLabel: string;
}

/** Löst eine der drei Leih-Entscheidungen auf: würfelt (mit Momentum aus der
 * vorherigen Entscheidung), bestimmt den Ausgang für die gewählte Option und
 * gibt sowohl den Wurf als auch den Ausgang zurück - die eigentliche
 * Spieler-Mutation übernimmt careerEngine.ts (`applyLoanDecisionChoice`) über
 * die bereits bestehende `applyChoice`, damit Attribut-/Trait-Clamping usw.
 * exakt wie bei jedem anderen Event läuft. */
export function resolveLoanDecision(
  decisionIndex: number,
  choiceId: string,
  position: Position,
  incomingMomentum: LoanMomentum,
  rng: () => number
): LoanDecisionResolution {
  const decision = LOAN_DECISIONS[decisionIndex];
  const choice = decision.choices.find((c) => c.id === choiceId) ?? decision.choices[0];
  const roll = rollLoanDice(rng, incomingMomentum);
  const outcome = choice.resolve(roll.modifiedRoll, position);
  return { roll, outcome, choiceLabel: choice.label };
}

// ---------------------------------------------------------------------------
// Saisonbilanz-Bewertung + Vertragsangebot (Abschnitt 6 + 7)
// ---------------------------------------------------------------------------

export interface LoanSummaryTier {
  id: "breakout" | "etabliert" | "stabilisiert" | "rueckschlag" | "slump";
  emoji: string;
  label: string;
  description: string;
}

function tierScore(modifiedRoll: number): number {
  if (modifiedRoll <= 1) return -2;
  if (modifiedRoll <= 3) return 0;
  if (modifiedRoll <= 5) return 1;
  return 2;
}

/** Ergibt sich AUSSCHLIESSLICH aus den drei tatsächlichen Würfel-Ergebnissen
 * der Leihe (siehe Abschnitt 6: "Die Bewertung muss aus den tatsächlichen
 * Ergebnissen der drei Ereignisse entstehen") - keine zusätzliche, versteckte
 * Zufallskomponente. */
export function computeLoanSummaryTier(modifiedRolls: number[]): LoanSummaryTier {
  const sum = modifiedRolls.reduce((s, r) => s + tierScore(r), 0);
  if (sum >= 5) return { id: "breakout", emoji: "🔥", label: "BREAKOUT", description: "Deutliche positive Entwicklung." };
  if (sum >= 2) return { id: "etabliert", emoji: "🟢", label: "ETABLIERT", description: "Du hast dich beim Leihverein durchgesetzt." };
  if (sum >= -1)
    return { id: "stabilisiert", emoji: "🟡", label: "STABILISIERT", description: "Solide Saison ohne großen Entwicklungssprung." };
  if (sum >= -4)
    return { id: "rueckschlag", emoji: "🔴", label: "RÜCKSCHLAG", description: "Du konntest dich nicht wie erhofft entwickeln." };
  return { id: "slump", emoji: "💀", label: "SLUMP", description: "Die schwierige Phase hat sich fortgesetzt." };
}

const LOAN_KEEP_BASE_CHANCE: Record<LoanSummaryTier["id"], number> = {
  breakout: 0.72,
  etabliert: 0.5,
  stabilisiert: 0.3,
  rueckschlag: 0.14,
  slump: 0.05,
};

/** Wahrscheinlichkeit, dass der Leihverein am Saisonende eine dauerhafte
 * Verpflichtung anbietet - Basis nach Saisonbewertung (siehe Abschnitt 7),
 * zusätzlich moduliert danach, wie gut der Spieler tatsächlich zum
 * Leihverein passt (dieselbe Grundidee wie die übrige Transferökonomie in
 * careerEngine.ts, z.B. `squadRoleForOverall`/`rolePromiseChance`) - NIE
 * allein durch die Bewertung garantiert (siehe Obergrenze). */
export function loanClubKeepChance(tierId: LoanSummaryTier["id"], overall: number, loanClubStrength: number): number {
  const fitFactor = clamp((overall - loanClubStrength) / 60, -0.15, 0.25);
  return clamp(LOAN_KEEP_BASE_CHANCE[tierId] + fitFactor, 0.03, 0.9);
}
