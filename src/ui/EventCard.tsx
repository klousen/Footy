import type { ChoiceFeedback, EventChoice, GameEvent, Player } from "../engine/types";
import { isClubOfferEvent } from "../engine/careerEngine";
import { CATEGORY_LABEL, formatMoney } from "./labels";

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
  return (
    <div className="screen event-screen">
      <div className="event-meta">
        <span className="event-category">{CATEGORY_LABEL[event.category] ?? event.category}</span>
        <span className="event-age">
          {player.name}, {player.age} Jahre
        </span>
      </div>
      {isClubOfferEvent(event.templateId) && player.contract.wagePerYear > 0 && (
        <div className="event-current-wage">
          Aktuelles Gehalt zum Vergleich: <strong>{formatMoney(player.contract.wagePerYear)}/Jahr</strong>
        </div>
      )}
      <div className="event-card">
        <h2>{event.title}</h2>
        <p>{event.description}</p>

        {!feedback && (
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
    </div>
  );
}
