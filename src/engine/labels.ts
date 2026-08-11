import type {
  AttributeKey,
  CareerNarrativeState,
  CareerPhenotype,
  NarrativeTrend,
  Player,
  RelationshipStatus,
  SeasonStats,
  TraitKey,
  TransferDecisionType,
} from "./types";
import type { Language } from "./storage";

export const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  technik: "Technik",
  tempo: "Tempo",
  physis: "Physis",
  mentalitaet: "Mentalität",
  intelligenz: "Intelligenz",
  charisma: "Charisma",
};

export const ATTRIBUTE_ORDER: AttributeKey[] = [
  "technik",
  "tempo",
  "physis",
  "mentalitaet",
  "intelligenz",
  "charisma",
];

export function formatMoney(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} Mio €`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)} Tsd €`;
  return `${Math.round(v)} €`;
}

/** Fasst eine Titel-Liste (mit Wiederholungen, z.B. dreimal "Landespokal") zu
 * "Landespokal (3x), Meisterschale" zusammen - erste Nennung bestimmt die
 * Reihenfolge, damit die Liste bei jedem Aufruf stabil bleibt statt bei jedem
 * Rendern neu zu sortieren. Einzelne Titel (nur 1x) bekommen kein "(1x)"-Suffix. */
export function formatTrophyList(trophies: string[]): string {
  if (trophies.length === 0) return "keine";
  const counts = new Map<string, number>();
  for (const t of trophies) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} (${count}x)` : name)).join(", ");
}

export const CATEGORY_LABEL: Record<string, string> = {
  training: "Training",
  lifestyle: "Alltag",
  medien: "Medien",
  sponsoring: "Sponsoring",
  transfer: "Transfer",
  vertrag: "Vertrag",
  verletzung: "Verletzung",
  taktik: "Spielgeschehen",
  nationalmannschaft: "Nationalmannschaft",
  jugend: "Jugend",
  beziehung: "Beziehung & Familie",
  meilenstein: "Meilenstein",
  leihe: "Leihjahr",
};

export const RELATIONSHIP_LABEL: Record<RelationshipStatus, string> = {
  single: "Single",
  in_beziehung: "In einer Beziehung",
  verlobt: "Verlobt",
  verheiratet: "Verheiratet",
};

export const TRAIT_LABEL: Record<TraitKey, string> = {
  arbeitsmoral: "Arbeitsmoral",
  disziplin: "Disziplin",
  medienimage: "Medienimage",
  fuehrung: "Führungsstärke",
};

export const TRAIT_ORDER: TraitKey[] = ["arbeitsmoral", "disziplin", "medienimage", "fuehrung"];

export const SQUAD_ROLE_RANK: Record<string, number> = {
  Ausbildungsspieler: 0,
  Ersatzbank: 1,
  Ergänzungsspieler: 2,
  Rotation: 3,
  Stammspieler: 4,
};

/** Anzeige-Labels für `CareerPhenotype` (siehe "CAREER NARRATIVE & DECISION IMPACT
 * SYSTEM" Teil C, `detectCareerPhenotype` in careerEngine.ts). */
export const CAREER_PHENOTYPE_LABEL: Record<CareerPhenotype, string> = {
  WONDERKIND_DELIVERED: "Eingelöstes Versprechen",
  WONDERKIND_BUST: "Verpasstes Talent",
  LATE_BLOOMER: "Spätzünder",
  STEADY_PROFESSIONAL: "Verlässlicher Profi",
  ONE_CLUB_LEGEND: "Ein-Klub-Legende",
  JOURNEYMAN: "Wandervogel",
  NATIONAL_TEAM_ICON: "Nationalmannschafts-Ikone",
  NATIONAL_TEAM_SNUB: "Übersehenes Talent",
  TROPHY_COLLECTOR: "Titelsammler",
  NEARLY_MAN: "Fast-Mann",
  INJURY_PRONE_SURVIVOR: "Kämpfer gegen Verletzungspech",
  LATE_CAREER_RESURGENCE: "Zweiter Frühling",
  BOOM_OR_BUST_MOVER: "Alles-oder-nichts-Wechsler",
  CEILING_BREAKER: "Über sich hinausgewachsen",
  HOMECOMER: "Heimkehrer",
  PRESTIGE_FIGHTER: "Der Kämpfer",
};

export const CAREER_PHENOTYPE_DESCRIPTION: Record<CareerPhenotype, string> = {
  WONDERKIND_DELIVERED: "Das Jugendtalent hat sich bestätigt - aus dem frühen Versprechen wurde echte Weltklasse.",
  WONDERKIND_BUST: "Das Talent war unübersehbar - der ganz große Durchbruch ist trotzdem ausgeblieben.",
  LATE_BLOOMER: "Ein schwacher Karrierestart, dann eine echte Leistungsexplosion in der zweiten Karrierehälfte.",
  STEADY_PROFESSIONAL: "Über die ganze Karriere hinweg solide, konstant, ohne große Ausschläge nach oben oder unten.",
  ONE_CLUB_LEGEND: "Der gesamten aktiven Laufbahn treu geblieben - ein echtes Vereins-Urgestein.",
  JOURNEYMAN: "Viele Stationen, viele Neuanfänge - eine Karriere mit ständig wechselnden Vereinen.",
  NATIONAL_TEAM_ICON: "Über Jahre hinweg fester Bestandteil der Nationalmannschaft.",
  NATIONAL_TEAM_SNUB: "Elite-Niveau erreicht - eine Berufung zur Nationalmannschaft blieb trotzdem aus.",
  TROPHY_COLLECTOR: "Eine der ganz großen Titel-Sammlungen des Fußballs.",
  NEARLY_MAN: "Elite-Niveau erreicht, aber die ganz großen Titel fehlen in der Sammlung.",
  INJURY_PRONE_SURVIVOR: "Trotz langer Verletzungsgeschichte eine bemerkenswerte Karriere hingelegt.",
  LATE_CAREER_RESURGENCE: "Ein später Vereinswechsel brachte noch einmal spürbaren Aufschwung.",
  BOOM_OR_BUST_MOVER: "Eine Karriere voller großer, riskanter Entscheidungen - mal ging es steil bergauf, mal spürbar bergab.",
  CEILING_BREAKER: "Hat die eigenen Erwartungen in einzelnen Bereichen sogar übertroffen.",
  HOMECOMER: "Ist im Laufe der Karriere zu einem prägenden früheren Verein zurückgekehrt.",
  PRESTIGE_FIGHTER: "Hat sich früh für einen großen Verein und das Risiko entschieden - und sich nach einer harten Durststrecke zurückgekämpft.",
};

/** Dynamische, aus ECHTEN Karrieredaten gebaute Begründung für den finalen
 * Phänotyp am Karriereende (siehe Folgevorgabe "Transferentscheidungen:
 * sichtbare Prognose + Narrative Integration" Abschnitt 9/10: "Die
 * Begründung muss aus realen gespeicherten Karriereereignissen entstehen -
 * keine generischen Texte, die unabhängig von der tatsächlichen Karriere
 * erscheinen"). Für Phänotypen mit klar verfügbaren, aussagekräftigen Zahlen
 * (Heimkehr-Details, Vereinswechsel-Anzahl, Titelzahl, Länderspiele,
 * Verletzungswochen, Boom-/Bust-Ausschläge, Peak-OVR, Ceiling Break) wird
 * eine konkrete, individuelle Formulierung gebaut; für die übrigen bleibt
 * die kompakte statische Beschreibung (`CAREER_PHENOTYPE_DESCRIPTION`) als
 * bewährter Fallback bestehen - kein Zwang, für jeden der 15 Phänotypen eine
 * eigene Datenkomposition zu erfinden (Vorgabe Abschnitt 10: "keine neue
 * komplexe Architektur"). */
export function describeCareerPhenotype(
  phenotype: CareerPhenotype,
  player: Player,
  narrative: CareerNarrativeState
): string {
  switch (phenotype) {
    case "HOMECOMER": {
      const h = player.homecomings[player.homecomings.length - 1];
      if (!h) break;
      return `Nach ${h.yearsAway} ${h.yearsAway === 1 ? "Jahr" : "Jahren"} bei anderen Vereinen kehrtest du zu ${
        h.clubName
      } zurück - dort, wo du zwischen ${h.firstSpellStartAge} und ${h.firstSpellEndAge} bereits ${h.firstSpellSeasons} prägende ${
        h.firstSpellSeasons === 1 ? "Saison" : "Saisons"
      } verbracht hattest.`;
    }
    case "JOURNEYMAN":
      return `${player.clubChangesCount} Vereinswechsel prägten deine Laufbahn - kaum ein Umfeld, in dem du lange geblieben bist.`;
    case "ONE_CLUB_LEGEND":
      return `${player.seasonHistory.length} Saisons lang bist du ${player.club.name} treu geblieben, ohne je den Verein zu wechseln.`;
    case "TROPHY_COLLECTOR":
      return `${player.careerTotals.trophies.length} Titel zieren deine Vitrine - eine der großen Titel-Sammlungen des Fußballs.`;
    case "NATIONAL_TEAM_ICON":
      return `${player.nationalTeamCaps} Länderspiele${
        player.nationalTeamGoals > 0 ? ` und ${player.nationalTeamGoals} Tore für die Nationalmannschaft` : ""
      } - über Jahre fester Bestandteil des Nationalteams.`;
    case "INJURY_PRONE_SURVIVOR":
      return `Trotz ${player.totalInjuryWeeks} Wochen Verletzungspause über die Karriere hinweg hast du dich immer wieder zurückgekämpft.`;
    case "BOOM_OR_BUST_MOVER": {
      const boomCount = narrative.decisionImpacts.filter((d) => d.perfImpact !== null && d.perfImpact > 15).length;
      const bustCount = narrative.decisionImpacts.filter((d) => d.perfImpact !== null && d.perfImpact < -15).length;
      if (boomCount + bustCount === 0) break;
      return `${boomCount + bustCount} große, riskante Wechsel-Entscheidungen prägten deine Karriere - ${boomCount} davon zahlten sich spürbar aus, ${bustCount} kosteten dich wichtige Zeit.`;
    }
    case "WONDERKIND_DELIVERED":
      return `Als frühes Ausnahmetalent gehandelt, erreichtest du eine Spitzenstärke von ${narrative.peakOverall} - das Versprechen wurde eingelöst.`;
    case "WONDERKIND_BUST":
      return `Als frühes Ausnahmetalent gehandelt, blieb deine Karriere bei einer Spitzenstärke von ${narrative.peakOverall} unter den einstigen Erwartungen.`;
    case "CEILING_BREAKER": {
      const c = narrative.ceilingBreaks[narrative.ceilingBreaks.length - 1];
      if (!c) break;
      return `Mit ${c.age} Jahren bist du über das erwartete Limit bei ${ATTRIBUTE_LABEL[c.attribute]} hinausgewachsen - mehr, als das Talent allein vorgab.`;
    }
    default:
      break;
  }
  return CAREER_PHENOTYPE_DESCRIPTION[phenotype];
}

/** Anzeige-Labels für `TransferDecisionType` (siehe `classifyTransferDecision` in
 * careerEngine.ts). */
export const TRANSFER_DECISION_LABEL: Record<TransferDecisionType, string> = {
  UPWARD_MOVE: "Aufstiegswechsel",
  LATERAL_MOVE: "Seitlicher Wechsel",
  DOWNWARD_MOVE: "Schritt zurück",
  PLAYING_TIME_MOVE: "Wechsel für Spielzeit",
  PRESTIGE_RISK_MOVE: "Prestige-Risiko",
  FINANCIAL_MOVE: "Finanziell motivierter Wechsel",
  STABILITY_DECISION: "Verbleib",
};

/**
 * FUT-artige Einordnung der Gesamtstärke (1-99) in klar erkennbare Stufen mit
 * eigener Farbgebung - macht Fortschritt auf einen Blick sichtbar, nicht nur
 * als nackte Zahl.
 */
export interface OverallTier {
  label: string;
  className: string;
}

export function overallTier(overall: number): OverallTier {
  if (overall >= 90) return { label: "Ikone", className: "icon" };
  if (overall >= 80) return { label: "Weltklasse", className: "elite" };
  if (overall >= 70) return { label: "Star", className: "gold" };
  if (overall >= 60) return { label: "Solide", className: "silver" };
  if (overall >= 50) return { label: "Ausbaufähig", className: "bronze" };
  return { label: "Amateur", className: "amateur" };
}

// -----------------------------------------------------------------------------
// Narrative-Texte in natürlicher Sprache (siehe "CAREER NARRATIVE, DECISION
// IMPACT, NATIONAL TEAM & UI INTEGRATION" Abschnitt 8: WÄHREND der Karriere
// NIEMALS interne Phänotyp-/Zustands-Labels zeigen, nur natürliche Sprache - die
// finale Klassifikation (`CAREER_PHENOTYPE_LABEL`) bleibt CareerEnd vorbehalten.
// -----------------------------------------------------------------------------

export interface NarrativeMomentumText {
  headline: string;
  text: string;
}

/** Kurzes, natürlichsprachliches Etikett für einen `NarrativeTrend`-Wert (siehe
 * Bugreport "Performance: 52 → 61 → 66 → 63 ... Das ist intransparent" - die
 * Saison-Verlaufszeilen zeigten bisher NUR die rohen Zahlen ohne Einordnung, ob
 * das nun gut oder schlecht ist. Nutzt bewusst dieselbe Klassifikation
 * (`computeCareerNarrativeState`/`trendFrom`), die auch die Dashboard-/Saison-
 * Erzähltexte antreibt, statt eine zweite, abweichende Bewertung einzuführen. */
export const TREND_LABEL: Record<NarrativeTrend, string> = {
  rising: "▲ steigend",
  falling: "▼ fallend",
  stable: "→ stabil",
};

/**
 * Dashboard-Baustein "Karriereverlauf" (siehe Vorgabe Abschnitt 9+10, hier bewusst
 * zu EINEM Panel zusammengefasst statt zwei separaten - der laufende Thread deckt
 * inhaltlich bereits ab, was Abschnitt 10 als "zuletzt entscheidend" wollte, zwei
 * getrennte Blöcke hätten sich in der Praxis meist wiederholt). `null`, wenn es
 * gerade nichts Erzählenswertes gibt (Vorgabe: "nicht jede Saison zwanghaft einen
 * neuen Zustand erzeugen").
 */
export function describeCareerMomentum(state: CareerNarrativeState, player: Player): NarrativeMomentumText | null {
  const thread = state.activeThread;
  if (thread) {
    // Heimkehr-Varianten (siehe ADD-ON-Vorgabe "Heimkehrer" Abschnitt 21/22 +
    // Nutzerentscheidung "eigene Heimkehr-Texte ergänzen"): derselbe ADAPTATION-
    // /STRUGGLE-/REBUILD-Thread wie bei jedem großen Wechsel, aber tonal passend -
    // eine Rückkehr zu vertrautem Umfeld liest sich nicht wie ein Sprung ins
    // Ungewisse.
    if (thread.isHomecoming) {
      if (thread.stage === "ADAPTATION") {
        return {
          headline: "Zurück in vertrauter Umgebung",
          text: "Die Heimkehr zu einem Verein aus früheren Jahren ist geschafft. Deine Rolle dort ist zunächst noch offen.",
        };
      }
      if (thread.stage === "STRUGGLE") {
        return {
          headline: "Die Heimkehr fällt schwerer als gedacht",
          text: "Trotz der vertrauten Umgebung liegen Einsatzzeit und Leistung aktuell unter deinem Niveau.",
        };
      }
      if (thread.stage === "REBUILD") {
        return {
          headline: "Der Heimvorteil zahlt sich langsam aus",
          text: "Nach einer schwierigen Anfangsphase findest du bei deinem früheren Verein wieder Tritt.",
        };
      }
    }
    if (thread.stage === "ADAPTATION") {
      return {
        headline: "Der große Schritt",
        text: "Du hast dich für einen deutlich stärkeren Verein entschieden. Deine Rolle dort ist zunächst offen.",
      };
    }
    if (thread.stage === "STRUGGLE") {
      return {
        headline: "Schwierige Phase",
        text: "Deine Einsatzzeit und Leistungen liegen aktuell unter deinem bisherigen Niveau.",
      };
    }
    if (thread.stage === "REBUILD") {
      return {
        headline: "Zurück in die Spur",
        text: "Du kämpfst dich nach einer schwierigen Phase spürbar zurück.",
      };
    }
  }

  const lastHistory = player.narrativeHistory[player.narrativeHistory.length - 1];
  if (lastHistory?.type === "BIG_MOVE_BREAKTHROUGH" && player.seasonHistory.length - lastHistory.season <= 1) {
    return lastHistory.label.includes("Heimkehr")
      ? { headline: "Die Heimkehr hat sich ausgezahlt", text: "Die Rückkehr zu vertrautem Umfeld hat sich gelohnt - du hast dich durchgesetzt." }
      : { headline: "Durchbruch", text: "Der mutige Schritt hat sich ausgezahlt - du hast dich durchgesetzt." };
  }
  // Symmetrisches Gegenstück (siehe `advanceNarrativeThread`, "BIG_MOVE_STALLED") -
  // kein erzwungenes Happy End, aber auch der ausgebliebene Durchbruch verdient
  // eine kurze, ehrliche Einordnung, statt kommentarlos zu verschwinden.
  if (lastHistory?.type === "BIG_MOVE_STALLED" && player.seasonHistory.length - lastHistory.season <= 1) {
    return lastHistory.label.includes("Heimkehr")
      ? { headline: "Die Heimkehr blieb eine Randnotiz", text: "Der erhoffte zweite Frühling an alter Wirkungsstätte ist bislang ausgeblieben." }
      : { headline: "Kein Durchbruch", text: "Der mutige Schritt hat sich bislang nicht ausgezahlt wie erhofft." };
  }

  // Frisch erkannte Heimkehr OHNE (mehr) aktiven Thread - z.B. weil der Thread
  // schon neutral ausgelaufen ist, die Rückkehr aber noch die jüngste prägende
  // Station war. Nutzerentscheidung: auch live im Dashboard zeigen, nicht nur am
  // Karriereende.
  if (state.homecoming) {
    const lastHomecomingSeason = player.transferDecisions.filter((d) => d.isHomecoming).at(-1)?.season;
    if (lastHomecomingSeason !== undefined && player.seasonHistory.length - lastHomecomingSeason <= 1) {
      return {
        headline: "Wieder daheim",
        text: `Nach ${state.homecoming.yearsAway} Jahren bist du zu ${state.homecoming.clubName} zurückgekehrt - vertrautes Terrain, neue Rolle.`,
      };
    }
  }

  // ROOKIE TRANSITION (18-20, siehe Feature-Vorgabe "ROOKIE TRANSITION 17 → 18"):
  // eigene, altersspezifische Dashboard-Texte für die ersten Profijahre - 18 ist
  // ein reiner Meilenstein-Hinweis (immer gezeigt, wertfrei), 19/20 nur bei
  // tatsächlich dazu passenden Daten (Einsatzzeit), sonst übernimmt das generische
  // Trend-System unten. KEIN automatisches "Durchbruch" allein aufgrund des
  // Alters (Vorgabe Abschnitt 8/9) - deshalb hier ausschließlich auf echte
  // `seasonHistory`-Werte gestützt, nie nur auf `player.age`.
  const lastSeason = player.seasonHistory[player.seasonHistory.length - 1];
  if (lastSeason && lastSeason.age >= 18 && lastSeason.age <= 20) {
    const playTimeRatio = lastSeason.possibleMinutes > 0 ? lastSeason.minutesPlayed / lastSeason.possibleMinutes : 0;
    if (lastSeason.age === 18) {
      return playTimeRatio >= 0.35
        ? { headline: "Dein erster Schritt in den Profifußball", text: "Deine erste Saison im Profikader liegt hinter dir - und direkt mit spürbarer Einsatzzeit." }
        : { headline: "Dein erster Schritt in den Profifußball", text: "Deine erste Saison im Profikader liegt hinter dir - die große Rolle war es noch nicht, aber der Anfang ist gemacht." };
    }
    if (playTimeRatio >= 0.45 && state.performanceTrend !== "falling") {
      return { headline: "Aus dem Nachwuchsspieler wird ein Profi", text: "Du beginnst, dich im Profikader festzusetzen." };
    }
    if (playTimeRatio < 0.25) {
      return { headline: "Der Sprung fällt dir schwer", text: "Der Sprung in den Profifußball fällt dir bislang schwer - noch fehlt dir die regelmäßige Spielpraxis." };
    }
    // Mittleres Feld ohne klare Tendenz: kein erzwungener Text, das generische
    // Trend-System unten übernimmt (siehe Vorgabe: "nicht jede Saison zwanghaft").
  }

  // Muster über mehrere Transferentscheidungen hinweg (siehe Folgevorgabe
  // "Transferentscheidungen: sichtbare Prognose + Narrative Integration"
  // Abschnitt 4/5: "Der Spieler soll nicht mit 22 bereits gesagt bekommen: Du
  // bist ein Journeyman" - deshalb bewusst nur ein knapper, VORLÄUFIGER Hinweis
  // aus den letzten 3 Entscheidungen, KEIN Zustand/State, keine Wertung. Der
  // finale Phänotyp bleibt CareerEnd vorbehalten (siehe Datei-Kommentar oben).
  const recentDecisions = player.transferDecisions.slice(-3);
  const recentAmbitious = recentDecisions.filter((d) => d.type === "UPWARD_MOVE" || d.type === "PRESTIGE_RISK_MOVE").length;
  const recentPlayingTime = recentDecisions.filter((d) => d.type === "PLAYING_TIME_MOVE").length;
  if (recentAmbitious >= 2) {
    return { headline: "Ambitionierter Weg", text: "Deine letzten Wechsel waren ungewöhnlich ambitioniert - du suchst konsequent den nächsten großen Schritt." };
  }
  if (recentPlayingTime >= 2) {
    return { headline: "Fokus auf Spielzeit", text: "Du hast dich in den letzten Jahren mehrfach bewusst für Einsatzzeit statt Prestige entschieden." };
  }

  const perfRising = state.performanceTrend === "rising";
  const perfFalling = state.performanceTrend === "falling" || state.playingTimeTrend === "falling";
  if (perfRising) {
    return player.age >= 27
      ? { headline: "Späte Entwicklung", text: "Deine Entwicklung nimmt gerade noch einmal Fahrt auf." }
      : { headline: "Aufwärtstrend", text: "Deine Leistungen entwickeln sich zuletzt deutlich nach oben." };
  }
  if (perfFalling) {
    return {
      headline: "Schwierige Phase",
      text: "Deine Einsatzzeit und Leistungen liegen aktuell unter deinem bisherigen Niveau.",
    };
  }
  if (player.seasonHistory.length >= 4 && state.performanceTrend === "stable" && state.playingTimeTrend === "stable") {
    return { headline: "Etabliert", text: "Du hast dir auf deinem aktuellen Niveau eine stabile Rolle erarbeitet." };
  }
  return null;
}

/** Unmittelbares "Was das bedeutet"-Feedback direkt nach einer Vereinsangebots-
 * Entscheidung (siehe Vorgabe Abschnitt 12) - bewusst NUR qualitativ, keine
 * pseudowissenschaftlichen Zahlenaussagen (der tatsächliche Ausgang ist zu diesem
 * Zeitpunkt noch nicht bekannt). */
export const TRANSFER_DECISION_MEANING: Record<TransferDecisionType, string> = {
  UPWARD_MOVE: "Ein großer Schritt: ein deutlich stärkerer Verein - deine Rolle dort ist zunächst nicht garantiert.",
  PRESTIGE_RISK_MOVE: "Die große Bühne lockt - aber das Risiko, zunächst nur Reservist zu sein, ist real.",
  DOWNWARD_MOVE: "Ein Schritt zurück auf dem Papier - dafür bessere Aussichten auf eine tragende Rolle.",
  PLAYING_TIME_MOVE: "Der Fokus liegt klar auf mehr Einsatzzeit, weniger auf Prestige.",
  LATERAL_MOVE: "Ein Wechsel auf ähnlichem Niveau - neue Umgebung, ähnliche Ausgangslage.",
  FINANCIAL_MOVE: "Vor allem finanziell ein klarer Schritt nach vorn.",
  STABILITY_DECISION: "Kontinuität statt Risiko - du bleibst deinem Umfeld treu.",
};

/** SeasonSummary-Baustein "Deine Saison" (siehe Vorgabe Abschnitt 13) - `null`, wenn
 * die Saison keinen erzählenswerten Ausschlag zeigt (bleibt dann bei der schon
 * vorhandenen Score-Tier-Anzeige). */
export function describeSeasonNarrative(stats: SeasonStats, state: CareerNarrativeState, player: Player): NarrativeMomentumText | null {
  const lastHistory = player.narrativeHistory[player.narrativeHistory.length - 1];
  if (lastHistory && lastHistory.season === player.seasonHistory.length - 1 && lastHistory.type === "BIG_MOVE_BREAKTHROUGH") {
    return lastHistory.label.includes("Heimkehr")
      ? { headline: "Die Heimkehr hat sich ausgezahlt", text: "Deine Rückkehr zu vertrautem Umfeld trägt spürbar Früchte." }
      : { headline: "Durchbruch", text: "Deine Leistungen haben ein neues Niveau erreicht." };
  }
  // Symmetrisches Gegenstück (siehe `advanceNarrativeThread`, "BIG_MOVE_STALLED").
  if (lastHistory && lastHistory.season === player.seasonHistory.length - 1 && lastHistory.type === "BIG_MOVE_STALLED") {
    return lastHistory.label.includes("Heimkehr")
      ? { headline: "Die Heimkehr blieb eine Randnotiz", text: "Der erhoffte zweite Frühling an alter Wirkungsstätte ist bislang ausgeblieben." }
      : { headline: "Kein Durchbruch", text: "Der mutige Schritt hat sich bislang nicht ausgezahlt wie erhofft." };
  }
  if (state.activeThread?.isHomecoming && state.activeThread.stage === "STRUGGLE") {
    return { headline: "Schwierige Heimkehr-Saison", text: "Trotz der vertrauten Umgebung war deine Rolle unsicherer, als du es dir erhofft hattest." };
  }
  if (state.activeThread?.isHomecoming && state.activeThread.stage === "REBUILD") {
    return { headline: "Zurück auf dem Platz", text: "Nach wenig Einsatzzeit hast du dir bei deinem früheren Verein wieder eine größere Rolle erarbeitet." };
  }
  if (state.activeThread?.stage === "STRUGGLE") {
    return { headline: "Schwierige Saison", text: "Deine Rolle war unsicherer, als du es dir erhofft hattest." };
  }
  if (state.activeThread?.stage === "REBUILD") {
    return { headline: "Zurück auf dem Platz", text: "Nach wenig Einsatzzeit hast du dir wieder eine größere Rolle erarbeitet." };
  }
  // Direkt in der Saison der Heimkehr selbst (noch kein Thread-Stage-Wechsel
  // nötig) - Nutzerentscheidung: auch live im Saisonrückblick zeigen.
  if (player.transferDecisions.at(-1)?.isHomecoming && player.transferDecisions.at(-1)?.season === player.seasonHistory.length) {
    return { headline: "Wieder daheim", text: "Die Rückkehr zu einem Verein aus früheren Jahren ist geschafft." };
  }
  // ROOKIE TRANSITION (18-20, siehe Feature-Vorgabe "ROOKIE TRANSITION 17 → 18"):
  // eigene Saisonrückblick-Texte für die ersten Profijahre, dieselbe Logik wie in
  // `describeCareerMomentum` (18 = wertfreier Meilenstein, 19/20 nur bei
  // tatsächlich dazu passender Einsatzzeit - kein automatisches "Durchbruch"
  // allein aufgrund des Alters).
  if (stats.age >= 18 && stats.age <= 20) {
    const playTimeRatio = stats.possibleMinutes > 0 ? stats.minutesPlayed / stats.possibleMinutes : 0;
    if (stats.age === 18) {
      return playTimeRatio >= 0.35
        ? { headline: "Dein erster Schritt in den Profifußball", text: "Deine erste Saison im Profikader - und direkt mit spürbarer Einsatzzeit." }
        : { headline: "Dein erster Schritt in den Profifußball", text: "Deine erste Saison im Profikader liegt hinter dir - die große Rolle war es noch nicht, aber der Anfang ist gemacht." };
    }
    if (playTimeRatio >= 0.45 && state.performanceTrend !== "falling") {
      return { headline: "Du setzt dich durch", text: "Du beginnst, dich im Profikader festzusetzen." };
    }
    if (playTimeRatio < 0.25) {
      return { headline: "Der Sprung fällt dir schwer", text: "Der Sprung in den Profifußball fällt dir bislang schwer - noch fehlt dir die regelmäßige Spielpraxis." };
    }
    // Mittleres Feld: kein erzwungener Text, generisches System unten übernimmt.
  }
  // WICHTIG: `performanceScore` (siehe careerEngine.ts `simulateSeason`) ist bereits
  // eine eigenständige, um 50 zentrierte Skala (avgRating + productionFactor,
  // bewusst UNABHÄNGIG vom OVR normalisiert - siehe dortiger Kommentar: ein 45er-
  // und ein 90er-Spieler erreichen bei gleich guter Leistung denselben Wert). Ein
  // Vergleich `performanceScore - overallRating` (frühere Version) war daher
  // strukturell irreführend: praktisch JEDER junge/niedrig bewertete Spieler mit
  // einer nur durchschnittlichen Saison hätte hier fälschlich "übertroffen"
  // gemeldet, weil `performanceScore` fast immer deutlich über einem niedrigen OVR
  // liegt. Richtig ist der Vergleich GEGEN DIE EIGENE 50er-Neutrallinie der Skala.
  if (stats.performanceScore >= 72 && state.performanceTrend !== "falling") {
    return { headline: "Mehr als erwartet", text: "Deine Leistungen lagen deutlich über dem Ligadurchschnitt für deine Rolle." };
  }
  if (state.performanceTrend === "rising" && player.age >= 27) {
    return { headline: "Späte Entwicklung", text: "Deine Entwicklung hat zuletzt noch einmal deutlich an Fahrt gewonnen." };
  }
  return null;
}

/** "★ Wendepunkt"-Hinweis (siehe Vorgabe Abschnitt 15) - nur, wenn `Player.narrativeHistory`
 * GENAU DIESE Saison einen Eintrag bekommen hat (max. ein Wendepunkt pro Saison). */
export function turningPointForSeason(player: Player): string | null {
  const lastHistory = player.narrativeHistory[player.narrativeHistory.length - 1];
  if (!lastHistory || lastHistory.season !== player.seasonHistory.length - 1) return null;
  return lastHistory.label;
}

// -----------------------------------------------------------------------------
// i18n (Titelmenü) - siehe Handoff "Titelmenü, Spielstand-Slots & Bestenliste-
// Gating" Abschnitt 5: fürs Erste nur das Titelmenü selbst zweisprachig, Rest der
// App bleibt vorerst Deutsch. `{de, en}`-Paare statt reiner Strings, damit sich
// das Muster später ohne Refactor auf die gesamte App ausweiten lässt.
// -----------------------------------------------------------------------------
export const TITLE_I18N = {
  tagline: { de: "Deine Karriere. Dein Weg.", en: "Your career. Your way." },
  yearsAbbr: { de: "J.", en: "y." },
  continueCareer: { de: "Karriere fortsetzen", en: "Continue career" },
  newCareer: { de: "Neue Karriere starten", en: "Start new career" },
  viewLeaderboard: { de: "Bestenliste ansehen", en: "View leaderboard" },
  rankingTitle: { de: "Bestenliste", en: "Leaderboard" },
  rankingTitleAccent: { de: "Top Karrieren", en: "Top Careers" },
  rankingLink: { de: "ALLE ANZEIGEN →", en: "VIEW ALL →" },
  lockTitle: { de: "Bestenliste ist Karriere-Pass", en: "Leaderboard is Career Pass" },
  lockSub: {
    de: "Deine Karrieren werden schon gezählt. Schalte die Ansicht mit dem Karriere-Pass frei.",
    en: "Your careers are already being counted. Unlock the view with the Career Pass.",
  },
  lockCta: { de: "KARRIERE-PASS ANSEHEN", en: "VIEW CAREER PASS" },
  slotEyebrow: { de: "Karriere wählen", en: "Choose career" },
  slotTitle: { de: "Deine Karrieren", en: "Your careers" },
  newCareerSlot: { de: "Neue Karriere", en: "New career" },
  emptySlotLabel: { de: "Slot", en: "Slot" },
  passBadge: { de: "KARRIERE-PASS", en: "CAREER PASS" },
  passBannerTitle: { de: "3 Spielstände", en: "3 save slots" },
  passBannerText: {
    de: "Mit dem Karriere-Pass mehrere Karrieren parat haben und jederzeit zwischen ihnen wechseln.",
    en: "With the Career Pass, keep several careers ready and switch between them any time.",
  },
  passBannerBtn: { de: "UPGRADEN", en: "UPGRADE" },
  backToTitle: { de: "← Zurück", en: "← Back" },
  overwriteTitle: { de: "Karriere ersetzen?", en: "Replace career?" },
  overwriteText: {
    de: "Deine aktuelle Karriere als {name} wird beendet und ersetzt. Fortfahren?",
    en: "Your current career as {name} will end and be replaced. Continue?",
  },
  overwriteConfirm: { de: "Fortfahren", en: "Continue" },
  overwriteCancel: { de: "Abbrechen", en: "Cancel" },
  paywallPlaceholder: {
    de: "Der Karriere-Pass ist noch nicht verfügbar - bald mehr!",
    en: "The Career Pass isn't available yet - more soon!",
  },
  leaderboardEmpty: { de: "Noch keine abgeschlossene Karriere.", en: "No completed career yet." },
  legacyLabel: { de: "Legacy", en: "Legacy" },
} satisfies Record<string, Record<Language, string>>;

export type TitleI18nKey = keyof typeof TITLE_I18N;

export function t(key: TitleI18nKey, lang: Language): string {
  return TITLE_I18N[key][lang];
}
