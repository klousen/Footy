import type { GameState } from "./types";

export function emptyState(): GameState {
  return {
    player: null,
    leagueState: null,
    seasonNumber: 0,
    screen: "start",
    pendingEvents: [],
    currentEvent: null,
    feedback: null,
    lastSeasonStats: null,
    usedTemplateIds: [],
  };
}
