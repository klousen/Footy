import type { GameState } from "./types";

const STORAGE_KEY = "footy-career-save-v1";

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Speicher voll oder nicht verfügbar - stillschweigend ignorieren
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    // Absicherung gegen ältere Spielstände ohne die Storyline-Felder.
    if (state.player) {
      state.player.activeStorylines ??= [];
      state.player.completedStorylines ??= [];
      state.player.trainingBoostSeasons ??= 0;
      state.player.unlockedAchievementIds ??= [];
      state.player.growthCarry ??= {};
      state.player.nationalTeamGoals ??= 0;
      state.player.startingRoleGuaranteeSeasons ??= 0;
      state.player.cupExitThisSeason ??= false;
      // Ältere Spielstände kennen `playedAbroad` noch nicht - da wir nicht mehr
      // rekonstruieren können, ob je ins Ausland gewechselt wurde, im Zweifel als
      // "bereits im Ausland gespielt" annehmen (kein rückwirkendes "Ligalegende" für
      // Spielstände, die dieses Flag nie hätten aufbauen können).
      state.player.playedAbroad ??= true;
      state.player.loanActive ??= false;
      state.player.loanReturnClub ??= null;
      state.player.loanReturnCountryId ??= null;
      state.player.definingMoment ??= null;
      state.player.edeljokerLocked ??= false;
      state.player.formSlumpSeasons ??= 0;
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
        }));
      }
    }
    state.foreignLeagues ??= {};
    return state;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorieren
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
