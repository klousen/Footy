import type { ChoiceFeedback, EventChoice, GameEvent, OfferCardData, Player } from "../engine/types";
import { isClubOfferEvent } from "../engine/careerEngine";
import { CATEGORY_LABEL, formatMoney } from "./labels";
import { TacticalBoard } from "./TacticalBoard";

const KIND_ICON: Record<string, string> = {
  info: "ℹ️",
  positive: "✅",
  negative: "⚠️",
  milestone: "⭐",
};

export function EventCard({
  event,
  player,
  feedback,
  onChoose,
  onContinue,
}: {
  event: GameEvent;
  player: Player;
  feedback: ChoiceFeedback | null;
  onChoose: (choice: EventChoice) => void;
  onContinue: () => void;
}) {
  // Wechselangebote (siehe `isClubOfferEvent`) bekommen ein eigenes, scanbares
  // Kartenlayout statt der generischen Wahl-Buttons-Liste - siehe `OfferCard`
  // unten. NUR solange noch keine Entscheidung gefallen ist (die Rückmeldung
  // danach bleibt das normale `feedback-panel`) und solange mindestens eine
  // Karte tatsächlich strukturierte Daten mitbringt (siehe `OfferCardData`) -
  // `buildClubOfferEvent` befüllt das nicht für jeden club_offer-Reason (z.B.
  // Leih-Rückkehr/Verbleib-Entscheidung), die fallen sonst auf die klassische
  // Label/Detail-Darstellung zurück.
  const isOffer = isClubOfferEvent(event.templateId);
  const showOfferCards = isOffer && !feedback && event.choices.some((c) => c.offerCard);
  // Taktische Taktiktafel-Events (siehe `GameEvent.tactical`, "Handoff: Taktische
  // Entscheidungs-Events") - derselbe additive Zweig-Aufbau wie `showOfferCards`
  // oben: NUR solange noch keine Entscheidung gefallen ist, danach fällt der Code
  // ganz normal auf den klassischen Zweig samt bestehendem `.feedback-panel`
  // zurück (siehe Handoff §7 "Ergebnis-Screen folgt 1:1 dem bestehenden
  // Sofort-Feedback-Muster" - kein eigener Ergebnisbildschirm gebaut).
  const showTacticalBoard = !!event.tactical && !feedback && event.choices.some((c) => c.tacticalOption);

  return (
    <div className="screen event-screen">
      <div className="event-meta">
        <span className="event-category">{CATEGORY_LABEL[event.category] ?? event.category}</span>
        <span className="event-age">
          {player.name}, {player.age} Jahre
        </span>
      </div>
      {isOffer && player.contract.wagePerYear > 0 && (
        <div className="event-current-wage">
          Aktuelles Gehalt zum Vergleich: <strong>{formatMoney(player.contract.wagePerYear)}/Jahr</strong>
        </div>
      )}

      {showOfferCards ? (
        <div className="offer-screen-body">
          <h2>{event.title}</h2>
          {/* Kontext-Absatz bewusst nur EINMAL oben, nicht pro Karte wiederholt
              (siehe Bugreport: bisher stand derselbe Fließtext-Kontext implizit
              in jeder einzelnen Wahl). */}
          <p className="offer-context">{event.description}</p>
          <div className="offer-list">
            {event.choices.map((choice) =>
              choice.offerCard ? (
                <OfferCard key={choice.id} choice={choice} data={choice.offerCard} onChoose={onChoose} />
              ) : (
                <button key={choice.id} className="choice-btn" onClick={() => onChoose(choice)}>
                  <span className="choice-label">{choice.label}</span>
                  {choice.detail && <span className="choice-detail">{choice.detail}</span>}
                </button>
              )
            )}
          </div>
        </div>
      ) : (
        <div className="event-card">
          <h2>{event.title}</h2>
          <p>{event.description}</p>

          {showTacticalBoard && <TacticalBoard event={event} onChoose={onChoose} />}

          {!showTacticalBoard && !feedback && (
            <div className="event-choices">
              {event.choices.map((choice) => (
                <button key={choice.id} className="choice-btn" onClick={() => onChoose(choice)}>
                  <span className="choice-label">{choice.label}</span>
                  {choice.detail && <span className="choice-detail">{choice.detail}</span>}
                </button>
              ))}
            </div>
          )}

          {feedback && (
            <div className={`feedback-panel kind-${feedback.kind}`}>
              <div className="feedback-headline">
                <span className="feedback-icon">{KIND_ICON[feedback.kind] ?? "ℹ️"}</span>
                <span>{feedback.text}</span>
              </div>
              {feedback.deltaLines.length > 0 && (
                <ul className="feedback-deltas">
                  {feedback.deltaLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
              <button className="btn btn-primary" onClick={onContinue}>
                Weiter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Eine einzelne Wechselangebots-Karte (siehe `footy-karriere-mockup.html`
 * ".offer-card"/".offer-pills") - Vereinsname, Liga, ggf. Auslands-Badge und
 * ein 2x2-Pill-Grid mit Vereinsstärke (+Trend), Gehalt (+Differenz), Rolle/
 * Effekt und Typ. Die "Bleiben"-Variante (`data.isStay`) ist bewusst gleich
 * gestaltet wie die Wechselkarten (gleicher Rahmen/gleiche Textfarbe), nur die
 * Pill-Inhalte unterscheiden sich sinngemäß. */
function OfferCard({ choice, data, onChoose }: { choice: EventChoice; data: OfferCardData; onChoose: (choice: EventChoice) => void }) {
  const hasTrend = data.strengthPrev !== undefined && data.strengthPrev !== data.strength;
  // Zeigt die DIFFERENZ zum aktuellen Verein statt dessen absolutem Wert (siehe
  // Nutzer-Feedback: der bisherige Klammerwert "(63)" duplizierte den eigenen
  // Vereinswert, ohne dass auf einen Blick klar war, wie groß der Sprung
  // tatsächlich ist). Bewusst ohne Farbe/Pfeil - ein schwächerer Verein ist
  // nicht per se "negativ" (siehe Feedback), daher rein neutral als Vorzeichen-Zahl.
  const strengthDiff = hasTrend ? data.strength - (data.strengthPrev as number) : 0;

  return (
    <button type="button" className={`offer-card${data.isStay ? " stay" : ""}`} onClick={() => onChoose(choice)}>
      <div className="offer-head">
        <span className="offer-club">{data.headline}</span>
        {data.abroadFlag && (
          <span className="offer-abroad">
            {data.abroadFlag} Ausland
          </span>
        )}
      </div>
      <div className="offer-league">{data.league}</div>
      <div className="offer-pills">
        <div className="offer-pill">
          <div className="l">Vereinsstärke</div>
          <div className="v">
            {data.strength}
            {hasTrend && ` (${strengthDiff > 0 ? "+" : ""}${strengthDiff})`}
          </div>
        </div>
        <div className="offer-pill">
          <div className="l">Gehalt</div>
          <div className={data.wageDelta !== undefined && data.wageDelta > 0 ? "v salary-up" : "v"}>{formatMoney(data.wage)}</div>
          {data.wageDelta !== undefined && data.wageDelta !== 0 && (
            <div className={`sub ${data.wageDelta > 0 ? "sub-positive" : "sub-negative"}`}>
              {data.wageDelta > 0 ? "+" : ""}
              {formatMoney(data.wageDelta)}
            </div>
          )}
        </div>
        <div className="offer-pill">
          <div className="l">{data.isStay ? "Effekt" : "Rolle"}</div>
          <div className="v role-v">
            {data.roleTone && <span className={`role-status-light ${data.roleTone}`} aria-hidden="true" />}
            {data.roleLabel}
          </div>
          {data.roleSub && <div className="sub">{data.roleSub}</div>}
        </div>
        <div className="offer-pill">
          <div className="l">Typ</div>
          <div className="v">{data.typeLabel}</div>
        </div>
      </div>
    </button>
  );
}
