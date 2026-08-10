import { useEffect, useState } from "react";
import type { AttributeKey, ClubState, EventChoice, GameState, Position } from "./engine/types";
import { emptyState } from "./engine/initialState";
import {
  addRankingEntry,
  deleteSlot,
  getMostRecentSlot,
  hasCareerPass as hasCareerPassOnDisk,
  hasSave as hasSaveOnDisk,
  listSlots,
  loadRankingArchive,
  loadSlot,
  saveSlot,
  setCareerPass as setCareerPassOnDisk,
  slotLimit,
} from "./engine/storage";
import type { CountryId } from "./engine/leagues";
import {
  ageUpPlayer,
  applyChoice,
  applyClubOfferChoice,
  applyLeaguePromotionRelegation,
  applyLoanDecisionChoice,
  buildEpilogue,
  buildEventFromId,
  buildLoanFutureEvent,
  buildRankingEntry,
  buildRetirementEvent,
  clubOfferTemplateId,
  computeAchievements,
  computeLegacy,
  createPlayer,
  decideClubOfferInjection,
  decideNarrativeEventInjection,
  decideRoleChallengeInjection,
  dueStorylineTemplateIds,
  finalizeYouthClub,
  insertWithinBudget,
  isClubOfferEvent,
  overallRating,
  pickPostCareerPath,
  pickSeasonTemplateIds,
  rankingScore,
  resolveClubSituation,
  rng,
  shouldOfferRetirement,
  shouldTriggerVacationEvent,
  simulateSeason,
  STALE_AFTER_TRANSFER_TEMPLATE_IDS,
  summarizeEffects,
} from "./engine/careerEngine";
import { LOAN_DECISION_TEMPLATE_IDS } from "./engine/loanStory";
import { HOMECOMING_TEMPLATE_ID, UNDERDOG_CUP_TEMPLATE_ID, VACATION_TEMPLATE_ID } from "./engine/events";
import { pickSpreadClubOffers } from "./engine/leagueEngine";
import { TRANSFER_DECISION_MEANING } from "./ui/labels";
import { useLanguage } from "./ui/LanguageContext";
import { TitleScreen } from "./ui/TitleScreen";
import { SlotSelectScreen } from "./ui/SlotSelectScreen";
import { LeaderboardScreen } from "./ui/LeaderboardScreen";
import { OverwriteConfirmDialog } from "./ui/OverwriteConfirmDialog";
import { DevPassDialog } from "./ui/DevPassDialog";
import { SelectCountry } from "./ui/SelectCountry";
import { CreatePlayer } from "./ui/CreatePlayer";
import { YouthClubOffer } from "./ui/YouthClubOffer";
import { Dashboard } from "./ui/Dashboard";
import { EventCard } from "./ui/EventCard";
import { SeasonSummary } from "./ui/SeasonSummary";
import { CareerEnd } from "./ui/CareerEnd";
import { EndCareerMenu } from "./ui/EndCareerMenu";
import "./app.css";

export default function App() {
  const { t } = useLanguage();
  // App startet IMMER im Titelmenü (siehe Handoff Abschnitt 1) - nie automatisch
  // in einen geladenen Spielstand hinein, auch wenn einer existiert. Welcher
  // Slot gerade aktiv gespielt wird, lebt bewusst als eigener Component-State
  // (nicht in `GameState`), damit Titelmenü/Slot-Auswahl/Bestenliste ohne
  // Slot-Bezug auskommen.
  const [game, setGame] = useState<GameState>(emptyState);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [pendingCountry, setPendingCountry] = useState<CountryId | null>(null);
  const [youthOffers, setYouthOffers] = useState<ClubState[]>([]);
  const [showEndCareerMenu, setShowEndCareerMenu] = useState(false);
  const [overwriteTarget, setOverwriteTarget] = useState<{ slotId: string; playerName: string } | null>(null);
  const [showDevDialog, setShowDevDialog] = useState(false);
  const [careerPass, setCareerPassState] = useState<boolean>(hasCareerPassOnDisk);

  // Nur persistieren, solange ein Slot aktiv ist - Titelmenü/Slot-Auswahl/
  // Bestenliste (kein `activeSlotId`) schreiben nichts in den Spielstand-Container.
  useEffect(() => {
    if (activeSlotId) {
      saveSlot(activeSlotId, game);
    }
  }, [game, activeSlotId]);

  // Bei jedem Screen-Wechsel (z.B. Saison-Rückblick, neues Event) ganz oben
  // starten - sonst bleibt teils die Scroll-Position der vorherigen, längeren
  // Ansicht erhalten und die wichtigsten Infos (Score, Titel) sind erst nach
  // manuellem Scrollen sichtbar. Explizit `behavior: "instant"` statt der
  // knappen `scrollTo(0, 0)`-Form: `html` hat global `scroll-behavior: smooth`
  // (siehe app.css) - ohne die Override sah der Wechsel dadurch wie ein
  // animiertes Hochscrollen DURCH die bereits ausgetauschte neue Seite aus,
  // statt wie ein klarer Screen-Wechsel (Bugreport "wirkt als würde die App
  // einfach hochscrollen"). Der eigentliche Wechsel-Effekt kommt jetzt allein
  // von der `.screen`-Fade-in-Animation (siehe app.css), die bei jedem echten
  // Komponentenwechsel neu abspielt.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [game.screen, game.currentEvent?.id, game.lastSeasonStats]);

  // Lädt einen Slot vollständig (inkl. offenem Event/Feedback/Saisonbilanz, siehe
  // `saveSlot`-Dokumentation in storage.ts) und stellt dabei denselben Component-
  // State wieder her, den `pendingCountry`/`youthOffers` bewusst NICHT persistiert
  // mitbringen: landet der geladene Slot auf "create" (Länderwahl noch nicht
  // getroffen) oder "youthOffer" (Angebotsliste verloren), wird er in einen
  // benutzbaren Zustand zurückgeholt statt auf einem toten Screen zu enden.
  function enterSlot(slotId: string, state: GameState) {
    setActiveSlotId(slotId);
    setPendingCountry(null);
    setYouthOffers([]);
    if (state.screen === "create") {
      setGame({ ...emptyState(), screen: "country" });
      return;
    }
    if (state.screen === "youthOffer" && state.leagueState) {
      setYouthOffers(pickSpreadClubOffers(state.leagueState.tier2, rng, 3));
    }
    setGame(state);
  }

  function startNewCareerInSlot(slotId: string) {
    setActiveSlotId(slotId);
    setPendingCountry(null);
    setYouthOffers([]);
    setGame({ ...emptyState(), screen: "country" });
  }

  function goToTitle() {
    setActiveSlotId(null);
    setGame({ ...emptyState(), screen: "title" });
  }

  // ---------------- Titelmenü ----------------

  function handleContinue() {
    const slot = getMostRecentSlot();
    if (!slot) return;
    enterSlot(slot.id, slot.state);
  }

  // Führt IMMER über die Slot-Auswahl - auch im Free-Tier (1 Slot). Nur dort
  // laufen die gesperrten Slot-Karten + der Upgrade-Banner (siehe
  // SlotSelectScreen) tatsächlich Nutzern ohne Karriere-Pass vor die Augen;
  // ein direkter Sprung an der Auswahl vorbei (z.B. sofort in den
  // Überschreiben-Dialog) hätte genau die Zielgruppe übersprungen, die den
  // Pass beworben bekommen soll.
  function handleGoToNewCareer() {
    setActiveSlotId(null);
    setGame({ ...emptyState(), screen: "slot-select" });
  }

  function handleConfirmOverwrite() {
    if (!overwriteTarget) return;
    deleteSlot(overwriteTarget.slotId);
    startNewCareerInSlot(overwriteTarget.slotId);
    setOverwriteTarget(null);
  }

  function handleCancelOverwrite() {
    setOverwriteTarget(null);
  }

  function handleViewLeaderboard() {
    setActiveSlotId(null);
    setGame({ ...emptyState(), screen: "leaderboard" });
  }

  function handlePaywallPlaceholder() {
    alert(t("paywallPlaceholder"));
  }

  function handleDevToggle(value: boolean) {
    setCareerPassState(value);
    setCareerPassOnDisk(value);
  }

  // ---------------- Slot-Auswahl ----------------

  // Tap auf einen belegten Slot: Bedeutung hängt vom Pass-Status ab. Pass-User
  // haben mehrere unabhängige Karrieren - ein Tap wechselt schlicht dorthin
  // ("unabhängig ladbar", siehe Handoff Abschnitt 3). Free-User erreichen
  // diesen Screen dagegen AUSSCHLIESSLICH über "Neue Karriere starten" - ihr
  // einziger belegter Slot ist also nicht zum bloßen Fortsetzen gedacht
  // (dafür gibt es den eigenen Button im Titelmenü), sondern ein Tap hier
  // bedeutet "diese Karriere ersetzen" - wie zuvor über den direkten
  // Überschreiben-Dialog, jetzt eben von hier aus ausgelöst.
  function handleSelectSlot(slotId: string) {
    const state = loadSlot(slotId);
    if (!state) return;
    if (!careerPass) {
      if (state.player) setOverwriteTarget({ slotId, playerName: state.player.name });
      return;
    }
    enterSlot(slotId, state);
  }

  // ---------------- Bestehender Karriere-Flow (unverändert) ----------------

  function handleSelectCountry(countryId: CountryId) {
    setPendingCountry(countryId);
    setGame({ ...game, screen: "create" });
  }

  // Zurück-Button auf der Länderauswahl: sofort ohne Rückfrage zum Titelmenü,
  // da hier noch kein Spieler existiert - der Slot wurde für diesen (noch
  // leeren) Versuch gerade erst reserviert (siehe `startNewCareerInSlot`) und
  // wird deshalb wieder freigegeben, statt als "Spielstand" (ohne Spieler)
  // liegen zu bleiben und fälschlich "Karriere fortsetzen" im Titelmenü zu zeigen.
  function handleBackFromCountry() {
    if (activeSlotId) deleteSlot(activeSlotId);
    goToTitle();
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
    // Reiner Anzeige-Snapshot für die Attribut-/Charakter-Delta-Balken (siehe
    // `Player.attributesAtSeasonStart`) - VOR den Events dieser Saison, damit die
    // später gezeigte Delta-Kennzeichnung die komplette Saison (Entscheidungen +
    // Alterswachstum) abdeckt, nicht nur einen Teil davon. Berührt keine Spiellogik.
    game.player.attributesAtSeasonStart = { ...game.player.attributes };
    game.player.traitsAtSeasonStart = { ...game.player.traits };
    const nextSeasonNumber = game.seasonNumber + 1;
    const used = new Set(game.usedTemplateIds);
    const recentTemplateSeasons = { ...game.recentTemplateSeasons };

    // Nur IDs vormerken - der eigentliche Event-Text wird erst beim Anzeigen gebaut
    // (siehe buildEventFromId), damit er immer den dann aktuellen Verein zeigt.
    let ids = pickSeasonTemplateIds(game.player, used, recentTemplateSeasons, nextSeasonNumber);
    // Saison-Budget (siehe "EVENT-POOL INTEGRATION" Abschnitt 1/8): die von
    // `pickSeasonTemplateIds` zufällig gewürfelte Basis-Größe (3-5) bleibt für
    // die GESAMTE Saison verbindlich - Storyline-Fortsetzungen/Vereinsangebote/
    // narrative Events/Sommerpause zählen ab jetzt ALS eines dieser Slots
    // (siehe `insertWithinBudget`), statt zusätzlich addiert zu werden. `guaranteed`
    // sammelt alle bereits garantiert eingeplanten IDs, damit sich die folgenden
    // Injektionen nicht gegenseitig wieder verdrängen.
    const seasonEventBudget = ids.length;
    const guaranteedIds = new Set<string>();

    // "Hard Priority" für narrative Ereignisse (siehe "EVENT-POOL INTEGRATION"
    // Abschnitt 4/5): bei einem echten, anhaltenden Karriere-Wendepunkt wird EIN
    // Slot GEZIELT für das passende narrative Event reserviert, statt es dem
    // reinen Zufall der gewichteten Auswahl zu überlassen.
    const narrativeInjectionId = decideNarrativeEventInjection(game.player, used, recentTemplateSeasons, nextSeasonNumber);
    if (narrativeInjectionId) {
      ids = insertWithinBudget(ids, narrativeInjectionId, ids.length, guaranteedIds, seasonEventBudget);
      recentTemplateSeasons[narrativeInjectionId] = nextSeasonNumber;
    }

    // Zweiter, unabhängiger "Hard Priority"-Slot: garantiert das Reaktions-Event
    // "Die Kaderrolle wackelt", sobald die letzte Saison eine automatische
    // Kaderrollen-Verschlechterung ergeben hat (siehe `resolveClubSituation`/
    // `Player.roleChallengePending`) - der Bugreport "wenn das Spiel mir sagt ich
    // bekomme weniger Spielzeit, kann ich aktiv nichts dagegen tun" wird damit
    // NIE dem Zufall des allgemeinen Event-Pools überlassen. WICHTIG: das Flag darf
    // HIER noch NICHT zurückgesetzt werden - `buildEventFromId` prüft `condition`
    // erneut beim tatsächlichen Anzeigen (Sicherheitsnetz gegen zwischenzeitlich
    // veränderten Spielerzustand, siehe dortiger Kommentar) und würde sonst den
    // gerade erst garantierten Slot sofort wieder gegen die neutrale "Ruhige
    // Woche"-Ersatzfüllung tauschen. Das Zurücksetzen passiert stattdessen in
    // `applyChoice`, sobald die Antwort tatsächlich gewählt wurde.
    const roleChallengeInjectionId = decideRoleChallengeInjection(game.player, used, recentTemplateSeasons, nextSeasonNumber);
    if (roleChallengeInjectionId) {
      ids = insertWithinBudget(ids, roleChallengeInjectionId, ids.length, guaranteedIds, seasonEventBudget);
      recentTemplateSeasons[roleChallengeInjectionId] = nextSeasonNumber;
    }

    // Fällige Storyline-Fortsetzungen werden garantiert eingeplant, nicht zufällig gezogen.
    for (const storyId of dueStorylineTemplateIds(game.player, nextSeasonNumber)) {
      ids = insertWithinBudget(ids, storyId, Math.min(1, ids.length), guaranteedIds, seasonEventBudget);
    }

    // Wechsel sollen realistisch an echte Transferfenster gebunden sein, nicht an
    // eine beliebige Stelle mitten in der Saison: Angebote nach Profidebüt/starker
    // Form kommen im Sommer (ganz am Saisonanfang, vor allen anderen Ereignissen),
    // Bankdruck-Angebote erst im Winterfenster (nach der gedachten Hinrunde).
    // Transferangebote bleiben dabei Bestandteil des normalen Eventpools (siehe
    // "EVENT-POOL INTEGRATION" Abschnitt 8), zählen also ebenfalls als einer der
    // `seasonEventBudget`-Slots statt zusätzlich addiert zu werden.
    const offerReason = decideClubOfferInjection(game.player);
    if (offerReason) {
      const insertIndex = offerReason === "pressure" ? Math.ceil(ids.length / 2) : 0;
      ids = insertWithinBudget(ids, clubOfferTemplateId(offerReason), insertIndex, guaranteedIds, seasonEventBudget);
    }

    // Sommerpause: NICHT jede Saison (siehe `shouldTriggerVacationEvent` - feste
    // Wahrscheinlichkeit pro Saison, reiht sich damit in die Häufigkeit der
    // übrigen Karriere-Events ein statt garantiert aufzutauchen), ab 20 Jahren.
    // Wenn sie feuert, dann bewusst ganz am Ende angehängt (nach Storylines/
    // Vereinsangeboten), damit sie wirklich "kurz vor der Sommerpause" wirkt
    // statt mittendrin. Während eines laufenden Leihjahres wird sie automatisch
    // verworfen, sobald das Leihangebot angenommen wird (siehe `handleChoice`,
    // das die Event-Queue dann komplett durch die drei Leih-Entscheidungen
    // ersetzt) - keine zusätzliche Prüfung hier nötig. Niedrigste Priorität aller
    // Injektionen - zählt ebenfalls zum Saison-Budget statt es zu sprengen.
    if (shouldTriggerVacationEvent(game.player)) {
      ids = insertWithinBudget(ids, VACATION_TEMPLATE_ID, ids.length, guaranteedIds, seasonEventBudget);
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
    // Narratives Leihjahr: die drei Entscheidungen wirken über Vereinsbeziehung/
    // Attribute (siehe loanStory.ts) - die daraus resultierende Kaderrolle soll
    // noch VOR der Saison-Simulation DIESER Saison selbst greifen (sonst würde
    // ein erkämpfter Stammplatz erst in der FOLGESaison echte Einsatzminuten
    // bringen, siehe `resolveClubSituation`, das sonst erst NACH der Simulation
    // läuft).
    if (player.loanNarrative) {
      const earlyRoleEntry = resolveClubSituation(player, league);
      if (earlyRoleEntry) player.log.push(earlyRoleEntry);
    }
    const stats = simulateSeason(player, current.seasonNumber, league, current.foreignLeagues, current.europeanLeagueDrift);
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
      europeanLeagueDrift: { ...current.europeanLeagueDrift },
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
    // Narratives Leihjahr (siehe loanStory.ts): eine der drei Leih-Entscheidungen
    // läuft NICHT über die generische `applyChoice` (Würfel + Momentum bestimmen
    // den Ausgang erst zur Laufzeit), sondern über die dedizierte
    // `applyLoanDecisionChoice`.
    const isLoanDecision = LOAN_DECISION_TEMPLATE_IDS.includes(game.currentEvent.templateId);

    let didTransfer = false;
    let endedStorylineTemplateIds: string[] = [];
    // "Heimkehrer" (siehe `ClubOfferResult.homecomingClubReturn`/`detectClubHomecoming`
    // in types.ts) - erzwingt unten das dedizierte Info-Event als NÄCHSTES Ereignis
    // direkt nach dem Wechsel-Feedback, dieselbe "erzwungenes Spezial-Event"-Weiche
    // wie beim Leihjahr/Rücktritt.
    let homecomingClubReturn = false;
    const feedback = isLoanDecision
      ? applyLoanDecisionChoice(player, game.seasonNumber, game.currentEvent.templateId, choice.id)
      : isClubOfferEvent(game.currentEvent.templateId)
      ? (() => {
          const oldClubId = player.club.clubId;
          const decisionCountBefore = player.transferDecisions.length;
          const result = applyClubOfferChoice(player, league, game.currentEvent!, choice.id, foreignLeagues);
          if (result.newActiveLeague) newActiveLeague = result.newActiveLeague;
          didTransfer = player.club.clubId !== oldClubId;
          endedStorylineTemplateIds = result.endedStorylineTemplateIds ?? [];
          homecomingClubReturn = result.homecomingClubReturn ?? false;
          // "Was das bedeutet" (siehe "CAREER NARRATIVE ... TECHNISCHE VERANKERUNG"
          // Abschnitt 12) - rein qualitativ, der tatsächliche Ausgang ist hier noch
          // nicht bekannt (siehe `TRANSFER_DECISION_MEANING`).
          if (player.transferDecisions.length > decisionCountBefore) {
            const justRecorded = player.transferDecisions[player.transferDecisions.length - 1];
            return {
              ...result.feedback,
              deltaLines: [...result.feedback.deltaLines, `Was das bedeutet: ${TRANSFER_DECISION_MEANING[justRecorded.type]}`],
            };
          }
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

    // Ein gerade erst akzeptiertes Leihangebot (reason "loan") startet den
    // exklusiven Leihjahr-Event-State: der Rest der Saison gehört ab jetzt
    // AUSSCHLIESSLICH den drei Leih-Entscheidungen - alle noch wartenden
    // "normalen" Saison-Events dieser Saison entfallen (siehe types.ts
    // `Player.loanNarrative`, Abschnitt "WICHTIG: LEIHJAHR IST EIN EXKLUSIVER
    // EVENT-STATE" der Feature-Vorgabe).
    const justStartedLoanNarrative =
      didTransfer &&
      game.currentEvent.templateId === clubOfferTemplateId("loan") &&
      player.loanNarrative !== null &&
      player.loanNarrative.decisions.length === 0;

    setGame({
      ...game,
      player: { ...player },
      leagueState: newActiveLeague ?? { ...league },
      foreignLeagues: { ...foreignLeagues },
      pendingEventIds: justStartedLoanNarrative
        ? [...LOAN_DECISION_TEMPLATE_IDS]
        : (() => {
            const rest = didTransfer
              ? game.pendingEventIds.filter((id) => !STALE_AFTER_TRANSFER_TEMPLATE_IDS.has(id) && !endedStorylineTemplateIds.includes(id))
              : game.pendingEventIds;
            // Heimkehr-Event ERSETZT einen der verbleibenden Saison-Slots statt sie
            // zu addieren (ADD-ON-Vorgabe "Heimkehrer" Abschnitt 8/23: "Heimkehrer-
            // Event ersetzt einen normalen nicht-garantierten Slot", strikt 3-5
            // Events/Saison). `insertWithinBudget` mit `maxTotal = rest.length` (der
            // Rest-Budget VOR der Einfügung) trimmt bei Bedarf das letzte verbleibende
            // Element - genau dasselbe "Trim-statt-Wachsen"-Prinzip wie beim
            // Saisonstart in `handleStartSeason`. Nur im seltenen Grenzfall, dass gar
            // keine Events mehr übrig sind (`rest.length === 0`), bleibt - wie dort
            // dokumentiert - ausnahmsweise ein zusätzliches Event stehen.
            return homecomingClubReturn ? insertWithinBudget(rest, HOMECOMING_TEMPLATE_ID, 0, new Set(), rest.length) : rest;
          })(),
      feedback,
    });
  }

  // Schritt 2: "Weiter" im Feedback -> je nach Event-Art passend weiterleiten.
  function handleFeedbackContinue() {
    if (!game.player || !game.currentEvent || !game.feedback) return;
    const isRetirementDecision = game.currentEvent.templateId === "retirement_decision";
    // Abschnitt 7+8: die "bleiben/zurück/abwarten"-Entscheidung nach dem
    // Leihjahr ist KEIN Teil einer laufenden Saison (die läuft bereits seit der
    // Saisonbilanz) - anders als jedes andere Event darf sie nach dem
    // Feedback NICHT `finishSeasonEvents` auslösen, sondern führt direkt
    // zurück ins Dashboard (dieselbe Weiche wie beim Rücktritts-Event).
    const isLoanFutureDecision = game.currentEvent.templateId === clubOfferTemplateId("loan-keep");
    // Wie `isLoanFutureDecision`: ein erzwungenes Spezial-Event NACH der
    // Saisonbilanz, kein Teil einer neuen laufenden Saison - darf nach dem
    // Feedback NICHT `finishSeasonEvents` erneut auslösen (siehe
    // `handleContinueFromSummary`).
    const isUnderdogCupEvent = game.currentEvent.templateId === UNDERDOG_CUP_TEMPLATE_ID;
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

    if (isLoanFutureDecision) {
      setGame({ ...game, player: { ...player }, currentEvent: null, feedback: null, screen: "dashboard" });
      return;
    }

    if (isUnderdogCupEvent) {
      if (shouldOfferRetirement(player)) {
        setGame({ ...game, player: { ...player }, currentEvent: buildRetirementEvent(player), feedback: null });
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
    // Abschnitt 7+8: nach der Saisonbilanz eines Leihjahres folgt zwingend die
    // Entscheidung über die Zukunft (Vertragsangebot des Leihvereins bzw.
    // Rückkehr zum Stammverein), bevor es überhaupt zur normalen Dashboard-/
    // Rücktritts-Weiche zurückgeht - derselbe "erzwungenes Spezial-Event"-
    // Mechanismus wie beim Rücktritts-Angebot unten.
    if (game.player.loanNarrative) {
      setGame({ ...game, currentEvent: buildLoanFutureEvent(game.player), feedback: null, screen: "event" });
      return;
    }
    // Außenseiter-Pokalsieg (siehe Bugreport + `UNDERDOG_CUP_TEMPLATE_ID` in
    // events.ts): erzwungen als letztes Ereignis GENAU der Saison, deren
    // Bilanz gerade angezeigt wurde (`game.lastSeasonStats`) - dieselbe
    // "erzwungenes Spezial-Event"-Weiche wie beim Leihjahr/Rücktritt oben.
    if (game.lastSeasonStats?.nationalCup?.champion && game.lastSeasonStats.nationalCup.underdog && game.leagueState) {
      const cupEvent = buildEventFromId(UNDERDOG_CUP_TEMPLATE_ID, game.player, game.leagueState, game.foreignLeagues);
      setGame({ ...game, currentEvent: cupEvent, feedback: null, screen: "event" });
      return;
    }
    if (shouldOfferRetirement(game.player)) {
      setGame({ ...game, currentEvent: buildRetirementEvent(game.player), feedback: null, screen: "event" });
    } else {
      setGame({ ...game, screen: "dashboard" });
    }
  }

  // "Neue Karriere starten" nach Karriereende führt zurück ins Titelmenü statt
  // direkt in die Länderauswahl - der reguläre Weg über 'title'/'slot-select'
  // entscheidet dann (Free-Tier-Bestätigungsdialog bzw. Slot-Auswahl bei Pass).
  function handleNewCareerAfterEnd() {
    goToTitle();
  }

  // Der "Return"-Button oben rechts fragt erst nach, statt die Karriere sofort zu
  // beenden - drei mögliche Wege aus dem Menü heraus:
  function handleEndCareerViewSummary() {
    if (!game.player) return;
    setShowEndCareerMenu(false);
    setGame({ ...game, ...buildCareerEndUpdate(game.player) });
  }

  function handleEndCareerStartNew() {
    const slotId = activeSlotId;
    setShowEndCareerMenu(false);
    if (slotId) deleteSlot(slotId);
    startNewCareerInSlot(slotId ?? "slot-1");
  }

  function handleCancelEndCareer() {
    setShowEndCareerMenu(false);
  }

  // Sichtbar, sobald ein Spieler existiert und noch nicht auf der Karriereende-
  // Übersicht steht (dort gibt es bereits einen eigenen "Neue Karriere"-Weg).
  const showReturnButton = game.player !== null && game.screen !== "careerEnd";

  const topRankingPreview = [...loadRankingArchive()].sort((a, b) => rankingScore(b) - rankingScore(a)).slice(0, 3);

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
      {overwriteTarget && (
        <OverwriteConfirmDialog
          playerName={overwriteTarget.playerName}
          onConfirm={handleConfirmOverwrite}
          onCancel={handleCancelOverwrite}
        />
      )}
      {import.meta.env.DEV && showDevDialog && (
        <DevPassDialog hasCareerPass={careerPass} onToggle={handleDevToggle} onClose={() => setShowDevDialog(false)} />
      )}
      {game.screen === "title" && (
        <TitleScreen
          hasSave={hasSaveOnDisk()}
          previewPlayer={getMostRecentSlot()?.state.player ?? null}
          hasCareerPass={careerPass}
          rankingPreview={topRankingPreview}
          onContinue={handleContinue}
          onNewCareer={handleGoToNewCareer}
          onViewLeaderboard={handleViewLeaderboard}
          onDevLongPress={() => setShowDevDialog(true)}
        />
      )}
      {game.screen === "slot-select" && (
        <SlotSelectScreen
          slots={listSlots()}
          slotLimit={slotLimit()}
          onSelectSlot={handleSelectSlot}
          onNewCareerInSlot={startNewCareerInSlot}
          onLockedTap={handlePaywallPlaceholder}
          onUpgrade={handlePaywallPlaceholder}
          onBack={goToTitle}
        />
      )}
      {game.screen === "leaderboard" && (
        <LeaderboardScreen entries={loadRankingArchive()} hasCareerPass={careerPass} onBack={goToTitle} onUpgrade={handlePaywallPlaceholder} />
      )}
      {game.screen === "country" && <SelectCountry onSelect={handleSelectCountry} onBack={handleBackFromCountry} />}
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
 * "Return"-Button, der die Karriere jederzeit vorzeitig beenden kann. Schreibt
 * bei JEDEM Karriereende zusätzlich einen Bestenlisten-Eintrag (siehe Handoff
 * Abschnitt 4: Tracking läuft immer, unabhängig vom Karriere-Pass-Status -
 * nur die spätere ANZEIGE ist gated). */
function buildCareerEndUpdate(player: NonNullable<GameState["player"]>): Partial<GameState> {
  player.retired = true;
  player.postCareerPath = pickPostCareerPath(player);
  const { score, tier, factors } = computeLegacy(player);
  const achievements = computeAchievements(player);
  addRankingEntry(buildRankingEntry(player, score));
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
