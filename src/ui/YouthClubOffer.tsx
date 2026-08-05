import type { ClubState, LeagueState } from "../engine/types";

function flavorFor(strength: number): string {
  if (strength >= 50) return "Ambitionierte Akademie mit guter Infrastruktur - dafür mehr Konkurrenz um Kaderplätze.";
  if (strength >= 40) return "Solide Adresse mit ausgewogenen Perspektiven.";
  return "Kleinerer Verein - dafür realistische Chancen auf schnelle Einsätze.";
}

export function YouthClubOffer({
  playerName,
  league,
  offers,
  onSelect,
}: {
  playerName: string;
  league: LeagueState;
  offers: ClubState[];
  onSelect: (clubId: string) => void;
}) {
  return (
    <div className="screen create-screen">
      <h2>Drei Vereine wollen dich</h2>
      <p className="muted">
        {playerName}s Talent hat sich herumgesprochen: Gleich drei Jugendakademien in {league.flag}{" "}
        {league.countryName} bieten einen Platz an. Für welchen Verein entscheidest du dich?
      </p>
      <div className="club-offer-list">
        {offers.map((c) => (
          <button key={c.id} type="button" className="club-offer-card" onClick={() => onSelect(c.id)}>
            <div className="club-offer-head">
              <strong>{c.city}</strong>
              <span className="club-offer-strength">Stärke {c.strength}</span>
            </div>
            <span className="muted">{league.tier2Name}</span>
            <span className="club-offer-flavor">{flavorFor(c.strength)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
