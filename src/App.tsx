import { useEffect, useState } from "react";
import type { AttributeKey, ClubState, EventChoice, GameState, Position } from "./engine/types";
import { emptyState } from "./engine/initialState";
import { loadGame, saveGame, clearSave, hasSave as hasSaveOnDisk } from "./engine/storage";
import type { CountryId } from "./engine/leagues";
import {
  ageUpPlayer,
  applyChoice,
  applyClubOfferChoice,
  applyLeaguePromotionRelegation,
  buildEventFromId,
  buildRetirementEvent,
  clubOfferTemplateId,
  computeAchievements,
  computeLegacy,
  createPlayer,
  decideClubOfferInjection,
  finalizeYouthClub,
  insertAt,
  isClubOfferEvent,
  pickPostCareerPath,
  pickSeasonTemplateIds,
  resolveClubSituation,
  shouldOfferRetirement,
  simulateSeason,
  summarizeEffects,
} from "./engine/careerEngine";
import { StartScreen } from "./ui/StartScreen";
import { SelectCountry } from "./ui/SelectCountry";
import { CreatePlayer } from "./ui/CreatePlayer";
import { YouthClubOffer } from "./ui/YouthClubOffer";
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
  const [youthOffers, setYouthOffers] = useState<ClubState[]>([]);

  useEffect(() => {
    saveGame(game);
  }, [game]);

  function handleNewGame() {
    clearSave();
    setPendingCountry(null);
    setYouthOffers([]);
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
    const { player, league, offers } = createPlayer(name, position, focus, pendingCountry);
    setYouthOffers(offers);
    setGame({ ...emptyState(), player, leagueState: league, screen: "youthOffer" });
  }

  function handleSelectYouthClub(clubId: string) {
    if (!game.player || !game.leagueState) return;
    finalizeYouthClub(game.player, game.leagueState, clubId);
    setYouthOffers([]);
    setGame({ ...game, player: { ...game.player }, screen: "dashboard" });
  }

  function handleStartSeason() {
    if (!game.player || !game.leagueState) return;
    const nextSeasonNumber = game.seasonNumber + 1;
    const used = new Set(game.usedTemplateIds);
    const recentTemplateSeasons = { ...game.recentTemplateSeasons };

    // Nur IDs vormerken - der eigentliche Event-Text wird erst beim Anzeigen gebaut
    // (siehe buildEventFromId), damit er immer den dann aktuellen Verein zeigt.
    let ids = pickSeasonTemplateIds(game.player, used, recentTemplateSeasons, nextSeasonNumber);

    const offerReason = decideClubOfferInjection(game.player);
    if (offerReason) ids = insertAt(ids, clubOfferTemplateId(offerReason), Math.min(2, ids.length));

    if (ids.length === 0) {
      finishSeasonEvents({ ...game, seasonNumber: nextSeasonNumber, recentTemplateSeasons });
      return;
    }
    const [firstId, ...restIds] = ids;
    const firstEvent = buildEventFromId(firstId, game.player, game.leagueState);
    setGame({
      ...game,
      player: { ...game.player },
      leagueState: { ...game.leagueState },
      seasonNumber: nextSeasonNumber,
      pendingEventIds: restIds,
      currentEvent: firstEvent,
      usedTemplateIds: [...game.usedTemplateIds, ...ids],
      recentTemplateSeasons,
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
      pendingEventIds: [],
      feedback: null,
      screen: "seasonSummary",
    });
  }

  // Schritt 1: Wahl treffen -> Effekte sofort anwenden, Ergebnis als Feedback zeigen
  // (die Event-Queue wird erst weitergeschaltet, wenn "Weiter" im Feedback geklickt wird).
  function handleChoice(choice: EventChoice) {
    if (!game.player || !game.currentEvent || !game.leagueState) return;
    const player = game.player;
    const league = game.leagueState;

    const feedback = isClubOfferEvent(game.currentEvent.templateId)
      ? applyClubOfferChoice(player, league, game.currentEvent, choice.id)
      : (() => {
          const effects = applyChoice(game, choice);
          const deltaLines = summarizeEffects(effects);
          return {
            choiceId: choice.id,
            text: effects.logText ? `${player.name} ${effects.logText}` : choice.label,
            kind: effects.logKind ?? "info",
            deltaLines,
          };
        })();

    setGame({ ...game, player: { ...player }, leagueState: { ...league }, feedback });
  }

  // Schritt 2: "Weiter" im Feedback -> je nach Event-Art passend weiterleiten.
  function handleFeedbackContinue() {
    if (!game.player || !game.currentEvent || !game.feedback) return;
    const isRetirementDecision = game.currentEvent.templateId === "retirement_decision";
    const choiceId = game.feedback.choiceId;
    const player = game.player;

    if (isRetirementDecision) {
      if (choiceId === "beenden") {
        player.retired = true;
        player.postCareerPath = pickPostCareerPath(player);
        const { score, tier, factors } = computeLegacy(player);
        const achievements = computeAchievements(player);
        setGame({
          ...game,
          player: { ...player },
          currentEvent: null,
          feedback: null,
          screen: "careerEnd",
          legacyScore: score,
          legacyTier: tier,
          legacyFactors: factors,
          achievements,
          epilogue: buildEpilogueSafe(player, tier),
        });
      } else {
        setGame({ ...game, player: { ...player }, currentEvent: null, feedback: null, screen: "dashboard" });
      }
      return;
    }

    if (game.pendingEventIds.length > 0 && game.leagueState) {
      const [nextId, ...restIds] = game.pendingEventIds;
      const nextEvent = buildEventFromId(nextId, player, game.leagueState);
      setGame({ ...game, player: { ...player }, currentEvent: nextEvent, pendingEventIds: restIds, feedback: null });
    } else {
      finishSeasonEvents({ ...game, feedback: null });
    }
  }

  function handleContinueFromSummary() {
    if (!game.player) return;
    if (shouldOfferRetirement(game.player)) {
      setGame({ ...game, currentEvent: buildRetirementEvent(game.player), feedback: null, screen: "event" });
    } else {
      setGame({ ...game, screen: "dashboard" });
    }
  }

  function handleNewCareerAfterEnd() {
    clearSave();
    setPendingCountry(null);
    setYouthOffers([]);
    setGame({ ...emptyState(), screen: "country" });
  }

  return (
    <div className="app-shell">
      {game.screen === "start" && (
        <StartScreen hasSave={hasSaveOnDisk()} onNewGame={handleNewGame} onContinue={handleContinue} />
      )}
      {game.screen === "country" && <SelectCountry onSelect={handleSelectCountry} />}
      {game.screen === "create" && <CreatePlayer onCreate={handleCreatePlayer} />}
      {game.screen === "youthOffer" && game.player && game.leagueState && (
        <YouthClubOffer
          playerName={game.player.name}
          league={game.leagueState}
          offers={youthOffers}
          onSelect={handleSelectYouthClub}
        />
      )}
      {game.screen === "dashboard" && game.player && game.leagueState && (
        <Dashboard player={game.player} league={game.leagueState} onStartSeason={handleStartSeason} />
      )}
      {game.screen === "event" && game.player && game.currentEvent && (
        <EventCard
          event={game.currentEvent}
          player={game.player}
          feedback={game.feedback}
          onChoose={handleChoice}
          onContinue={handleFeedbackContinue}
        />
      )}
      {game.screen === "seasonSummary" && game.player && game.lastSeasonStats && (
        <SeasonSummary stats={game.lastSeasonStats} player={game.player} onContinue={handleContinueFromSummary} />
      )}
      {game.screen === "careerEnd" && game.player && (
        <CareerEnd
          player={game.player}
          legacyScore={game.legacyScore}
          legacyTier={game.legacyTier}
          legacyFactors={game.legacyFactors}
          achievements={game.achievements}
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
