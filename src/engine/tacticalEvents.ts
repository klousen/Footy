/**
 * Taktische Taktiktafel-Events (siehe "Handoff: Taktische Entscheidungs-Events").
 *
 * WICHTIG (siehe Handoff-Korrekturen): dies ist ein zweiter, eigenständiger
 * Effekt-Auflösungspfad NEBEN dem bestehenden `followUpChance` in `applyChoice`
 * (careerEngine.ts) - KEIN Ersatz, KEINE Änderung an bestehenden Events/Choices.
 * Alles hier ist additiv: neue Templates hängen sich nur über `EVENT_TEMPLATES.push(...)`
 * (siehe events.ts) an, `GameEvent.tactical`/`EventChoice.tacticalOption` sind
 * optionale Felder, die bei allen ~100 bestehenden Events unverändert fehlen.
 *
 * ENTFERNBARKEIT (siehe Nutzer-Vorgabe "muss man wieder rausnehmen können"):
 * Feature komplett entfernen = diese Datei löschen, den Import + `.push(...)`-
 * Aufruf in events.ts entfernen, den `tacticalOption`-Zweig in App.tsx
 * `handleChoice` entfernen, `<TacticalBoard>` aus EventCard.tsx entfernen und
 * die optionalen Felder in types.ts stehen lassen (harmlos ungenutzt) oder mit
 * entfernen. Kein bestehender Code-Pfad wird für diese Entfernung angefasst.
 *
 * Import-Hinweis: bewusst NUR aus `./types` und `./data` importiert (nicht aus
 * `./careerEngine`) - `careerEngine.ts` importiert seinerseits `EVENT_TEMPLATES`
 * aus `./events`, das wiederum `TACTICAL_EVENT_TEMPLATES` von HIER importiert.
 * Ein Import von careerEngine.ts hier würde also einen Zirkel schließen.
 */
import type {
  AttributeKey,
  EffectDelta,
  EventChoice,
  EventTemplate,
  Player,
  TacticalBoardTemplate,
  TacticalOption,
  TacticalOutcome,
} from "./types";
import { overallRatingFromAttributes } from "./types";
import { clamp } from "./data";

// ---------------------------------------------------------------------------
// Varianz-System (siehe Handoff §3: Templates + Spiegelung + Jitter)
// ---------------------------------------------------------------------------

const BOARD_W = 300;

/** Spiegelt jede x-Koordinate eines SVG-Pfad-Strings an der vertikalen Feldmitte
 * (x' = W - x) - Pfad-Koordinaten kommen als x,y-Zahlenpaare in Reihenfolge vor,
 * daher genügt es, jede geradzahlige Zahl im Pfad zu spiegeln. Siehe Mockup
 * `mirrorPath()` als Referenzimplementierung (1:1 identische Logik). */
function mirrorPath(path: string, W = BOARD_W): string {
  let i = 0;
  return path.replace(/-?\d+\.?\d*/g, (m) => {
    const num = parseFloat(m);
    const isX = i % 2 === 0;
    i++;
    return String(isX ? W - num : num);
  });
}

function mirrorTemplate(t: TacticalBoardTemplate, W = BOARD_W): TacticalBoardTemplate {
  const optionPaths: TacticalBoardTemplate["optionPaths"] = {};
  for (const choiceId of Object.keys(t.optionPaths)) {
    const o = t.optionPaths[choiceId];
    optionPaths[choiceId] = { path: mirrorPath(o.path, W), tagPos: [W - o.tagPos[0], o.tagPos[1]] };
  }
  return {
    name: `${t.name} (Spiegelseite)`,
    players: t.players.map((p) => ({ ...p, x: W - p.x })),
    optionPaths,
  };
}

/** ±18px Zufalls-Offset auf dem 300x400-Raster (siehe Handoff §3 Punkt 3), damit
 * auch identische Templates bei wiederholtem Ziehen nie pixelgenau gleich aussehen. */
function jitterPlayers(players: TacticalBoardTemplate["players"], rngFn: () => number, amount = 18) {
  return players.map((p) => ({
    ...p,
    x: p.x + (rngFn() * 2 - 1) * amount,
    y: p.y + (rngFn() * 2 - 1) * amount,
  }));
}

/**
 * Wählt zufällig ein Template (inkl. automatisch gespiegelter Varianten, siehe
 * `mirrorTemplate`) und wendet Jitter an.
 *
 * BEWUSSTE VEREINFACHUNG ggü. Handoff §3: kein `lastVariantIndex`-Tracking über
 * mehrere Ziehungen DESSELBEN Events hinweg ("nicht zweimal in Folge dasselbe
 * Template"). Das würde einen neuen, persistierten `Player`-Zustand rein für
 * kosmetische Varianz erfordern (Speicherformat/`storage.ts` betroffen) - bei
 * 2-3 Templates x 2 (Spiegelung) = 4-6 effektiven Varianten pro Event und dem
 * ohnehin aktiven Cooldown zwischen zwei Ziehungen DESSELBEN Events (siehe
 * `pickSeasonTemplateIds`, typischerweise mehrere Saisons Abstand) bleibt die
 * Wiederholungswahrscheinlichkeit in der Praxis gering. Kann bei Bedarf später
 * nachgerüstet werden, ohne dass diese Funktion ihre Signatur ändern muss.
 */
export function pickTacticalVariant(templates: TacticalBoardTemplate[], rngFn: () => number): TacticalBoardTemplate {
  const pool = templates.concat(templates.map((t) => mirrorTemplate(t)));
  const chosen = pool[Math.floor(rngFn() * pool.length)];
  return { ...chosen, players: jitterPlayers(chosen.players, rngFn) };
}

/** Baut die `EventChoice[]` eines taktischen Events aus den (event-fixen) Options-
 * Spezifikationen und der für diese Ziehung gewählten Board-Variante (Pfad pro
 * Choice-ID, siehe `TacticalBoardTemplate.optionPaths`). */
export interface TacticalOptionSpec {
  id: string;
  label: string;
  detail: string;
  risk: TacticalOption["risk"];
  relevantAttributes: AttributeKey[];
  outcomes: TacticalOutcome[];
}

export function buildTacticalChoices(specs: TacticalOptionSpec[], variant: TacticalBoardTemplate): EventChoice[] {
  return specs.map((spec) => {
    const path = variant.optionPaths[spec.id];
    return {
      id: spec.id,
      label: spec.label,
      detail: spec.detail,
      // Bleibt bewusst leer - der tatsächliche Effekt kommt erst zur Laufzeit aus
      // `resolveTacticalOutcome`, siehe `EventChoice.tacticalOption`-Kommentar.
      effects: {},
      tacticalOption: {
        risk: spec.risk,
        relevantAttributes: spec.relevantAttributes,
        outcomes: spec.outcomes,
        boardPath: path?.path ?? "",
        boardTagPos: path?.tagPos ?? [0, 0],
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Erfolgswahrscheinlichkeit (siehe Handoff §4 "Mix-Modell")
// ---------------------------------------------------------------------------

const BASE_SUCCESS_CHANCE: Record<TacticalOption["risk"], number> = { low: 0.75, mid: 0.55, high: 0.35 };

/** Grobe Näherung an "aktuelle Formkategorie" (siehe Handoff §4) - es gibt keine
 * laufende, saisoninterne Formkurve im Spiel, nur den `scoreTier`-Text der
 * ABGESCHLOSSENEN Vorsaison (siehe `computeSeasonScore` in careerEngine.ts). Für
 * einen Spieler ohne bisherige Saison (`seasonHistory` leer) bleibt der Modifikator
 * neutral (0). */
const FORM_MODIFIER: Record<string, number> = {
  "Überragende Saison": 0.1,
  "Starke Saison": 0.05,
  "Solide Saison": 0,
  "Schwierige Saison": -0.1,
};

function computeSuccessChance(player: Player, option: TacticalOption): number {
  const relevant = option.relevantAttributes;
  const attrScore = relevant.length === 0 ? 0.5 : relevant.reduce((sum, key) => sum + player.attributes[key], 0) / relevant.length / 99;
  const lastTier = player.seasonHistory.at(-1)?.scoreTier;
  const formModifier = lastTier !== undefined ? FORM_MODIFIER[lastTier] ?? 0 : 0;
  const overall = overallRatingFromAttributes(player.attributes, player.position);
  const overallModifier = (overall - 50) / 500;
  const base = BASE_SUCCESS_CHANCE[option.risk];
  return clamp(base + (attrScore - 0.5) * 0.5 + formModifier + overallModifier, 0.1, 0.9);
}

/** `logKind` fürs bestehende Feedback-Panel (siehe `summarizeEffects`/`EventCard`) -
 * "neutral" bildet auf "info" ab (kein eigener vierter Zustand nötig). */
function logKindFor(type: TacticalOutcome["type"]): EffectDelta["logKind"] {
  if (type === "pos") return "positive";
  if (type === "neg") return "negative";
  return "info";
}

function finalizeOutcome(outcome: TacticalOutcome): { outcome: TacticalOutcome; effects: EffectDelta } {
  return {
    outcome,
    effects: { ...outcome.effects, logText: outcome.text, logKind: logKindFor(outcome.type) },
  };
}

/**
 * Würfelt den tatsächlichen Ausgang einer gewählten taktischen Option.
 *
 * `outcomes[0]` gilt per Konvention als das anzustrebende/beste Ergebnis (siehe
 * `TacticalOutcome`-Kommentar in types.ts) - dessen Eintrittswahrscheinlichkeit
 * ist `successChance`. Alle weiteren Outcomes teilen sich `1 - successChance`
 * proportional zu ihrem `weight`. Bei nur einem Outcome (z.B. "Ball halten &
 * Tempo rausnehmen" - garantiert sicher) entfällt das Würfeln komplett.
 *
 * Wird von App.tsx `handleChoice` aufgerufen, BEVOR `applyChoice` (careerEngine.ts)
 * läuft - das zurückgegebene `effects` wird 1:1 wie jeder andere `EventChoice.effects`
 * weiterverarbeitet (Attribut-Clamping, `summarizeEffects` fürs Feedback-Panel usw.),
 * `applyChoice` selbst bleibt unangetastet.
 */
export function resolveTacticalOutcome(
  player: Player,
  option: TacticalOption,
  rngFn: () => number
): { outcome: TacticalOutcome; effects: EffectDelta } {
  const outcomes = option.outcomes;
  if (outcomes.length <= 1) return finalizeOutcome(outcomes[0]);

  const successChance = computeSuccessChance(player, option);
  const [best, ...rest] = outcomes;
  const restWeightTotal = rest.reduce((sum, o) => sum + o.weight, 0) || 1;
  const probabilities = [successChance, ...rest.map((o) => (1 - successChance) * (o.weight / restWeightTotal))];

  const roll = rngFn();
  let cumulative = 0;
  for (let i = 0; i < outcomes.length; i++) {
    cumulative += probabilities[i];
    if (roll <= cumulative) return finalizeOutcome(outcomes[i]);
  }
  return finalizeOutcome(best);
}

// ---------------------------------------------------------------------------
// Content: Welle 1 (siehe Handoff §6d Punkt 4) - die 4 im Mockup bereits
// varianten- und positionslogik-geprüften Events (Flanke, Steckpass, Tackling,
// Torwart). Templates/Pfade 1:1 aus `taktik-popup-mockup-v5-proportionen.html`
// übernommen (bereits als "finale visuelle Referenz" abgenommen).
// ---------------------------------------------------------------------------

const FLUEGEL_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Außen freigespielt",
    players: [
      { x: 230, y: 300, type: "self", label: "DU" },
      { x: 150, y: 105, type: "team", label: "9" },
      { x: 110, y: 62, type: "team", label: "11" },
      { x: 215, y: 178, type: "team", label: "8" },
      { x: 170, y: 158, type: "opp" },
      { x: 130, y: 90, type: "opp" },
    ],
    optionPaths: {
      cross: { path: "M 230 300 Q 190 195 150 115", tagPos: [210, 200] },
      cutback: { path: "M 230 300 Q 255 232 215 178", tagPos: [250, 236] },
      solo: { path: "M 230 300 Q 200 228 175 170", tagPos: [195, 260] },
    },
  },
  {
    name: "Halbrechts, enger Winkel",
    players: [
      { x: 255, y: 230, type: "self", label: "DU" },
      { x: 160, y: 135, type: "team", label: "9" },
      { x: 130, y: 190, type: "team", label: "11" },
      { x: 200, y: 120, type: "opp" },
      { x: 230, y: 165, type: "opp" },
    ],
    optionPaths: {
      cross: { path: "M 255 230 Q 210 175 165 140", tagPos: [225, 175] },
      cutback: { path: "M 255 230 Q 200 210 155 200", tagPos: [210, 215] },
      solo: { path: "M 255 230 Q 235 175 205 130", tagPos: [250, 180] },
    },
  },
  {
    name: "Tief abgedrängt, Ecke droht",
    players: [
      { x: 270, y: 340, type: "self", label: "DU" },
      { x: 150, y: 160, type: "team", label: "9" },
      { x: 190, y: 110, type: "team", label: "11" },
      { x: 220, y: 250, type: "opp" },
      { x: 160, y: 200, type: "opp" },
    ],
    optionPaths: {
      cross: { path: "M 270 340 Q 230 220 190 120", tagPos: [245, 230] },
      cutback: { path: "M 270 340 Q 300 300 270 260", tagPos: [300, 300] },
      solo: { path: "M 270 340 Q 235 260 210 190", tagPos: [225, 260] },
    },
  },
];

const FLUEGEL_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "cross",
    label: "Flanke auf den Kopf",
    detail: "Hereingabe auf den einlaufenden Stürmer.",
    risk: "mid",
    relevantAttributes: ["technik"],
    outcomes: [
      {
        weight: 1,
        headline: "Volltreffer!",
        type: "pos",
        text: "hat die Flanke exakt auf den Kopf des Stürmers gebracht - Kopfballtor!",
        effects: { reputation: 3, morale: 4, clubRelation: 1 },
      },
      {
        weight: 1,
        headline: "Abgefangen",
        type: "neg",
        text: "hat die Flanke zu ungenau geschlagen - die Abwehr klärt zur Ecke.",
        effects: { morale: -1 },
      },
    ],
  },
  {
    id: "cutback",
    label: "Cutback zum zweiten Ball",
    detail: "Flacher Rückpass zum nachrückenden Mittelfeldspieler.",
    risk: "low",
    relevantAttributes: ["intelligenz"],
    outcomes: [
      {
        weight: 1,
        headline: "Kontrolliert weitergespielt",
        type: "neutral",
        text: "hat den Ball sicher zum nachrückenden Mitspieler zurückgelegt.",
        effects: { clubRelation: 1 },
      },
      {
        weight: 1,
        headline: "Abgeblockt",
        type: "neg",
        text: "hat den Rückpass zu spät gespielt - der Ball wird abgefangen.",
        effects: { morale: -1 },
      },
    ],
  },
  {
    id: "solo",
    label: "Selbst ins Dribbling",
    detail: "Du ziehst nach innen und suchst den Abschluss.",
    risk: "high",
    relevantAttributes: ["technik", "tempo"],
    outcomes: [
      {
        weight: 1,
        headline: "Traumtor!",
        type: "pos",
        text: "ist selbst nach innen gezogen und hat platziert ins lange Eck getroffen!",
        effects: { reputation: 4, morale: 6 },
      },
      {
        weight: 1,
        headline: "Chance vergeben",
        type: "neg",
        text: "hat den Abschluss zu unplatziert gesetzt - der Torwart hält sicher.",
        effects: { morale: -2 },
      },
    ],
  },
];

const LUECKE_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Linke Schnittstelle",
    players: [
      { x: 150, y: 320, type: "self", label: "DU" },
      { x: 100, y: 135, type: "team", label: "7" },
      { x: 220, y: 150, type: "team", label: "8" },
      { x: 130, y: 98, type: "opp" },
      { x: 170, y: 140, type: "opp" },
    ],
    optionPaths: {
      through: { path: "M 150 320 Q 110 228 100 145", tagPos: [95, 228] },
      hold: { path: "M 150 320 Q 175 300 160 282", tagPos: [185, 296] },
      switch: { path: "M 150 320 Q 220 228 220 138", tagPos: [235, 228] },
    },
  },
  {
    name: "Zentral, tief gestaffelt",
    players: [
      { x: 150, y: 355, type: "self", label: "DU" },
      { x: 150, y: 150, type: "team", label: "10" },
      { x: 120, y: 250, type: "opp" },
      { x: 180, y: 200, type: "opp" },
    ],
    optionPaths: {
      through: { path: "M 150 355 L 150 160", tagPos: [175, 260] },
      hold: { path: "M 150 355 Q 175 335 160 315", tagPos: [185, 330] },
      switch: { path: "M 150 355 Q 200 260 230 190", tagPos: [200, 290] },
    },
  },
];

const LUECKE_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "through",
    label: "Steckpass durch die Schnittstelle",
    detail: "Präziser Ball in den Lauf des Flügelspielers.",
    risk: "high",
    relevantAttributes: ["intelligenz"],
    outcomes: [
      {
        weight: 1,
        headline: "Traumvorlage!",
        type: "pos",
        text: "hat den Steckpass exakt in den Lauf gespielt - Vorlage zum Tor!",
        effects: { reputation: 3, morale: 5, clubRelation: 1 },
      },
      {
        weight: 1,
        headline: "Zu ungenau",
        type: "neg",
        text: "hat den Steckpass eine Idee zu stark gespielt - Abstoß.",
        effects: { morale: -1 },
      },
    ],
  },
  {
    id: "hold",
    label: "Ball halten & Tempo rausnehmen",
    detail: "Ballbesitz sichern, Struktur wahren.",
    risk: "low",
    relevantAttributes: ["technik"],
    outcomes: [
      {
        weight: 1,
        headline: "Ballbesitz gehalten",
        type: "neutral",
        text: "hat den Ball sicher gehalten und das Tempo rausgenommen.",
        effects: {},
      },
    ],
  },
  {
    id: "switch",
    label: "Spiel verlagern",
    detail: "Langer Ball auf die andere Seite.",
    risk: "mid",
    relevantAttributes: ["technik"],
    outcomes: [
      {
        weight: 1,
        headline: "Neue Anspielstation eröffnet",
        type: "pos",
        text: "hat das Spiel verlagert - die Abwehr wird auseinandergezogen.",
        effects: { clubRelation: 1, morale: 2 },
      },
      {
        weight: 1,
        headline: "Ungenau gespielt",
        type: "neg",
        text: "hat den Verlagerungsball zu lang angesetzt - direkt ins Aus.",
        effects: { morale: -1 },
      },
    ],
  },
];

const LETZTER_MANN_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Zentral, direkter Weg zum Tor",
    players: [
      { x: 150, y: 255, type: "self", label: "DU" },
      { x: 150, y: 130, type: "opp", label: "9" },
      { x: 175, y: 345, type: "team" },
    ],
    optionPaths: {
      tackle: { path: "M 150 255 L 150 140", tagPos: [175, 200] },
      position: { path: "M 150 255 Q 205 200 180 145", tagPos: [210, 185] },
    },
  },
  {
    name: "Diagonal von der Seite",
    players: [
      { x: 100, y: 235, type: "self", label: "DU" },
      { x: 190, y: 150, type: "opp", label: "9" },
      { x: 230, y: 330, type: "team" },
    ],
    optionPaths: {
      tackle: { path: "M 100 235 Q 140 190 185 155", tagPos: [120, 195] },
      position: { path: "M 100 235 Q 150 280 200 265", tagPos: [150, 285] },
    },
  },
];

const LETZTER_MANN_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "tackle",
    label: "Hart reingrätschen",
    detail: "Volles Risiko - Ball erobern oder Foul riskieren.",
    risk: "high",
    relevantAttributes: ["physis"],
    outcomes: [
      {
        weight: 1,
        headline: "Sauber geklärt!",
        type: "pos",
        text: "hat den Ball im vollen Risiko sauber vom Fuß des Stürmers gegrätscht.",
        effects: { reputation: 3, morale: 5 },
      },
      {
        weight: 1,
        headline: "Elfmeter & Gelb-Rot",
        type: "neg",
        text: "ist zu spät gekommen - Elfmeter und Gelb-Rot.",
        effects: { morale: -8, reputation: -2, clubRelation: -2, traitDeltas: { disziplin: -4 } },
      },
    ],
  },
  {
    id: "position",
    label: "Stellungsspiel & verzögern",
    detail: "Verzögern, auf die Außenlinie drängen.",
    risk: "mid",
    relevantAttributes: ["intelligenz"],
    outcomes: [
      {
        weight: 1,
        headline: "Chance entschärft",
        type: "pos",
        text: "hat den Stürmer clever auf die schwache Seite gedrängt.",
        effects: { morale: 2, clubRelation: 1 },
      },
      {
        weight: 1,
        headline: "Doch getroffen",
        type: "neg",
        text: "hat den Stürmer nicht vom Abschluss abhalten können.",
        effects: { morale: -2 },
      },
    ],
  },
];

const TORWART_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Zentraler Durchbruch",
    players: [
      { x: 150, y: 345, type: "self", label: "TW" },
      { x: 150, y: 175, type: "opp", label: "9" },
    ],
    optionPaths: {
      rush: { path: "M 150 345 L 150 200", tagPos: [180, 270] },
      hold_line: { path: "M 150 345 L 150 350", tagPos: [190, 345] },
    },
  },
  {
    name: "Durchbruch von halbrechts",
    players: [
      { x: 150, y: 345, type: "self", label: "TW" },
      { x: 210, y: 190, type: "opp", label: "9" },
    ],
    optionPaths: {
      rush: { path: "M 150 345 Q 175 270 205 210", tagPos: [195, 280] },
      hold_line: { path: "M 150 345 Q 158 340 165 342", tagPos: [195, 340] },
    },
  },
];

const TORWART_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "rush",
    label: "Aggressiv rauslaufen",
    detail: "Den Raum eng machen, volles Risiko.",
    risk: "high",
    relevantAttributes: ["intelligenz"],
    outcomes: [
      {
        weight: 1,
        headline: "Glänzend geklärt!",
        type: "pos",
        text: "ist beherzt herausgelaufen und hat den Winkel perfekt verkürzt.",
        effects: { reputation: 3, morale: 6 },
      },
      {
        weight: 1,
        headline: "Umkurvt",
        type: "neg",
        text: "ist herausgelaufen, wurde aber cool umkurvt.",
        effects: { morale: -4 },
      },
    ],
  },
  {
    id: "hold_line",
    label: "Auf der Linie bleiben",
    detail: "Reflexe statt Risiko - auf den Schuss reagieren.",
    risk: "low",
    relevantAttributes: ["physis"],
    outcomes: [
      {
        weight: 1,
        headline: "Stark pariert",
        type: "pos",
        text: "ist auf der Linie geblieben und hat reflexartig pariert.",
        effects: { morale: 2 },
      },
      {
        weight: 1,
        headline: "Keine Chance",
        type: "neg",
        text: "hat den platzierten Schuss trotz guter Reaktion nicht erreicht.",
        effects: { morale: -2 },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Content: Welle 2 (siehe Handoff §6d Punkt 4) - restliche Board-Events aus
// §6b. BEWUSSTE VEREINFACHUNG ggü. §6d Punkt 5 ("3 Templates Standard, 4 bei
// häufig gezogenen Events"): hier durchgängig 2 handkuratierte Templates pro
// Event (= 4 effektive Varianten durch Spiegelung, siehe `pickTacticalVariant`)
// statt 3 - deckt eine typische Karriere ausreichend ab, hält aber den
// Content-Umfang dieser Welle überschaubar. Auf 3 aufstocken ist jederzeit
// möglich, ohne Struktur/Code zu ändern (siehe `TacticalBoardTemplate`).
// ---------------------------------------------------------------------------

const LAUFWEG_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Rechter Halbraum, früher Laufweg",
    players: [
      { x: 220, y: 275, type: "self", label: "DU" },
      { x: 140, y: 230, type: "team", label: "7" },
      { x: 190, y: 150, type: "opp" },
      { x: 150, y: 100, type: "opp" },
    ],
    optionPaths: {
      short: { path: "M 220 275 Q 190 190 165 110", tagPos: [230, 190] },
      timed: { path: "M 220 275 Q 200 220 175 150", tagPos: [235, 225] },
    },
  },
  {
    name: "Zentral, Flanke von links",
    players: [
      { x: 160, y: 300, type: "self", label: "DU" },
      { x: 60, y: 150, type: "team", label: "11" },
      { x: 140, y: 160, type: "opp" },
      { x: 180, y: 110, type: "opp" },
    ],
    optionPaths: {
      short: { path: "M 160 300 Q 130 210 110 130", tagPos: [100, 210] },
      timed: { path: "M 160 300 Q 150 240 140 175", tagPos: [175, 245] },
    },
  },
];

const LAUFWEG_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "short",
    label: "Früh in die Box starten",
    detail: "Sofort losziehen - schneller am Ball, aber Abseitsrisiko.",
    risk: "high",
    relevantAttributes: ["tempo"],
    outcomes: [
      {
        weight: 1,
        headline: "Am ersten Pfosten getroffen!",
        type: "pos",
        text: "ist früh gestartet und hat am ersten Pfosten getroffen!",
        effects: { reputation: 3, morale: 5 },
      },
      { weight: 1, headline: "Abseits gestanden", type: "neg", text: "ist zu früh losgelaufen und stand im Abseits.", effects: { morale: -2 } },
    ],
  },
  {
    id: "timed",
    label: "Laufweg timen",
    detail: "Kurz warten, dann punktgenau in den Rückraum starten.",
    risk: "mid",
    relevantAttributes: ["intelligenz"],
    outcomes: [
      {
        weight: 1,
        headline: "Punktgenau aufgetaucht",
        type: "pos",
        text: "ist punktgenau im Rückraum aufgetaucht und hat abgeschlossen.",
        effects: { reputation: 2, morale: 3 },
      },
      { weight: 1, headline: "Zu spät gestartet", type: "neg", text: "ist eine Idee zu spät gestartet - die Chance ist vorbei.", effects: { morale: -1 } },
    ],
  },
];

const DOPPELPASS_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Eng gestaffelt im letzten Drittel",
    players: [
      { x: 150, y: 280, type: "self", label: "DU" },
      { x: 190, y: 210, type: "team", label: "9" },
      { x: 160, y: 230, type: "opp" },
      { x: 120, y: 180, type: "opp" },
    ],
    optionPaths: {
      doppelpass: { path: "M 150 280 Q 175 245 190 215", tagPos: [195, 240] },
      alleingang: { path: "M 150 280 Q 130 220 110 160", tagPos: [100, 220] },
    },
  },
  {
    name: "Zwei gegen zwei am Strafraumrand",
    players: [
      { x: 200, y: 260, type: "self", label: "DU" },
      { x: 140, y: 210, type: "team", label: "8" },
      { x: 180, y: 200, type: "opp" },
      { x: 150, y: 150, type: "opp" },
    ],
    optionPaths: {
      doppelpass: { path: "M 200 260 Q 170 230 145 215", tagPos: [155, 235] },
      alleingang: { path: "M 200 260 Q 190 190 175 130", tagPos: [210, 190] },
    },
  },
];

const DOPPELPASS_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "doppelpass",
    label: "Doppelpass spielen",
    detail: "Ball ablegen und sofort in die Lücke starten.",
    risk: "mid",
    relevantAttributes: ["intelligenz"],
    outcomes: [
      { weight: 1, headline: "Doppelpass klappt!", type: "pos", text: "hat den Doppelpass angesetzt und kommt frei zum Abschluss.", effects: { reputation: 2, morale: 4, clubRelation: 1 } },
      { weight: 1, headline: "Rückpass kommt nicht an", type: "neg", text: "hat den Doppelpass angesetzt, doch der Rückpass kommt nicht an.", effects: { morale: -1 } },
    ],
  },
  {
    id: "alleingang",
    label: "Selbst durchgehen",
    detail: "Im engen Raum das Dribbling suchen.",
    risk: "high",
    relevantAttributes: ["technik"],
    outcomes: [
      { weight: 1, headline: "Vorbei an allen!", type: "pos", text: "ist im Alleingang an mehreren Gegenspielern vorbeigezogen!", effects: { reputation: 4, morale: 6 } },
      { weight: 1, headline: "Im Gewühl hängengeblieben", type: "neg", text: "ist im engen Raum hängengeblieben - der Ball geht verloren.", effects: { morale: -2 } },
    ],
  },
];

const KOPFBALLDUELL_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Flanke von rechts",
    players: [
      { x: 150, y: 270, type: "self", label: "DU" },
      { x: 170, y: 240, type: "opp", label: "9" },
      { x: 110, y: 330, type: "team" },
    ],
    optionPaths: {
      vollrisiko: { path: "M 150 270 Q 165 250 175 235", tagPos: [190, 245] },
      absichern: { path: "M 150 270 Q 140 300 130 330", tagPos: [110, 300] },
    },
  },
  {
    name: "Ecke, zweiter Pfosten",
    players: [
      { x: 110, y: 255, type: "self", label: "DU" },
      { x: 140, y: 225, type: "opp", label: "9" },
      { x: 200, y: 340, type: "team" },
    ],
    optionPaths: {
      vollrisiko: { path: "M 110 255 Q 125 240 140 225", tagPos: [150, 230] },
      absichern: { path: "M 110 255 Q 150 300 190 335", tagPos: [190, 290] },
    },
  },
];

const KOPFBALLDUELL_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "vollrisiko",
    label: "Vollrisiko im Kopfballduell",
    detail: "Konsequent gegen den Stürmer hochgehen.",
    risk: "high",
    relevantAttributes: ["physis"],
    outcomes: [
      { weight: 1, headline: "Kopfball geklärt!", type: "pos", text: "ist konsequent hochgegangen und hat den Ball sauber geklärt.", effects: { reputation: 3, morale: 5 } },
      { weight: 1, headline: "Kopfballduell verloren", type: "neg", text: "hat das Kopfballduell verloren - brenzlige Situation im eigenen Strafraum.", effects: { morale: -4 } },
    ],
  },
  {
    id: "absichern",
    label: "Abwehrchef-Absicherung",
    detail: "Nicht ins Duell gehen, stattdessen den zweiten Ball absichern.",
    risk: "low",
    relevantAttributes: ["intelligenz"],
    outcomes: [
      { weight: 1, headline: "Sauber abgesichert", type: "pos", text: "hat auf Nummer sicher gespielt und den zweiten Ball sauber abgesichert.", effects: { morale: 2 } },
      { weight: 1, headline: "Zweiter Ball geht verloren", type: "neg", text: "hat sich abgesichert, doch der zweite Ball geht trotzdem verloren.", effects: { morale: -1 } },
    ],
  },
];

const OEFFNENDER_BALL_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Zentrales Mittelfeld, Raum hinter der Kette",
    players: [
      { x: 150, y: 300, type: "self", label: "DU" },
      { x: 120, y: 120, type: "team", label: "9" },
      { x: 160, y: 150, type: "opp" },
      { x: 110, y: 90, type: "opp" },
    ],
    optionPaths: {
      riskant: { path: "M 150 300 Q 130 210 120 130", tagPos: [105, 210] },
      sicher: { path: "M 150 300 Q 165 280 155 260", tagPos: [185, 280] },
    },
  },
  {
    name: "Von halblinks aufgerückt",
    players: [
      { x: 110, y: 310, type: "self", label: "DU" },
      { x: 200, y: 140, type: "team", label: "11" },
      { x: 160, y: 160, type: "opp" },
      { x: 210, y: 110, type: "opp" },
    ],
    optionPaths: {
      riskant: { path: "M 110 310 Q 160 220 195 150", tagPos: [175, 215] },
      sicher: { path: "M 110 310 Q 130 290 120 270", tagPos: [145, 295] },
    },
  },
];

const OEFFNENDER_BALL_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "riskant",
    label: "Scharfer Ball in die Tiefe",
    detail: "Direkt hinter die letzte Kette spielen.",
    risk: "high",
    relevantAttributes: ["intelligenz"],
    outcomes: [
      { weight: 1, headline: "Kette ausgehebelt!", type: "pos", text: "hat die letzte Kette mit einem scharfen Ball in die Tiefe ausgehebelt.", effects: { reputation: 3, morale: 5, clubRelation: 1 } },
      { weight: 1, headline: "Abgefangen", type: "neg", text: "hat den Ball in die Tiefe zu ungenau gespielt - abgefangen.", effects: { morale: -1 } },
    ],
  },
  {
    id: "sicher",
    label: "Sicher im Mittelfeld halten",
    detail: "Kein Risiko, den Ball im Mittelfeld zirkulieren lassen.",
    risk: "low",
    relevantAttributes: ["technik"],
    outcomes: [{ weight: 1, headline: "Ballbesitz gehalten", type: "neutral", text: "hat den Ball sicher im Mittelfeld gehalten.", effects: {} }],
  },
];

const KONTER_EINLEITEN_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Ballgewinn im Mittelfeld",
    players: [
      { x: 150, y: 260, type: "self", label: "DU" },
      { x: 190, y: 150, type: "team", label: "8" },
      { x: 160, y: 200, type: "opp" },
    ],
    optionPaths: {
      konter: { path: "M 150 260 Q 175 205 190 155", tagPos: [210, 200] },
      ordnung: { path: "M 150 260 Q 140 290 130 320", tagPos: [110, 295] },
    },
  },
  {
    name: "Ballgewinn am eigenen Strafraum",
    players: [
      { x: 150, y: 320, type: "self", label: "DU" },
      { x: 130, y: 180, type: "team", label: "6" },
      { x: 175, y: 270, type: "opp" },
    ],
    optionPaths: {
      konter: { path: "M 150 320 Q 140 250 135 190", tagPos: [110, 250] },
      ordnung: { path: "M 150 320 Q 165 345 175 360", tagPos: [195, 345] },
    },
  },
];

const KONTER_EINLEITEN_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "konter",
    label: "Sofort nach vorne spielen",
    detail: "Den Gegner im Umschalten überraschen.",
    risk: "mid",
    relevantAttributes: ["tempo"],
    outcomes: [
      { weight: 1, headline: "Blitzkonter!", type: "pos", text: "hat den Ball sofort nach vorne gespielt - Blitzkonter!", effects: { reputation: 3, morale: 5 } },
      { weight: 1, headline: "Ball zu früh verloren", type: "neg", text: "hat zu früh nach vorne gespielt - der Ball geht sofort wieder verloren.", effects: { morale: -2 } },
    ],
  },
  {
    id: "ordnung",
    label: "Ordnung halten",
    detail: "Rückpass, das Team erst sortieren lassen.",
    risk: "low",
    relevantAttributes: ["intelligenz"],
    outcomes: [{ weight: 1, headline: "Mannschaft sortiert sich", type: "neutral", text: "hat den Ball zurückgelegt und die Mannschaft sortiert sich.", effects: {} }],
  },
];

const KLAERUNG_TEMPLATES: TacticalBoardTemplate[] = [
  {
    name: "Hoher Ball in den Strafraum",
    players: [
      { x: 150, y: 345, type: "self", label: "DU" },
      { x: 150, y: 300, type: "opp", label: "9" },
      { x: 200, y: 360, type: "team" },
    ],
    optionPaths: {
      klaeren: { path: "M 150 345 L 150 300", tagPos: [130, 320] },
      kurz: { path: "M 150 345 Q 185 355 200 360", tagPos: [210, 340] },
    },
  },
  {
    name: "Rückpass unter Druck",
    players: [
      { x: 170, y: 355, type: "self", label: "DU" },
      { x: 140, y: 310, type: "opp", label: "9" },
      { x: 100, y: 370, type: "team" },
    ],
    optionPaths: {
      klaeren: { path: "M 170 355 L 170 310", tagPos: [190, 330] },
      kurz: { path: "M 170 355 Q 130 365 105 370", tagPos: [100, 345] },
    },
  },
];

const KLAERUNG_OPTIONS: TacticalOptionSpec[] = [
  {
    id: "klaeren",
    label: "Ball weit wegschlagen",
    detail: "Kein Risiko - konsequent aus der Gefahrenzone klären.",
    risk: "low",
    relevantAttributes: ["physis"],
    outcomes: [
      { weight: 1, headline: "Klar geklärt", type: "pos", text: "hat konsequent aus der Gefahrenzone geklärt.", effects: { morale: 2 } },
      { weight: 1, headline: "Klärung landet beim Gegner", type: "neg", text: "hat zu unplatziert geklärt - der Ball landet direkt wieder beim Gegner.", effects: { morale: -1 } },
    ],
  },
  {
    id: "kurz",
    label: "Kurz unter Druck abspielen",
    detail: "Riskant, aber eröffnet sofort das eigene Spiel.",
    risk: "high",
    relevantAttributes: ["technik"],
    outcomes: [
      { weight: 1, headline: "Sauber rausgespielt!", type: "pos", text: "hat den Ball unter Druck sauber rausgespielt - starker Ballgewinn zum Aufbau.", effects: { reputation: 3, morale: 5, clubRelation: 1 } },
      { weight: 1, headline: "Ball im eigenen Strafraum verloren", type: "neg", text: "hat sich unter Druck verspielt - brenzlige Situation im eigenen Strafraum.", effects: { morale: -6 } },
    ],
  },
];

export const TACTICAL_EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "taktik_board_fluegel_freigespielt",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // positionScope MID/ATT (siehe Handoff §6b) - "AV" bewusst ausgenommen: die
    // Optionen (Flanke/Cutback/Dribbling im letzten Drittel) passen inhaltlich
    // nicht zur Rolle eines Verteidigers, auch wenn Außenverteidiger gelegentlich
    // hoch aufrücken.
    condition: (p) => p.position === "ZM" || p.position === "FS" || p.position === "ST",
    build: (player, ctx) => {
      const variant = pickTacticalVariant(FLUEGEL_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Am Flügel freigespielt",
        description: `Am Rand des gegnerischen Strafraums bekommst du kurz Platz - jetzt zählt bei ${player.club.name} die richtige Entscheidung.`,
        choices: buildTacticalChoices(FLUEGEL_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "top", players: variant.players },
      };
    },
  },
  {
    id: "taktik_board_luecke_abwehrkette",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // positionScope MID/ATT (siehe Handoff §6b), analog zum Flügel-Event oben.
    condition: (p) => p.position === "ZM" || p.position === "FS" || p.position === "ST",
    build: (_player, ctx) => {
      const variant = pickTacticalVariant(LUECKE_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Lücke in der Abwehrkette",
        description: "Kurz öffnet sich eine Lücke in der gegnerischen Abwehrkette - drei Optionen bieten sich an.",
        choices: buildTacticalChoices(LUECKE_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "top", players: variant.players },
      };
    },
  },
  {
    id: "taktik_board_letzter_mann",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // Reines Abwehr-Szenario (letzter Mann vor dem eigenen Tor) - für Innen-/
    // Außenverteidiger, analog zur Positionslogik bestehender `taktik_*`-Events.
    condition: (p) => p.position === "IV" || p.position === "AV",
    build: (_player, ctx) => {
      const variant = pickTacticalVariant(LETZTER_MANN_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Konter im letzten Moment",
        description: "Als letzter Mann musst du sofort entscheiden, wie du den Konter stoppst.",
        choices: buildTacticalChoices(LETZTER_MANN_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "bottom", players: variant.players },
      };
    },
  },
  {
    id: "taktik_board_torwart_rauslaufen",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    condition: (p) => p.position === "TW",
    // Grobe Näherung an "Cup-/Europa-Cup-Spieltag" (siehe Handoff §5) - es gibt keine
    // vorausschauende Spielplan-Info zum Zeitpunkt der Saison-Event-Auswahl
    // (`pickSeasonTemplateIds` läuft VOR `simulateSeason`), daher als Proxy die
    // europäische Cup-Teilnahme der ABGESCHLOSSENEN Vorsaison. 1.5x statt der im
    // Erstentwurf vorgeschlagenen 3x (siehe Handoff-Korrektur, konservativer
    // Startwert analog zu bestehenden Gewichtungs-Entscheidungen im Projekt).
    dynamicWeight: (p) => (p.seasonHistory.at(-1)?.europeanCup ? 1.5 : 1),
    build: (_player, ctx) => {
      const variant = pickTacticalVariant(TORWART_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Rauslaufen oder Linie halten?",
        description: "Ein Konterläufer ist frei durch - sofortige Entscheidung gefragt.",
        choices: buildTacticalChoices(TORWART_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "bottom", players: variant.players },
      };
    },
  },
  // -------------------------------------------------------------------
  // Welle 2 (siehe oben)
  // -------------------------------------------------------------------
  {
    id: "taktik_board_laufweg_box",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // positionScope ATT (siehe Handoff §6b).
    condition: (p) => p.position === "FS" || p.position === "ST",
    build: (_player, ctx) => {
      const variant = pickTacticalVariant(LAUFWEG_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Laufweg in die Box",
        description: "Der Flügelspieler zieht zur Grundlinie - jetzt zählt dein Timing im Strafraum.",
        choices: buildTacticalChoices(LAUFWEG_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "top", players: variant.players },
      };
    },
  },
  {
    id: "taktik_board_doppelpass_alleingang",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // positionScope MID/ATT (siehe Handoff §6b).
    condition: (p) => p.position === "ZM" || p.position === "FS" || p.position === "ST",
    build: (_player, ctx) => {
      const variant = pickTacticalVariant(DOPPELPASS_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Enger Raum im letzten Drittel",
        description: "Im Getümmel bietet sich ein Doppelpass an - oder du gehst selbst durch.",
        choices: buildTacticalChoices(DOPPELPASS_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "top", players: variant.players },
      };
    },
  },
  {
    id: "taktik_board_kopfballduell",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // positionScope DEF (siehe Handoff §6b).
    condition: (p) => p.position === "IV" || p.position === "AV",
    build: (_player, ctx) => {
      const variant = pickTacticalVariant(KOPFBALLDUELL_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Kopfballduell im eigenen Strafraum",
        description: "Der Flankenball kommt - volles Risiko im Zweikampf oder lieber absichern?",
        choices: buildTacticalChoices(KOPFBALLDUELL_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "bottom", players: variant.players },
      };
    },
  },
  {
    id: "taktik_board_oeffnender_ball",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // positionScope MID (siehe Handoff §6b).
    condition: (p) => p.position === "ZM",
    // matchContext regular+cup (siehe Handoff §6b) - gleiche Vorsaison-Proxy-
    // Gewichtung wie beim Torwart-Event oben (siehe dortiger Kommentar).
    dynamicWeight: (p) => (p.seasonHistory.at(-1)?.europeanCup ? 1.5 : 1),
    build: (_player, ctx) => {
      const variant = pickTacticalVariant(OEFFNENDER_BALL_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Öffnender Ball ins letzte Drittel",
        description: "Aus dem Mittelfeld bietet sich ein Ball hinter die gegnerische Kette an.",
        choices: buildTacticalChoices(OEFFNENDER_BALL_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "top", players: variant.players },
      };
    },
  },
  {
    id: "taktik_board_konter_einleiten",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // positionScope DEF/MID (siehe Handoff §6b).
    condition: (p) => p.position === "IV" || p.position === "AV" || p.position === "ZM",
    build: (_player, ctx) => {
      const variant = pickTacticalVariant(KONTER_EINLEITEN_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Ballgewinn - sofort Konter oder Ordnung halten?",
        description: "Nach dem Ballgewinn bietet sich der schnelle Umschaltmoment an.",
        choices: buildTacticalChoices(KONTER_EINLEITEN_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "top", players: variant.players },
      };
    },
  },
  {
    id: "taktik_board_klaerung_unter_druck",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // positionScope DEF (siehe Handoff §6b).
    condition: (p) => p.position === "IV" || p.position === "AV",
    build: (_player, ctx) => {
      const variant = pickTacticalVariant(KLAERUNG_TEMPLATES, ctx.rng);
      return {
        category: "taktik",
        title: "Unter Druck im eigenen Strafraum",
        description: "Der Ball kommt scharf rein - lieber weit wegschlagen oder riskant kurz spielen?",
        choices: buildTacticalChoices(KLAERUNG_OPTIONS, variant),
        tactical: { displayMode: "board", goalPosition: "bottom", players: variant.players },
      };
    },
  },
];
