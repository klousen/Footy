import type { LoanNarrativeState, NarrativeTrend, Player, SeasonStats } from "../engine/types";
import { overallRatingFromAttributes } from "../engine/types";
import { computeCareerNarrativeState, overallRating } from "../engine/careerEngine";
import { computeLoanSummaryTier } from "../engine/loanStory";
import { describeSeasonNarrative, formatMoney, overallTier, turningPointForSeason, TREND_LABEL } from "./labels";
import { LeagueTableSnapshot } from "./LeagueTableSnapshot";
import { StatBox } from "./StatBox";

// Sparkline-Geometrie (siehe footy-karriere-mockup.html ".spark-svg", viewBox
// "0 0 200 30") - fixe Innenabstände, damit die Start-/End-Kreise (r=2.5) am
// Rand nicht abgeschnitten werden.
const SPARK_X0 = 4;
const SPARK_X1 = 196;
const SPARK_Y_TOP = 4;
const SPARK_Y_BOTTOM = 26;

/** Baut die Punkte einer Mehrjahres-Sparkline aus den rohen Werten - bewusst
 * PRO METRIK lokal auf min/max normalisiert (nicht auf eine feste absolute
 * Skala), damit auch kleine reale Schwankungen (z.B. Gesamtstärke 62→64)
 * sichtbar bleiben, statt in einer riesigen theoretischen Spannweite
 * unterzugehen. Bei identischen Werten (max===min) ergibt sich eine flache
 * Linie in der Mitte statt einer Division durch 0. */
function buildSparkline(values: number[]): { points: string; start: [number, number]; end: [number, number] } {
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const coords: [number, number][] = values.map((v, i) => {
    const x = n > 1 ? SPARK_X0 + ((SPARK_X1 - SPARK_X0) * i) / (n - 1) : (SPARK_X0 + SPARK_X1) / 2;
    const norm = span > 0 ? (v - min) / span : 0.5;
    const y = SPARK_Y_BOTTOM - norm * (SPARK_Y_BOTTOM - SPARK_Y_TOP);
    return [x, y];
  });
  return {
    points: coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
    start: coords[0],
    end: coords[coords.length - 1],
  };
}

const TREND_COLOR: Record<NarrativeTrend, string> = {
  rising: "var(--green)",
  falling: "#D98080",
  stable: "var(--gold-bright)",
};

const TREND_PILL_CLASS: Record<NarrativeTrend, string> = {
  rising: "pos",
  falling: "neg",
  stable: "zero",
};

/** Ein Verlaufsblock (Performance/Einsatzzeit/Gesamtstärke) im Saison-Bilanz-
 * Panel - Kopfzeile (Name + Skalen-Hinweis + Trend-Pill), echte Sparkline
 * statt Pfeil-Kette, Einzelwerte klein darunter. Siehe Bugreports "Das ist
 * intransparent" (Werte ohne Einordnung) und die Design-Vorgabe
 * "Positions-Badge & Saison-Bilanz" (einheitliche Trend-Darstellung). */
function TrendBlock({
  label,
  hint,
  trend,
  values,
  suffix = "",
}: {
  label: string;
  hint: string;
  trend: NarrativeTrend;
  values: number[];
  suffix?: string;
}) {
  const spark = buildSparkline(values);
  const color = TREND_COLOR[trend];
  return (
    <div className="trend-block">
      <div className="trend-head">
        <div>
          <span className="n">{label}</span> <span className="hint">{hint}</span>
        </div>
        <span className={`trend-pill ${TREND_PILL_CLASS[trend]}`}>{TREND_LABEL[trend]}</span>
      </div>
      <div className="spark-row">
        <svg className="spark-svg" viewBox="0 0 200 30" preserveAspectRatio="none">
          <polyline
            points={spark.points}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={spark.start[0]} cy={spark.start[1]} r="2.5" fill={color} />
          <circle cx={spark.end[0]} cy={spark.end[1]} r="2.5" fill={color} />
        </svg>
      </div>
      <div className="spark-vals">
        {values.map((v, i) => (
          <span key={i}>
            {v}
            {suffix}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SeasonSummary({
  stats,
  player,
  onContinue,
}: {
  stats: SeasonStats;
  player: Player;
  onContinue: () => void;
}) {
  const recentLog = player.log.slice(-4);
  // Die Alterung (siehe `ageUpPlayer`) ist zu diesem Zeitpunkt bereits auf
  // `player` angewendet (finishSeasonEvents ruft sie direkt nach simulateSeason
  // auf) - die aktuelle Gesamtstärke spiegelt also schon den Zuwachs/Abbau
  // dieser Saison wider. Als Vergleichswert bewusst NICHT `stats.overallRating`
  // nehmen: das wird erst innerhalb von `simulateSeason` erfasst, welches erst
  // NACH allen Entscheidungs-Events dieser Saison läuft (siehe `finishSeasonEvents`)
  // - Attributzuwachs durch Entscheidungen während der Saison wäre darin also
  // schon "eingepreist" und würde im Delta fehlen (z.B. +1 durch eine Trainings-
  // Entscheidung, danach 0 weiterer Zuwachs -> Delta zeigt fälschlich 0). Stattdessen
  // denselben echten Saisonbeginn-Snapshot wie die Attribut-Balken verwenden (siehe
  // `attributesAtSeasonStart`), damit Delta wirklich die GESAMTE Saison abdeckt -
  // bewusst dieselbe Formel wie Dashboards "trend"-Anzeige (siehe dort), damit die
  // beiden Bildschirme sich nicht scheinbar widersprechen.
  const currentOverall = overallRating(player);
  const seasonStartOverall = overallRatingFromAttributes(stats.attributesAtSeasonStart, player.position);
  const overallDelta = currentOverall - seasonStartOverall;
  const tier = overallTier(currentOverall);
  const isGoalkeeper = player.position === "TW";
  const isDefender = player.position === "IV" || player.position === "AV";
  const isMidfielder = player.position === "ZM";

  // Karrierebogen dieser Saison (siehe "CAREER NARRATIVE ... TECHNISCHE VERANKERUNG"
  // Abschnitt 13/14/15) - dieselbe Quelle (`computeCareerNarrativeState`) wie das
  // Dashboard, keine eigene vereinfachte Logik.
  const narrativeState = computeCareerNarrativeState(player);
  const seasonNarrative = describeSeasonNarrative(stats, narrativeState, player);
  const turningPoint = turningPointForSeason(player);
  const recentTrendSeasons = player.seasonHistory.slice(-4);

  return (
    <div className="screen summary-screen">
      <h2>{stats.seasonLabel} - Rückblick</h2>
      <p className="muted">
        {player.name} <span className="pos-badge">{player.position}</span> bei {stats.club} ({stats.leagueName})
      </p>

      {turningPoint && (
        <div className="turning-point-banner">
          <span className="turning-point-star">★</span>
          <span>{turningPoint}</span>
        </div>
      )}

      {/* Hero-Box für die Gesamtstärke (mit Trend-Pfeil + Tier), getrennt von den
          übrigen Werten - siehe footy-karriere-mockup.html ".hero-rating". */}
      <div className="hero-rating">
        <div className="num-block">
          <span className="num">{currentOverall}</span>
          {overallDelta !== 0 && (
            <span className={`trend ${overallDelta > 0 ? "up" : "down"}`}>
              {overallDelta > 0 ? "▲" : "▼"} {Math.abs(overallDelta)}
            </span>
          )}
        </div>
        <div className="tier-label">
          <div className="tier-name">{tier.label}</div>
          <div className="tier-sub">Gesamtstärke</div>
        </div>
      </div>

      {/* Primäre Reihe: die "Kopfzahlen" der Saison (Spiele + Torbeteiligung bzw. bei
          Torhütern die torwartspezifischen Pendants Weiße Westen/Gehaltene Bälle -
          siehe simulateSeason, dieselbe Ausnahme wie zuvor). */}
      <div className="stat-row-primary">
        <StatBox label="Spiele" value={String(stats.matches)} />
        {isGoalkeeper ? (
          <>
            <StatBox label="Weiße Westen" value={String(stats.cleanSheets)} />
            <StatBox label="Gehaltene Bälle" value={`${stats.savePercentage}%`} />
          </>
        ) : (
          <>
            <StatBox label="Tore" value={String(stats.goals)} />
            <StatBox label="Vorlagen" value={String(stats.assists)} />
          </>
        )}
      </div>

      {/* Sekundäre Reihe: unterstützende Werte, kleiner dargestellt - dieselben
          Bedingungen wie zuvor (Einsatzquote nur mit possibleMinutes, Länderspiele nur
          bei Einsätzen, Elfmeter gehalten nur bei Torhütern mit Wert > 0). Das Grid
          bricht bei mehr als 3 Kindern automatisch in weitere Zeilen um. */}
      <div className="stat-row-secondary">
        <StatBox label="Ø Bewertung" value={String(stats.avgRating)} />
        <StatBox label="Tabelle" value={`${stats.leaguePosition}.`} />
        {stats.possibleMinutes > 0 && (
          <StatBox
            label="Einsatzquote"
            value={`${Math.round((stats.minutesPlayed / stats.possibleMinutes) * 100)}%`}
            detail={`${stats.minutesPlayed}/${stats.possibleMinutes} Min.`}
          />
        )}
        <StatBox label="Einkommen" value={formatMoney(stats.income)} />
        {isGoalkeeper && stats.penaltiesSaved > 0 && (
          <StatBox label="Elfmeter gehalten" value={String(stats.penaltiesSaved)} />
        )}
        {isDefender && stats.bigChancesPrevented > 0 && (
          <StatBox label="Großchancen verhindert" value={String(stats.bigChancesPrevented)} />
        )}
        {isMidfielder && stats.progressiveActions > 0 && (
          <StatBox label="Ballgewinne & Pässe" value={String(stats.progressiveActions)} />
        )}
        {stats.capsThisSeason > 0 && (
          <StatBox label="Länderspiele" value={String(stats.capsThisSeason)} />
        )}
      </div>

      {stats.trophies.length > 0 && (
        <div className="banner banner-success">🏆 Gewonnen: {stats.trophies.join(", ")}</div>
      )}

      {stats.europeanCup && !stats.europeanCup.champion && (
        <div className="banner banner-info">
          🌍 {stats.europeanCup.competition === "CL" ? "Champions Cup" : "Europa Cup"}: Ausgeschieden{" "}
          {stats.europeanCup.stageReached === "Ligaphase" ? "in der Ligaphase" : `im ${stats.europeanCup.stageReached}`}
        </div>
      )}

      {stats.promoted && (
        <div className="banner banner-success">⬆️ {stats.club} steigt auf!</div>
      )}
      {stats.relegated && (
        <div className="banner banner-warning">⬇️ {stats.club} steigt ab.</div>
      )}

      {(stats.yellowCards > 0 || stats.redCards > 0) && (
        <p className="muted">
          Karten: {stats.yellowCards}× Gelb{stats.redCards > 0 ? `, ${stats.redCards}× Rot` : ""}
        </p>
      )}

      {stats.tableSnapshot.length > 0 && (
        <div className="panel">
          <h3>Tabelle</h3>
          <LeagueTableSnapshot rows={stats.tableSnapshot} />
        </div>
      )}

      {stats.newAchievements.length > 0 && (
        <div className="panel">
          <h3>🏅 Neue Erfolge dieser Saison</h3>
          <div className="achievement-grid">
            {stats.newAchievements.map((a) => (
              <div key={a.id} className={`achievement-badge ${a.positive ? "positive" : "negative"}`}>
                <strong>{a.label}</strong>
                <span>{a.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {player.loanNarrative && <LoanSeasonRecap narrative={player.loanNarrative} currentOverall={currentOverall} />}

      <div className="panel">
        <div className="score-header">
          <h3>Saison-Bilanz</h3>
          {/* Tier zuerst (der eigentlich verständliche Teil - Punktzahl allein hat
              keinen erkennbaren Referenzrahmen), Punktzahl nur noch als kleine,
              abgesetzte Zusatzangabe für alle, die die Rohzahl sehen wollen. Siehe
              Bugreport "OVR Score 64 ... Saisonbilanz 62 Pkt ... das ist verwirrend" -
              zwei gleich große Zahlen direkt nebeneinander lasen sich wie zwei
              konkurrierende Urteile, obwohl nur eines (OVR) wirklich für sich
              stehen kann. */}
          <span className="score-badge">
            {stats.scoreTier}
            <span className="score-badge-points"> · {stats.score} Pkt.</span>
          </span>
        </div>
        {seasonNarrative && (
          <p className="bilanz-lead">
            <b>{seasonNarrative.headline}</b> — {seasonNarrative.text}
          </p>
        )}
        <div className="bfactor-list">
          {stats.scoreFactors.map((f, i) => (
            <div className="bfactor-row" key={i}>
              <div>
                <div className="n">{f.label}</div>
                {f.detail && <div className="sub">{f.detail}</div>}
              </div>
              <span className={`delta ${f.points > 0 ? "pos" : f.points < 0 ? "neg" : "zero"}`}>
                {f.points > 0 ? "+" : ""}
                {f.points}
              </span>
            </div>
          ))}
        </div>
        {recentTrendSeasons.length >= 3 && (
          <>
            <div className="trend-section-label">
              Verlauf · Alter {recentTrendSeasons[0].age}–{recentTrendSeasons[recentTrendSeasons.length - 1].age}
            </div>
            <TrendBlock
              label="Performance"
              hint="(0-100 · 50 = Liga-Schnitt für deine Rolle)"
              trend={narrativeState.performanceTrend}
              values={recentTrendSeasons.map((s) => Math.round(s.performanceScore))}
            />
            <TrendBlock
              label="Einsatzzeit"
              hint="(Anteil deiner Teamminuten)"
              trend={narrativeState.playingTimeTrend}
              values={recentTrendSeasons.map((s) => Math.round((s.possibleMinutes > 0 ? s.minutesPlayed / s.possibleMinutes : 0) * 100))}
              suffix="%"
            />
            <TrendBlock
              label="Gesamtstärke"
              hint="(Skill-Rating 1-99)"
              trend={narrativeState.clubLevelTrend}
              values={recentTrendSeasons.map((s) => s.overallRating)}
            />
          </>
        )}
      </div>

      <div className="panel">
        <h3>Was sonst geschah</h3>
        <ul className="mini-log">
          {recentLog.map((entry, i) => (
            <li key={i}>{entry.text}</li>
          ))}
        </ul>
      </div>

      <button className="btn btn-primary" onClick={onContinue}>
        Weiter
      </button>
    </div>
  );
}

/**
 * Abschnitt 6 der Leihjahr-Vorgabe: die Saisonbilanz nach dem dritten
 * Ereignis. Zeigt AUSSCHLIESSLICH tatsächliche Werte - die Bewertung
 * (BREAKOUT/ETABLIERT/...) ergibt sich rein rechnerisch aus den drei echten
 * Würfel-Ergebnissen (siehe `computeLoanSummaryTier`), die Attribut-/
 * Gesamtstärke-Veränderung ist der reale Vorher-/Nachher-Vergleich (siehe
 * `attributesAtLoanStart`/`overallAtLoanStart`) - nichts davon wird erfunden.
 * Spiele/Tore/Vorlagen/Einsatzquote stehen bereits in den Stat-Boxen oben,
 * hier geht es gezielt um das, was NUR die Leihe betrifft.
 */
function LoanSeasonRecap({ narrative, currentOverall }: { narrative: LoanNarrativeState; currentOverall: number }) {
  const tier = computeLoanSummaryTier(narrative.decisions.map((d) => d.modifiedRoll));
  const overallDelta = currentOverall - narrative.overallAtLoanStart;

  return (
    <div className="panel">
      <div className="score-header">
        <h3>📋 Leihjahr bei {narrative.loanClubName}</h3>
        <span className="score-badge">
          {tier.emoji} {tier.label}
        </span>
      </div>
      <p className="muted">
        {narrative.reasonTitle} - {tier.description}
        {overallDelta !== 0 && ` Gesamtstärke ${overallDelta > 0 ? "+" : ""}${overallDelta}.`}
      </p>
      <ul className="score-factors">
        {narrative.decisions.map((d, i) => (
          <li key={i}>
            <span>
              {d.decisionTitle}: {d.choiceLabel}
            </span>
            <span>
              🎲{d.modifiedRoll} {d.momentumEmoji}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

