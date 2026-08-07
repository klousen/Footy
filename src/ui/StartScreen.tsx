export function StartScreen({
  hasSave,
  onNewGame,
  onContinue,
}: {
  hasSave: boolean;
  onNewGame: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="screen start-screen">
      <div className="hero">
        <div className="hero-badge">⚽</div>
        <h1>Footca</h1>
        <p className="hero-tagline">Football Career</p>
        <p className="hero-sub">
          Erlebe eine komplette Fußballkarriere - vom 14-jährigen Talent in der Jugendakademie bis zum
          Karriereende. Triff echte Entscheidungen: Training, Alltag, Verträge, Transfers, Sponsoren und
          entscheidende Spielmomente.
        </p>
      </div>
      <div className="start-actions">
        {hasSave && (
          <button className="btn btn-primary" onClick={onContinue}>
            Karriere fortsetzen
          </button>
        )}
        <button className={hasSave ? "btn btn-secondary" : "btn btn-primary"} onClick={onNewGame}>
          Neue Karriere starten
        </button>
      </div>
    </div>
  );
}
