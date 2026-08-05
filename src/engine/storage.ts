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
    }
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
