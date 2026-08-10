import { COUNTRIES, type CountryId } from "../engine/leagues";

export function SelectCountry({ onSelect, onBack }: { onSelect: (id: CountryId) => void; onBack: () => void }) {
  return (
    <div className="screen create-screen">
      <button type="button" className="btn btn-ghost btn-small back-link" onClick={onBack}>
        ← Zurück
      </button>
      <h2>In welchem Land beginnt deine Karriere?</h2>
      <p className="muted">
        Aktuell wählbar sind die zehn UEFA-Länder mit dem höchsten Länderkoeffizienten. Liga 1 und
        Liga 2 basieren auf den für die Saison 2026/27 aktiven Vereinen - dargestellt als
        Städtenamen. Am Saisonende steigen Vereine echtheitsgetreu auf und ab.
      </p>
      <div className="option-grid country-grid">
        {COUNTRIES.map((c) => (
          <button key={c.id} type="button" className="option-card" onClick={() => onSelect(c.id)}>
            <strong>
              <span className="flag">{c.flag}</span> {c.name}
            </strong>
            <span>
              {c.tier1Name} · {c.tier2Name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
