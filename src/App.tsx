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
  buildEpilogue,
  buildEventFromId,
  buildRetirementEvent,
  clubOfferTemplateId,
  computeAchievements,
  computeLegacy,
  createPlayer,
  decideClubOfferInjection,
  dueStorylineTemplateIds,
  finalizeYouthClub,
  insertAt,
  isClubOfferEvent,
  overallRating,
  pickPostCareerPath,
  pickSeasonTemplateIds,
  resolveClubSituation,
  shouldOfferRetirement,
  simulateSeason,
  STALE_AFTER_TRANSFER_TEMPLATE_IDS,
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
import { EndCareerMenu } from "./ui/EndCareerMenu";
import "./app.css";

function initState(): GameState {
  return loadGame() ?? emptyState();
}

export default function App() {
  const [game, setGame] = useState<GameState>(initState);
  const [pendingCountry, setPendingCountry] = useState<CountryId | null>(null);
  const [youthOffers, setYouthOffers] = useState<ClubState[]>([]);
  const [showEndCareerMenu, setShowEndCareerMenu] = useState(false);

  useEffect(() => {
    saveGame(game);
  }, [game]);

  // Bei jedem Screen-Wechsel (z.B. Saison-Rückblick, neues Event) ganz oben
  // starten - sonst bleibt teils die Scroll-Position der vorherigen, längeren
  // Ansicht erhalten und die wichtigsten Infos (Score, Titel) sind erst nach
  // manuellem Scrollen sichtbar.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [game.screen, game.currentEvent?.id, game.lastSeasonStats]);

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

    // Fällige Storyline-Fortsetzungen werden garantiert eingeplant, nicht zufällig gezogen.
    for (const storyId of dueStorylineTemplateIds(game.player, nextSeasonNumber)) {
      ids = insertAt(ids, storyId, Math.min(1, ids.length));
    }

    // Wechsel sollen realistisch an echte Transferfenster gebunden sein, nicht an
    // eine beliebige Stelle mitten in der Saison: Angebote nach Profidebüt/starker
    // Form kommen im Sommer (ganz am Saisonanfang, vor allen anderen Ereignissen),
    // Bankdruck-Angebote erst im Winterfenster (nach der gedachten Hinrunde).
    const offerReason = decideClubOfferInjection(game.player);
    if (offerReason) {
      const insertIndex = offerReason === "pressure" ? Math.ceil(ids.length / 2) : 0;
      ids = insertAt(ids, clubOfferTemplateId(offerReason), insertIndex);
    }

    if (ids.length === 0) {
      finishSeasonEvents({ ...game, seasonNumber: nextSeasonNumber, recentTemplateSeasons });
      return;
    }
    const [firstId, ...restIds] = ids;
    const firstEvent = buildEventFromId(firstId, game.player, game.leagueState, game.foreignLeagues);
    setGame({
      ...game,
      player: { ...game.player },
      leagueState: { ...game.leagueState },
      foreignLeagues: { ...game.foreignLeagues },
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

    // Erfolge kontextualisiert direkt im Saisonrückblick zeigen, statt sie erst am
    // Karriereende zu erwähnen - jede Saison wird auf neu erreichte Erfolge geprüft.
    const allAchievements = computeAchievements(player);
    const newAchievements = allAchievements.filter((a) => !player.unlockedAchievementIds.includes(a.id));
    player.unlockedAchievementIds = [...player.unlockedAchievementIds, ...newAchievements.map((a) => a.id)];
    stats.newAchievements = newAchievements;

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
    const foreignLeagues = game.foreignLeagues;

    let newActiveLeague: GameState["leagueState"] = null;
    // Ein echter Vereinswechsel (nicht "bleiben"/"kämpfen"/kein passender Verein
    // gefunden) setzt den Vertrag frisch auf 3 Jahre - eine in dieser Saison bereits
    // gezogene, aber noch nicht angezeigte Vertragsverlängerung wäre danach hinfällig
    // (siehe `STALE_AFTER_TRANSFER_TEMPLATE_IDS`) und muss aus der Warteschlange raus.
    // Ebenso können bereits fällig eingeplante Fortsetzungen vereinsgebundener
    // Storylines (Rivalität/Trainerzoff/Vereinsikone) noch in der Warteschlange
    // stehen, obwohl der Wechsel sie gerade beendet hat (siehe
    // `endedStorylineTemplateIds`) - sonst würde z.B. "Zoff mit dem Trainer" beim
    // ALTEN Verein nach dem Wechsel fälschlich beim NEUEN Verein weitererzählt.
    let didTransfer = false;
    let endedStorylineTemplateIds: string[] = [];
    const feedback = isClubOfferEvent(game.currentEvent.templateId)
      ? (() => {
          const oldClubId = player.club.clubId;
          const result = applyClubOfferChoice(player, league, game.currentEvent!, choice.id, foreignLeagues);
          if (result.newActiveLeague) newActiveLeague = result.newActiveLeague;
          didTransfer = player.club.clubId !== oldClubId;
          endedStorylineTemplateIds = result.endedStorylineTemplateIds ?? [];
          return result.feedback;
        })()
      : (() => {
          // Gesamtstärke vorher/nachher vergleichen, damit der fußballerische Impact
          // einer Entscheidung sofort sichtbar wird (nicht nur einzelne Attribut-Punkte).
          const before = overallRating(player);
          const effects = applyChoice(game, choice);
          const after = overallRating(player);
          const deltaLines = summarizeEffects(effects, player);
          if (after !== before) {
            deltaLines.unshift(`Gesamtstärke ${before} → ${after} (${after > before ? "+" : ""}${after - before})`);
          }
          return {
            choiceId: choice.id,
            text: effects.logText ? `${player.name} ${effects.logText}` : choice.label,
            kind: effects.logKind ?? "info",
            deltaLines,
          };
        })();

    setGame({
      ...game,
      player: { ...player },
      leagueState: newActiveLeague ?? { ...league },
      foreignLeagues: { ...foreignLeagues },
      pendingEventIds: didTransfer
        ? game.pendingEventIds.filter((id) => !STALE_AFTER_TRANSFER_TEMPLATE_IDS.has(id) && !endedStorylineTemplateIds.includes(id))
        : game.pendingEventIds,
      feedback,
    });
  }

  // Schritt 2: "Weiter" im Feedback -> je nach Event-Art passend weiterleiten.
  function handleFeedbackContinue() {
    if (!game.player || !game.currentEvent || !game.feedback) return;
    const isRetirementDecision = game.currentEvent.templateId === "retirement_decision";
    const choiceId = game.feedback.choiceId;
    const player = game.player;

    if (isRetirementDecision) {
      if (choiceId === "beenden") {
        setGame({ ...game, ...buildCareerEndUpdate(player) });
      } else {
        setGame({ ...game, player: { ...player }, currentEvent: null, feedback: null, screen: "dashboard" });
      }
      return;
    }

    if (game.pendingEventIds.length > 0 && game.leagueState) {
      const [nextId, ...restIds] = game.pendingEventIds;
      const nextEvent = buildEventFromId(nextId, player, game.leagueState, game.foreignLeagues);
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

  // Der "Return"-Button oben rechts fragt erst nach, statt die Karriere sofort zu
  // beenden - drei mögliche Wege aus dem Menü heraus:
  function handleEndCareerViewSummary() {
    if (!game.player) return;
    setShowEndCareerMenu(false);
    setGame({ ...game, ...buildCareerEndUpdate(game.player) });
  }

  function handleEndCareerStartNew() {
    clearSave();
    setPendingCountry(null);
    setYouthOffers([]);
    setShowEndCareerMenu(false);
    setGame({ ...emptyState(), screen: "start" });
  }

  function handleCancelEndCareer() {
    setShowEndCareerMenu(false);
  }

  // Sichtbar, sobald ein Spieler existiert und noch nicht auf der Karriereende-
  // Übersicht steht (dort gibt es bereits einen eigenen "Neue Karriere"-Weg).
  const showReturnButton = game.player !== null && game.screen !== "careerEnd";

  return (
    <div className="app-shell">
      {showReturnButton && (
        <button
          className="return-btn"
          onClick={() => setShowEndCareerMenu(true)}
          aria-label="Karriere beenden"
          title="Karriere beenden"
        >
          ↩
        </button>
      )}
      {showEndCareerMenu && (
        <EndCareerMenu
          onViewSummary={handleEndCareerViewSummary}
          onNewCareer={handleEndCareerStartNew}
          onCancel={handleCancelEndCareer}
        />
      )}
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
        <Dashboard
          player={game.player}
          league={game.leagueState}
          seasonNumber={game.seasonNumber}
          onStartSeason={handleStartSeason}
        />
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

/** Bündelt die Karriereende-Auswertung (Legacy-Score, Achievements, Epilog) -
 * genutzt sowohl vom regulären Rücktritts-Event als auch vom manuellen
 * "Return"-Button, der die Karriere jederzeit vorzeitig beenden kann. */
function buildCareerEndUpdate(player: NonNullable<GameState["player"]>): Partial<GameState> {
  player.retired = true;
  player.postCareerPath = pickPostCareerPath(player);
  const { score, tier, factors } = computeLegacy(player);
  const achievements = computeAchievements(player);
  return {
    player: { ...player },
    currentEvent: null,
    pendingEventIds: [],
    feedback: null,
    screen: "careerEnd",
    legacyScore: score,
    legacyTier: tier,
    legacyFactors: factors,
    achievements,
    epilogue: buildEpilogue(player, tier),
  };
}
