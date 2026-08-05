import type { GameState } from "./types";

export function emptyState(): GameState {
  return {
    player: null,
    leagueState: null,
    seasonNumber: 0,
    screen: "start",
    pendingEventIds: [],
    currentEvent: null,
    feedback: null,
    lastSeasonStats: null,
    usedTemplateIds: [],
    recentTemplateSeasons: {},
  };
}
