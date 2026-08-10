/** Reiner Dev-Dialog (siehe Handoff Abschnitt 3 "Dev-Toggle zum Testen") - per
 * Longpress auf den Titelmenü-Footer erreichbar, nur hinter `import.meta.env.DEV`
 * gerendert. Schreibt direkt `hasCareerPass` in storage.ts, kein Server-Call. Bewusst
 * nicht übersetzt (internes Test-Werkzeug, kein Nutzer-facing Text). */
export function DevPassDialog({
  hasCareerPass,
  onToggle,
  onClose,
}: {
  hasCareerPass: boolean;
  onToggle: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Dev-Werkzeug</h3>
        </div>
        <p className="muted">Karriere-Pass-Status lokal umschalten (nur Dev-Build, kein echter Kauf).</p>
        <div className="end-career-actions">
          <button className="btn btn-primary" onClick={() => onToggle(!hasCareerPass)}>
            Karriere-Pass (Dev): {hasCareerPass ? "AN" : "AUS"} - umschalten
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
