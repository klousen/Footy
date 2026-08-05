import type { StoryThread } from "../engine/types";

/** Zeigt laufende mehrjährige Ereignis-Reihen (siehe `StoryThread`) im Dashboard an. */
export function StoryThreads({ threads, seasonNumber }: { threads: StoryThread[]; seasonNumber: number }) {
  if (threads.length === 0) return null;
  return (
    <div className="panel">
      <h3>Laufende Geschichten</h3>
      <p className="muted trait-hint">
        Mehrjährige Ereignis-Reihen aus früheren Entscheidungen - die nächste Stufe wird garantiert ausgelöst,
        sobald sie fällig ist.
      </p>
      <ul className="story-thread-list">
        {threads.map((t) => {
          const seasonsLeft = t.dueSeason - seasonNumber;
          return (
            <li key={t.storylineId} className="story-thread-item">
              <span className="story-thread-label">📖 {t.label}</span>
              <span className="story-thread-progress">Kapitel {t.stage}/{t.totalStages}</span>
              <span className="story-thread-due">
                {seasonsLeft <= 0 ? "nächste Saison" : `in ${seasonsLeft} Saison(en)`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
