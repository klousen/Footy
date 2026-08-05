import type { GameState } from "./types";

export function emptyState(): GameState {
  return {
    player: null,
    seasonNumber: 0,
    screen: "start",
    pendingEvents: [],
    currentEvent: null,
    lastSeasonStats: null,
    usedTemplateIds: [],
  };
}
