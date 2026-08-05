import type { Player } from "../engine/types";

const KIND_ICON: Record<string, string> = {
  info: "•",
  positive: "▲",
  negative: "▼",
  milestone: "★",
};

export function Timeline({ player, onClose }: { player: Player; onClose: () => void }) {
  const entries = [...player.log].reverse();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Karriereverlauf</h3>
          <button className="btn btn-ghost btn-small" onClick={onClose}>
            Schließen
          </button>
        </div>
        <div className="timeline-list">
          {entries.map((entry, i) => (
            <div className={`timeline-entry kind-${entry.kind}`} key={i}>
              <span className="timeline-icon">{KIND_ICON[entry.kind]}</span>
              <span className="timeline-age">Alter {entry.age}</span>
              <span className="timeline-text">{entry.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
