import type { GameState } from "./types";

export function emptyState(): GameState {
  return {
    player: null,
    leagueState: null,
    foreignLeagues: {},
    europeanLeagueDrift: {},
    seasonNumber: 0,
    screen: "title",
    pendingEventIds: [],
    currentEvent: null,
    feedback: null,
    lastSeasonStats: null,
    usedTemplateIds: [],
    recentTemplateSeasons: {},
  };
}
