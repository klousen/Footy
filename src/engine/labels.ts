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
};

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
    return { headline: "Durchbruch", text: "Der mutige Schritt hat sich ausgezahlt - du hast dich durchgesetzt." };
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
    return { headline: "Durchbruch", text: "Deine Leistungen haben ein neues Niveau erreicht." };
  }
  if (state.activeThread?.stage === "STRUGGLE") {
    return { headline: "Schwierige Saison", text: "Deine Rolle war unsicherer, als du es dir erhofft hattest." };
  }
  if (state.activeThread?.stage === "REBUILD") {
    return { headline: "Zurück auf dem Platz", text: "Nach wenig Einsatzzeit hast du dir wieder eine größere Rolle erarbeitet." };
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
