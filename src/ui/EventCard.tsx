import type { EventChoice, GameEvent, Player } from "../engine/types";
import { CATEGORY_LABEL } from "./labels";

export function EventCard({
  event,
  player,
  onChoose,
}: {
  event: GameEvent;
  player: Player;
  onChoose: (choice: EventChoice) => void;
}) {
  return (
    <div className="screen event-screen">
      <div className="event-meta">
        <span className="event-category">{CATEGORY_LABEL[event.category] ?? event.category}</span>
        <span className="event-age">
          {player.name}, {player.age} Jahre
        </span>
      </div>
      <div className="event-card">
        <h2>{event.title}</h2>
        <p>{event.description}</p>
        <div className="event-choices">
          {event.choices.map((choice) => (
            <button key={choice.id} className="choice-btn" onClick={() => onChoose(choice)}>
              <span className="choice-label">{choice.label}</span>
              {choice.detail && <span className="choice-detail">{choice.detail}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
