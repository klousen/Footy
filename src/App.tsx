import { useEffect, useState } from "react";
import type { AttributeKey, EventChoice, GameState, Position } from "./engine/types";
import { emptyState } from "./engine/initialState";
import { loadGame, saveGame, clearSave, hasSave as hasSaveOnDisk } from "./engine/storage";
import type { CountryId } from "./engine/leagues";
import {
  ageUpPlayer,
  applyChoice,
  applyLeaguePromotionRelegation,
  buildRetirementEvent,
  buildSeasonEvents,
  computeLegacy,
  createPlayer,
  pickPostCareerPath,
  resolveClubSituation,
  shouldOfferRetirement,
  simulateSeason,
} from "./engine/careerEngine";
import { StartScreen } from "./ui/StartScreen";
import { SelectCountry } from "./ui/SelectCountry";
import { CreatePlayer } from "./ui/CreatePlayer";
import { Dashboard } from "./ui/Dashboard";
import { EventCard } from "./ui/EventCard";
import { SeasonSummary } from "./ui/SeasonSummary";
import { CareerEnd } from "./ui/CareerEnd";
import "./app.css";

function initState(): GameState {
  return loadGame() ?? emptyState();
}

export default function App() {
  const [game, setGame] = useState<GameState>(initState);
  const [pendingCountry, setPendingCountry] = useState<CountryId | null>(null);

  useEffect(() => {
    saveGame(game);
  }, [game]);

  function handleNewGame() {
    clearSave();
    setPendingCountry(null);
    setGame({ ...emptyState(), screen: "country" });
  }

  function handleContinue() {
    const loaded = loadGame();
    if (loaded) setGame(loaded);
  }

  function handleSelectCountry(countryId: CountryId) {
    setPendingCountry(countryId);
    setGame({ ...game, screen: "create" });
  }

  function handleCreatePlayer(name: string, position: Position, focus: AttributeKey) {
    if (!pendingCountry) return;
    const { player, league } = createPlayer(name, position, focus, pendingCountry);
    setGame({ ...emptyState(), player, leagueState: league, screen: "dashboard" });
  }

  function handleStartSeason() {
    if (!game.player) return;
    const used = new Set(game.usedTemplateIds);
    const events = buildSeasonEvents(game.player, used, 5);
    const nextSeasonNumber = game.seasonNumber + 1;
    if (events.length === 0) {
      finishSeasonEvents({ ...game, seasonNumber: nextSeasonNumber });
      return;
    }
    const [first, ...rest] = events;
    setGame({
      ...game,
      seasonNumber: nextSeasonNumber,
      pendingEvents: rest,
      currentEvent: first,
      usedTemplateIds: [...game.usedTemplateIds, ...events.map((e) => e.templateId)],
      screen: "event",
    });
  }

  function finishSeasonEvents(current: GameState) {
    const player = current.player;
    const league = current.leagueState;
    if (!player || !league) return;
    const stats = simulateSeason(player, current.seasonNumber, league);
    ageUpPlayer(player);
    const clubEntry = resolveClubSituation(player, league);
    if (clubEntry) player.log.push(clubEntry);
    const promotionEntry = applyLeaguePromotionRelegation(player, league);
    if (promotionEntry) player.log.push(promotionEntry);
    setGame({
      ...current,
      player: { ...player },
      leagueState: { ...league },
      lastSeasonStats: stats,
      currentEvent: null,
      pendingEvents: [],
      screen: "seasonSummary",
    });
  }

  function handleChoice(choice: EventChoice) {
    if (!game.player || !game.currentEvent) return;
    const isRetirementDecision = game.currentEvent.templateId === "retirement_decision";

    applyChoice(game, choice);
    const player = game.player;

    if (isRetirementDecision) {
      if (choice.id === "beenden") {
        player.retired = true;
        player.postCareerPath = pickPostCareerPath(player);
        const { score, tier } = computeLegacy(player);
        setGame({
          ...game,
          player: { ...player },
          currentEvent: null,
          screen: "careerEnd",
          legacyScore: score,
          legacyTier: tier,
          epilogue: buildEpilogueSafe(player, tier),
        });
      } else {
        setGame({ ...game, player: { ...player }, currentEvent: null, screen: "dashboard" });
      }
      return;
    }

    if (game.pendingEvents.length > 0) {
      const [next, ...rest] = game.pendingEvents;
      setGame({ ...game, player: { ...player }, currentEvent: next, pendingEvents: rest });
    } else {
      finishSeasonEvents(game);
    }
  }

  function handleContinueFromSummary() {
    if (!game.player) return;
    if (shouldOfferRetirement(game.player)) {
      setGame({ ...game, currentEvent: buildRetirementEvent(game.player), screen: "event" });
    } else {
      setGame({ ...game, screen: "dashboard" });
    }
  }

  function handleNewCareerAfterEnd() {
    clearSave();
    setPendingCountry(null);
    setGame({ ...emptyState(), screen: "country" });
  }

  return (
    <div className="app-shell">
      {game.screen === "start" && (
        <StartScreen hasSave={hasSaveOnDisk()} onNewGame={handleNewGame} onContinue={handleContinue} />
      )}
      {game.screen === "country" && <SelectCountry onSelect={handleSelectCountry} />}
      {game.screen === "create" && <CreatePlayer onCreate={handleCreatePlayer} />}
      {game.screen === "dashboard" && game.player && game.leagueState && (
        <Dashboard player={game.player} league={game.leagueState} onStartSeason={handleStartSeason} />
      )}
      {game.screen === "event" && game.player && game.currentEvent && (
        <EventCard event={game.currentEvent} player={game.player} onChoose={handleChoice} />
      )}
      {game.screen === "seasonSummary" && game.player && game.lastSeasonStats && (
        <SeasonSummary stats={game.lastSeasonStats} player={game.player} onContinue={handleContinueFromSummary} />
      )}
      {game.screen === "careerEnd" && game.player && (
        <CareerEnd
          player={game.player}
          legacyScore={game.legacyScore}
          legacyTier={game.legacyTier}
          epilogue={game.epilogue}
          onNewCareer={handleNewCareerAfterEnd}
        />
      )}
    </div>
  );
}

function buildEpilogueSafe(player: NonNullable<GameState["player"]>, tier: string): string {
  const trophyText =
    player.careerTotals.trophies.length > 0
      ? `${player.careerTotals.trophies.length} Titel in der Vitrine`
      : "keinem Titel, aber vielen unvergesslichen Momenten";
  return `Nach ${player.age - player.birthAge} Jahren im Profifußball beendet ${player.name} die aktive Karriere mit ${player.careerTotals.goals} Toren, ${player.careerTotals.assists} Vorlagen und ${trophyText}. Die Karriere geht als "${tier}" in die Vereinsgeschichte ein. Danach führt der Weg: ${player.postCareerPath}.`;
}
