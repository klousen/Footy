import type { GameState, RankingEntry } from "./types";

// ============================================================================
// Spielstand-Slots (siehe Handoff "Titelmenü, Spielstand-Slots & Bestenliste-
// Gating"): statt eines einzelnen Saves können bis zu drei parallele Karrieren
// existieren. Free-User sind auf `FREE_SLOT_LIMIT` Slot(s) begrenzt, mit
// Karriere-Pass stehen bis zu `MAX_SLOTS` zur Verfügung (siehe `slotLimit()`).
// ============================================================================

const LEGACY_STORAGE_KEY = "footy-career-save-v1";
const SAVE_CONTAINER_KEY = "footy-save-container-v1";
const CAREER_PASS_KEY = "footy-career-pass-v1";
const RANKING_ARCHIVE_KEY = "footy-ranking-archive-v1";
const LANGUAGE_KEY = "footy-language-v1";

export const MAX_SLOTS = 3;
export const FREE_SLOT_LIMIT = 1;

export interface SaveSlot {
  id: string; // "slot-1" | "slot-2" | "slot-3"
  /**
   * Bewusste Abweichung vom Handoff-Sketch (der nur `{player, leagueState}`
   * vorsah): hier wird der KOMPLETTE `GameState` pro Slot gespeichert, damit
   * die bestehende "Fortsetzen genau an der Stelle, wo man aufgehört hat"-UX
   * (inkl. offenem Event/Feedback/Saisonbilanz) pro Slot erhalten bleibt statt
   * beim Slot-Wechsel verloren zu gehen.
   */
  state: GameState;
  lastPlayedAt: string; // ISO-Timestamp
}

interface SaveContainer {
  slots: SaveSlot[];
  activeSlotId: string | null;
}

export type Language = "de" | "en";

function readRaw<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher voll oder nicht verfügbar - stillschweigend ignorieren
  }
}

/** Absicherung gegen ältere Spielstände ohne neuere Felder - dieselbe Defaulting-
 * Logik wie zuvor in `loadGame`, jetzt beim Lesen JEDES Slots angewandt (nicht nur
 * einmalig bei der Migration), damit auch künftige neue `Player`-Felder automatisch
 * für alle bestehenden Slots nachgezogen werden. */
function normalizeGameState(state: GameState): GameState {
  if (state.player) {
    state.player.activeStorylines ??= [];
    state.player.completedStorylines ??= [];
    state.player.trainingBoostSeasons ??= 0;
    state.player.unlockedAchievementIds ??= [];
    state.player.growthCarry ??= {};
    state.player.nationalTeamGoals ??= 0;
    state.player.startingRoleGuaranteeSeasons ??= 0;
    // Ältere Spielstände kennen das garantierte Kaderrollen-Reaktions-Event noch
    // nicht (siehe `Player.roleChallengePending`) - `null` als neutrale Annäherung,
    // kein rückwirkendes Nacherfinden einer vergangenen Degradierung.
    state.player.roleChallengePending ??= null;
    state.player.cupExitThisSeason ??= false;
    // Ältere Spielstände kennen `playedAbroad` noch nicht - da wir nicht mehr
    // rekonstruieren können, ob je ins Ausland gewechselt wurde, im Zweifel als
    // "bereits im Ausland gespielt" annehmen (kein rückwirkendes "Ligalegende" für
    // Spielstände, die dieses Flag nie hätten aufbauen können).
    state.player.playedAbroad ??= true;
    state.player.loanActive ??= false;
    state.player.loanReturnClub ??= null;
    state.player.loanReturnCountryId ??= null;
    state.player.loanNarrative ??= null;
    state.player.definingMoment ??= null;
    state.player.edeljokerLocked ??= false;
    state.player.formSlumpSeasons ??= 0;
    // Ältere Spielstände kennen die Entwicklungstrajektorie noch nicht (siehe
    // `Player.developmentTrajectory`) - 1.0 (neutral) als bestmögliche Annäherung,
    // damit ein bereits laufender Spielstand nicht rückwirkend zum Bust/Wunderkind wird.
    state.player.developmentTrajectory ??= 1.0;
    // Ältere Spielstände kennen die Produktions-Zuverlässigkeit noch nicht (siehe
    // `Player.productionReliability`) - 1.0 (neutral) als bestmögliche Annäherung.
    state.player.productionReliability ??= 1.0;
    // Ältere Spielstände kennen das Transferentscheidungs-Protokoll noch nicht
    // (siehe `Player.transferDecisions`) - leer als bestmögliche Annäherung, kein
    // rückwirkendes Nacherfinden vergangener Entscheidungen möglich.
    state.player.transferDecisions ??= [];
    // Ältere Spielstände kennen das Runtime-Narrative-System noch nicht (siehe
    // "CAREER NARRATIVE ... TECHNISCHE VERANKERUNG") - neutrale/leere Startwerte,
    // kein rückwirkendes Nacherfinden vergangener Ceiling Breaks/Threads.
    state.player.ceilingBreaks ??= [];
    state.player.nationalTeamCandidacySeasons ??= 0;
    state.player.activeNarrativeThread ??= null;
    state.player.narrativeHistory ??= [];
    // Ältere Spielstände kennen das "Heimkehrer"-Feature noch nicht (siehe
    // `Player.recentTransferWasForeignHomecoming`) - `false` als neutrale
    // Annäherung, kein rückwirkendes Nacherfinden des letzten Wechsels.
    state.player.recentTransferWasForeignHomecoming ??= false;
    // Ältere Spielstände kennen das strukturierte Heimkehrer-Protokoll noch nicht
    // (siehe `Player.homecomings`/`pastClubOfferCooldowns`) - leer als
    // bestmögliche Annäherung, kein rückwirkendes Nacherfinden vergangener
    // Heimkehren (der "HOMECOMER"-Phänotyp bleibt für diese Karrieren dadurch
    // unerreicht, aber keine erfundenen Daten).
    state.player.homecomings ??= [];
    state.player.pastClubOfferCooldowns ??= {};
    // Ältere Spielstände kennen das Heimatland noch nicht - als bestmögliche
    // Annäherung das aktuelle Land nehmen (nur relevant für künftige Rückkehr-Erkennung).
    state.player.homeCountryId ??= state.player.country;
    // Bei älteren Spielständen als Basis den aktuellen Stand nehmen, damit nicht
    // plötzlich alle bisherigen Länderspiele als "diese Saison" gewertet werden.
    state.player.capsAtSeasonStart ??= state.player.nationalTeamCaps ?? 0;
    // Ältere Saison-Historien haben noch keine Minuten-/Länderspiel-Felder je Saison.
    if (state.player.seasonHistory) {
      state.player.seasonHistory = state.player.seasonHistory.map((s) => ({
        ...s,
        minutesPlayed: s.minutesPlayed ?? 0,
        possibleMinutes: s.possibleMinutes ?? 0,
        capsThisSeason: s.capsThisSeason ?? 0,
        performanceScore: s.performanceScore ?? s.avgRating * 10,
        // Ältere Saison-Historien kennen `clubId` noch nicht (siehe
        // `detectClubHomecoming` in types.ts) - leerer String statt eines
        // erfundenen Werts, matcht dadurch nie versehentlich einen echten
        // Verein (kein rückwirkendes "Heimkehrer"-Erkennen für alte Saisons).
        clubId: s.clubId ?? "",
        // Ältere Saison-Historien kennen `clubStrength` noch nicht - `overallRating`
        // als grobe, aber plausible Näherung (beide liegen auf einer ähnlichen 0-99-
        // Skala), nur relevant für die "damals/heute"-Vereinsstärke im Heimkehr-Text.
        clubStrength: s.clubStrength ?? s.overallRating,
      }));
    }
  }
  state.foreignLeagues ??= {};
  state.europeanLeagueDrift ??= {};
  return state;
}

/** Beim ersten Laden nach dem Update: alten Einzel-Save-Key in `slot-1` überführen.
 * Einmalig, idempotent - ein bereits existierender Container wird nie erneut migriert. */
function loadContainer(): SaveContainer {
  const existing = readRaw<SaveContainer>(SAVE_CONTAINER_KEY);
  if (existing) return existing;
  const legacy = readRaw<GameState>(LEGACY_STORAGE_KEY);
  const container: SaveContainer = legacy
    ? { slots: [{ id: "slot-1", state: legacy, lastPlayedAt: new Date().toISOString() }], activeSlotId: "slot-1" }
    : { slots: [], activeSlotId: null };
  writeRaw(SAVE_CONTAINER_KEY, container);
  if (legacy) {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignorieren
    }
  }
  return container;
}

/** Alle belegten Slots, sortiert nach zuletzt gespielt (neuester zuerst). */
export function listSlots(): SaveSlot[] {
  return [...loadContainer().slots]
    .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt))
    .map((s) => ({ ...s, state: normalizeGameState(s.state) }));
}

export function getActiveSlotId(): string | null {
  return loadContainer().activeSlotId;
}

/** Ob überhaupt irgendein Spielstand existiert - steuert z.B. Sichtbarkeit von
 * Save-Chip/"Fortsetzen"-Button im Titelmenü. */
export function hasSave(): boolean {
  return loadContainer().slots.length > 0;
}

/** Der zuletzt aktive Slot (für "Karriere fortsetzen" direkt vom Titelmenü aus) -
 * fällt auf den zuletzt gespielten Slot zurück, falls `activeSlotId` (z.B. nach
 * einem gelöschten Slot) ins Leere zeigt. */
export function getMostRecentSlot(): SaveSlot | null {
  const container = loadContainer();
  const byId = container.activeSlotId ? container.slots.find((s) => s.id === container.activeSlotId) : null;
  const slot = byId ?? listSlots()[0] ?? null;
  return slot ? { ...slot, state: normalizeGameState(slot.state) } : null;
}

export function loadSlot(slotId: string): GameState | null {
  const slot = loadContainer().slots.find((s) => s.id === slotId);
  return slot ? normalizeGameState(slot.state) : null;
}

export function saveSlot(slotId: string, state: GameState): void {
  const container = loadContainer();
  const now = new Date().toISOString();
  const idx = container.slots.findIndex((s) => s.id === slotId);
  const entry: SaveSlot = { id: slotId, state, lastPlayedAt: now };
  if (idx >= 0) container.slots[idx] = entry;
  else container.slots.push(entry);
  container.activeSlotId = slotId;
  writeRaw(SAVE_CONTAINER_KEY, container);
}

export function deleteSlot(slotId: string): void {
  const container = loadContainer();
  container.slots = container.slots.filter((s) => s.id !== slotId);
  if (container.activeSlotId === slotId) {
    container.activeSlotId = container.slots[0]?.id ?? null;
  }
  writeRaw(SAVE_CONTAINER_KEY, container);
}

/** Wie viele Slots dem aktuellen Nutzer zur Verfügung stehen (1 ohne, bis zu
 * `MAX_SLOTS` mit Karriere-Pass). */
export function slotLimit(): number {
  return hasCareerPass() ? MAX_SLOTS : FREE_SLOT_LIMIT;
}

/** Erster noch freier Slot innerhalb des aktuellen Limits, oder `null` wenn alle
 * verfügbaren Plätze belegt sind (Free-User mit bereits 1 Slot, Pass-User mit
 * bereits 3 Slots). */
export function nextFreeSlotId(): string | null {
  const used = new Set(loadContainer().slots.map((s) => s.id));
  const limit = slotLimit();
  for (let i = 1; i <= limit; i++) {
    const id = `slot-${i}`;
    if (!used.has(id)) return id;
  }
  return null;
}

// ============================================================================
// Karriere-Pass (Dev-Flag - siehe Abschnitt "Dev-Toggle zum Testen" im Handoff:
// noch keine echte Payment-Integration, der Status kommt vorerst rein lokal aus
// diesem persistierten Flag).
// ============================================================================

export function hasCareerPass(): boolean {
  return readRaw<boolean>(CAREER_PASS_KEY) === true;
}

export function setCareerPass(value: boolean): void {
  writeRaw(CAREER_PASS_KEY, value);
}

// ============================================================================
// Bestenlisten-Archiv - unabhängig von den Save-Slots, bleibt auch nach einem
// Slot-Überschreiben erhalten. Tracking läuft IMMER (bei jedem Karriereende),
// unabhängig vom Karriere-Pass-Status - nur die Anzeige ist gated (siehe UI).
// ============================================================================

export function loadRankingArchive(): RankingEntry[] {
  return readRaw<RankingEntry[]>(RANKING_ARCHIVE_KEY) ?? [];
}

export function addRankingEntry(entry: RankingEntry): void {
  const archive = loadRankingArchive();
  archive.push(entry);
  writeRaw(RANKING_ARCHIVE_KEY, archive);
}

// ============================================================================
// Sprache (i18n) - geräteweit, unabhängig von Slots.
// ============================================================================

export function loadLanguage(): Language {
  return readRaw<Language>(LANGUAGE_KEY) === "en" ? "en" : "de";
}

export function saveLanguage(lang: Language): void {
  writeRaw(LANGUAGE_KEY, lang);
}
