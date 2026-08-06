// Bestätigungs-Menü für den "Return"-Button oben rechts: bricht die laufende
// Karriere nicht sofort ab, sondern fragt erst, wie es weitergehen soll - direkt
// in die Karriereübersicht springen, eine ganz neue Karriere beginnen, oder die
// aktuelle Karriere einfach fortsetzen (Abbruch der Abfrage, nichts ändert sich).
export function EndCareerMenu({
  onViewSummary,
  onNewCareer,
  onCancel,
}: {
  onViewSummary: () => void;
  onNewCareer: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Karriere beenden?</h3>
        </div>
        <p className="muted">Wie möchtest du fortfahren?</p>
        <div className="end-career-actions">
          <button className="btn btn-primary" onClick={onViewSummary}>
            Karriere beenden und Übersicht ansehen
          </button>
          <button className="btn btn-secondary" onClick={onNewCareer}>
            Neue Karriere starten
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>
            Zurück zur aktuellen Karriere
          </button>
        </div>
      </div>
    </div>
  );
}
