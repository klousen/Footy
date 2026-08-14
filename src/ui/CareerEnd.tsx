import type { Achievement, LegacyFactorGroup, Player } from "../engine/types";
import {
  buildClubTenures,
  careerClubChangeCount,
  careerPromotionCount,
  careerTitleCount,
  computeCareerNarrativeState,
  detectCareerPhenotype,
  isTeamTitle,
  overallRating,
} from "../engine/careerEngine";
import {
  ATTRIBUTE_LABEL,
  CAREER_PHENOTYPE_LABEL,
  describeCareerPhenotype,
  formatMoney,
  formatTrophyList,
  LEGACY_STUFEN,
  overallTier,
  RELATIONSHIP_LABEL,
  TRANSFER_DECISION_LABEL,
} from "./labels";
import { ShareCard } from "./ShareCard";
import { OverallScoreChart } from "./OverallScoreChart";

export function CareerEnd({
  player,
  legacyScore,
  legacyTier,
  legacyTierClassName,
  legacyGroups,
  careerTitle,
  achievements,
  epilogue,
  onNewCareer,
}: {
  player: Player;
  legacyScore?: number;
  /** Legacy-STUFE (reine Punktzahl-Einordnung, siehe `legacyStufeForScore`) - NICHT
   * das Hero-Badge, siehe `careerTitle` dafür. */
  legacyTier?: string;
  legacyTierClassName?: string;
  legacyGroups?: LegacyFactorGroup[];
  /** Der kriterienbasierte "Karriere-Titel" (siehe `chooseCareerTitle` in
   * careerEngine.ts) - das prominente Hero-Badge. */
  careerTitle?: { label: string; description: string };
  achievements?: Achievement[];
  epilogue?: string;
  onNewCareer: () => void;
}) {
  const t = player.careerTotals;
  const positiveAchievements = (achievements ?? []).filter((a) => a.positive);
  const negativeAchievements = (achievements ?? []).filter((a) => !a.positive);
  // Auszeichnungen als eigene Statistik-Zeile (siehe Handoff Abschnitt 1) - die
  // Trophäen-Liste selbst (Namen wie "Spieler der Saison") statt der Kapitänsbinde-
  // erweiterten Zahl aus `careerAwardCount` (die zählt die Kapitänsbinde zusätzlich
  // mit, hat aber keinen eigenen "Trophäen"-Namen zum Auflisten).
  const individualAwards = t.trophies.filter((tr) => !isTeamTitle(tr));
  const awardCount = individualAwards.length;
  const promotionCount = careerPromotionCount(player);
  const clubChanges = careerClubChangeCount(player);
  const clubTenures = buildClubTenures(player);
  // Für "Zugvogel"/JOURNEYMAN (siehe `describeCareerPhenotype`): Anzahl
  // UNTERSCHIEDLICHER Vereine, nicht Anzahl der Wechsel - aus den bereits
  // gebauten `clubTenures` abgeleitet statt `buildClubTenures` ein zweites Mal
  // aufzurufen (siehe `distinctClubCount` in careerEngine.ts für dieselbe Logik).
  const distinctClubs = new Set(clubTenures.map((t) => t.club)).size;
  const longestTenure =
    clubTenures.length > 0 ? clubTenures.reduce((best, t) => (t.seasons > best.seasons ? t : best)) : undefined;
  const titleCount = careerTitleCount(player);
  // Karriere-Bestwert für die Hero-Strip-Kachel (siehe Nachtrag "Hero-Strip") -
  // dieselbe Herleitung wie an den anderen Bestwert-Stellen der Engine
  // (`computeLegacy`/`chooseCareerTitle`/`detectCareerPhenotype`): Maximum aus
  // aktueller Gesamtstärke UND allen historischen Saison-Werten, falls der
  // Spieler nach dem Zenit noch abgebaut hat.
  const peakOverall = Math.max(overallRating(player), ...player.seasonHistory.map((s) => s.overallRating));
  const peakTier = overallTier(peakOverall);
  const peakGlow = peakTier.className === "elite" || peakTier.className === "icon" ? " glow" : "";
  const phenotypeCtx = { distinctClubs, longestTenure, titleCount };
  const totalMinutesPlayed = player.seasonHistory.reduce((s, h) => s + h.minutesPlayed, 0);
  const totalPossibleMinutes = player.seasonHistory.reduce((s, h) => s + h.possibleMinutes, 0);
  const isGoalkeeper = player.position === "TW";
  // Karriere-Paradenquote als Spiele-gewichteter Durchschnitt über alle Saisons
  // mit Einsätzen (siehe `SeasonStats.savePercentage`) - kein eigenes Career-
  // Totals-Feld nötig, da sich ein Prozentwert nicht sinnvoll aufsummieren lässt.
  const gkSeasons = player.seasonHistory.filter((h) => h.matches > 0);
  const careerSavePercentage =
    gkSeasons.length > 0
      ? Math.round(gkSeasons.reduce((s, h) => s + h.savePercentage * h.matches, 0) / gkSeasons.reduce((s, h) => s + h.matches, 0))
      : 0;

  // Karriere-Erzählzustand + Phänotyp - siehe "CAREER NARRATIVE & DECISION IMPACT
  // SYSTEM": rein abgeleitet aus bereits vorhandenen Daten, keine eigene Persistenz
  // (siehe `computeCareerNarrativeState`/`detectCareerPhenotype` in careerEngine.ts).
  const narrativeState = computeCareerNarrativeState(player);
  const phenotype = detectCareerPhenotype(player);
  // "Defining Moments" (siehe Vorgabe Abschnitt 27/18): kompakte, mit ECHTEN Daten
  // belegte Liste - abgeschlossene Narrative-Threads (`player.narrativeHistory`) +
  // explizite Ceiling Breaks (`player.ceilingBreaks`), chronologisch, auf 5 gedeckelt.
  const definingMoments = [
    ...player.narrativeHistory.map((h) => ({ season: h.season, age: h.age, label: h.label })),
    ...player.ceilingBreaks.map((c) => ({
      season: c.season,
      age: c.age,
      label: `Über das erwartete Limit hinaus (${ATTRIBUTE_LABEL[c.attribute]})`,
    })),
  ]
    .sort((a, b) => a.season - b.season)
    .slice(0, 5);

  return (
    <div className="screen career-end-screen">
      <div className="hero">
        <div className="hero-badge">🏁</div>
        <h1>Karriereende</h1>
        {/* Der prominente Hero-Badge ist der kriterienbasierte "Karriere-Titel"
            (siehe `chooseCareerTitle` in careerEngine.ts) - NICHT mehr die reine
            Punktzahl-Einordnung `legacyTier` (siehe Handoff "Karriereende-Logik neu
            gewichten" Abschnitt 6: "ein Publikumsliebling HAT ein Publikum"). Die
            Legacy-Stufe steht stattdessen klein direkt daneben in der Score-Zeile. */}
        {careerTitle && (
          <p className="legacy-tier" title={careerTitle.description}>
            {careerTitle.label}
          </p>
        )}
        {/* Ersetzt die frühere reine Fließtext-Zeile ("Legacy-Score: X · Stufe") -
            siehe Nachtrag "Hero-Strip": Bestwert/Legacy-Score/Titel-Auszeichnungen
            als dreispaltige Kachelzeile, 1:1 aus footca-karriereende-v4.html
            übernommen (nur Kachel 1 trägt eine Tier-Farbe). */}
        {legacyScore !== undefined && (
          <div className="hero-strip">
            <div>
              <div className={`v tier-${peakTier.className}${peakGlow}`}>{peakOverall}</div>
              <div className="l">Bestwert · {peakTier.label}</div>
            </div>
            <div>
              <div className="v">{legacyScore}</div>
              <div className="l">Legacy · {legacyTier}</div>
            </div>
            <div>
              <div className="v">
                {titleCount}
                <span style={{ fontSize: "19px", color: "var(--chalk-dim)" }}> / </span>
                {awardCount}
              </div>
              <div className="l">Titel / Auszeichn.</div>
            </div>
          </div>
        )}
      </div>

      <p className="epilogue">{epilogue}</p>

      <div className="panel">
        <h3>Karrierebogen</h3>
        <div className="phenotype-chips">
          <span
            className="phenotype-chip phenotype-chip-primary"
            title={describeCareerPhenotype(phenotype.primary, player, narrativeState, phenotypeCtx)}
          >
            {CAREER_PHENOTYPE_LABEL[phenotype.primary]}
          </span>
          {phenotype.secondary.map((p) => (
            <span key={p} className="phenotype-chip" title={describeCareerPhenotype(p, player, narrativeState, phenotypeCtx)}>
              {CAREER_PHENOTYPE_LABEL[p]}
            </span>
          ))}
        </div>
        {/* Begründung aus ECHTEN Karrieredaten statt generischem Boilerplate-Satz
            (siehe `describeCareerPhenotype` - Folgevorgabe "Transferentscheidungen:
            sichtbare Prognose + Narrative Integration" Abschnitt 9/10). */}
        <p className="muted">{describeCareerPhenotype(phenotype.primary, player, narrativeState, phenotypeCtx)}</p>
        {narrativeState.definingDecision && narrativeState.definingDecision.perfImpact !== null && (
          <p className="defining-decision">
            <strong>Prägende Entscheidung:</strong> {TRANSFER_DECISION_LABEL[narrativeState.definingDecision.type]} mit{" "}
            {narrativeState.definingDecision.age} Jahren ({narrativeState.definingDecision.fromClub} →{" "}
            {narrativeState.definingDecision.toClub}) -{" "}
            {narrativeState.definingDecision.perfImpact > 0
              ? "die Leistung entwickelte sich danach spürbar besser als erwartet."
              : "die Leistung fiel danach spürbar hinter die eigene Erwartung zurück."}
          </p>
        )}
        {definingMoments.length > 0 && (
          <>
            <p className="defining-moments-heading">Prägende Momente</p>
            <ol className="defining-moments-list">
              {definingMoments.map((m, i) => (
                <li key={i}>
                  <span className="defining-moment-age">{m.age} J.</span>
                  <span>{m.label}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      <ShareCard
        player={player}
        legacyScore={legacyScore}
        legacyTier={legacyTier}
        achievements={achievements}
        careerTitle={careerTitle}
      />

      <div className="panel">
        <h3>Karrierestatistik</h3>
        <div className="contract-grid">
          <span>Spiele</span>
          <span>{t.matches}</span>
          {isGoalkeeper ? (
            <>
              <span>Weiße Westen</span>
              <span>{t.cleanSheets}</span>
              <span>Gehaltene Bälle</span>
              <span>{careerSavePercentage}%</span>
              {t.penaltiesSaved > 0 && (
                <>
                  <span>Elfmeter gehalten</span>
                  <span>{t.penaltiesSaved}</span>
                </>
              )}
            </>
          ) : (
            <>
              <span>Tore</span>
              <span>{t.goals}</span>
              <span>Vorlagen</span>
              <span>{t.assists}</span>
              {(player.position === "IV" || player.position === "AV") && t.bigChancesPrevented > 0 && (
                <>
                  <span>Großchancen verhindert</span>
                  <span>{t.bigChancesPrevented}</span>
                </>
              )}
              {player.position === "ZM" && t.progressiveActions > 0 && (
                <>
                  <span>Ballgewinne & Pässe</span>
                  <span>{t.progressiveActions}</span>
                </>
              )}
            </>
          )}
          {/* "Titel" meint hier NUR echte Mannschaftstitel (siehe `isTeamTitle`) -
              Auszeichnungen (Torschützenkönig etc.) und Aufstiege stehen als eigene
              Zeilen daneben, statt in derselben Zahl mitgezählt zu werden (siehe
              Handoff "Karriereende-Logik neu gewichten" Abschnitt 1: "vier
              verschiedene Antworten auf die Frage 'wie viele Titel'"). */}
          <span>Titel</span>
          <span>{formatTrophyList(t.trophies.filter(isTeamTitle))}</span>
          <span>Auszeichnungen</span>
          <span className={awardCount === 0 ? "muted" : undefined}>{awardCount > 0 ? formatTrophyList(individualAwards) : "keine"}</span>
          <span>Aufstiege</span>
          <span className={promotionCount === 0 ? "muted" : undefined}>{promotionCount > 0 ? promotionCount : "keine"}</span>
          <span>Länderspiele</span>
          <span>
            {player.nationalTeamCaps}
            {player.nationalTeamGoals > 0 ? ` (${player.nationalTeamGoals} Tore)` : ""}
          </span>
          {totalPossibleMinutes > 0 && (
            <>
              <span>Einsatzminuten</span>
              <span>
                {totalMinutesPlayed.toLocaleString("de-DE")} / {totalPossibleMinutes.toLocaleString("de-DE")} Min. (
                {Math.round((totalMinutesPlayed / totalPossibleMinutes) * 100)}%)
              </span>
            </>
          )}
          <span>Karten</span>
          <span>
            {t.yellowCards}× Gelb, {t.redCards}× Rot
          </span>
          {/* Aus der Stationsliste abgeleitet (Stationen - 1), NICHT
              `player.clubChangesCount` - siehe `careerClubChangeCount` in
              careerEngine.ts: Karriereverlauf, Sharepic-Stationsliste und diese
              Zahl müssen immer exakt übereinstimmen (Handoff "Bug:
              Stationsgruppierung"). */}
          <span>Vereinswechsel</span>
          <span>{clubChanges}</span>
          <span>Privatleben</span>
          <span>
            {RELATIONSHIP_LABEL[player.relationshipStatus]}
            {player.children > 0 ? ` · ${player.children} Kind(er)` : ""}
          </span>
          <span>Vermögen</span>
          <span>{formatMoney(player.wealth)}</span>
        </div>
      </div>

      {/* Der komplette "Karriereverlauf"-Panel (Chart + Tier-Legende + Stationsliste
          mit OVR-Übergängen) ist Teil dieser einen Komponente (siehe Nachtrag
          "Karriereverlauf-Chart: Konzeptwechsel, nicht Anpassung") - im v4-Mockup
          EIN Panel statt zwei separater. */}
      <OverallScoreChart player={player} />

      {/* Drei Gruppen mit je eigener Obergrenze statt einer einzigen Flachliste
          (siehe Handoff "Karriereende-Logik neu gewichten" Abschnitt 2/3) - jede
          Gruppe zeigt ihre Zwischensumme, darunter die Legacy-Stufe (Punktzahl-
          Einordnung, siehe `legacyStufeForScore`) mit einer Skalenleiste, die alle
          sechs Stufen zeigt, nicht nur die erreichte. */}
      {legacyGroups && legacyGroups.length > 0 && (
        <div className="panel">
          <h3>Legacy-Score</h3>
          <p className="panel-note muted">Drei Gruppen, jede mit eigener Obergrenze. Maximal erreichbar sind 1800 Punkte.</p>
          {legacyGroups.map((g, gi) => (
            <div className="legacy-group" key={gi}>
              <div className="legacy-group-head">
                <span className="legacy-group-name">{g.label}</span>
                <span className="legacy-group-sub">
                  <b>{g.total}</b> / {g.max}
                </span>
              </div>
              {g.factors.map((f, i) => {
                // Balkenbreite: negative Werte (aktuell nur "Vereinstreue") skalieren
                // gegen die Untergrenze `f.min`, nicht gegen `f.max` (siehe
                // Nachtrag "Legacy-Score-Balken" + `ScoreFactor.min`-Dokumentation).
                const denom = f.points < 0 ? Math.abs(f.min ?? f.max ?? 0) : f.max ?? 0;
                const pct = denom > 0 ? Math.min(100, (Math.abs(f.points) / denom) * 100) : 0;
                return (
                  <div className="lg-row" key={i}>
                    <div className={`k${f.points === 0 ? " zero" : ""}`}>
                      {f.label}
                      {f.max !== undefined && <span className="legacy-factor-max"> ({f.max} max.)</span>}
                      {f.detail && <div className="sub">{f.detail}</div>}
                    </div>
                    <div className="lg-bar">
                      <i className={f.points < 0 ? "neg" : undefined} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`v ${f.points > 0 ? "pos" : f.points < 0 ? "neg" : "nil"}`}>
                      {f.points > 0 ? "+" : ""}
                      {f.points}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {legacyScore !== undefined && legacyTier && (
            <div className="legacy-total">
              <div className="legacy-total-name">
                {legacyTier}
                <small>Stufe {LEGACY_STUFEN.find((s) => s.label === legacyTier)?.index ?? "?"} von {LEGACY_STUFEN.length}</small>
              </div>
              <div className={`legacy-total-value tier-${legacyTierClassName ?? "amateur"}`}>
                {legacyScore}
                <small>von 1800</small>
              </div>
            </div>
          )}
          <div className="legacy-scale">
            {LEGACY_STUFEN.map((s) => (
              <div key={s.label} className={legacyTier === s.label ? `on tier-${s.className}` : undefined}>
                <span>{s.threshold}</span>
                {s.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {(positiveAchievements.length > 0 || negativeAchievements.length > 0) && (
        <div className="panel">
          <h3>Erfolge & Kapitel dieser Karriere</h3>
          <div className="achievement-grid">
            {positiveAchievements.map((a) => (
              <div key={a.id} className="achievement-badge positive">
                <strong>{a.label}</strong>
                <span>{a.description}</span>
              </div>
            ))}
            {negativeAchievements.map((a) => (
              <div key={a.id} className="achievement-badge negative">
                <strong>{a.label}</strong>
                <span>{a.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn-primary" onClick={onNewCareer}>
        Neue Karriere starten
      </button>
    </div>
  );
}
