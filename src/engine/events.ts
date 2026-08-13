import type { AttributeKey, EventChoice, EventTemplate, Player, RelationshipStatus } from "./types";
import { detectClubHomecoming, isNearRetirement, overallRatingFromAttributes } from "./types";
import { clamp, FEMALE_FIRST_NAMES, FIRST_NAMES, LAST_NAMES } from "./data";
import { LOAN_DECISIONS } from "./loanStory";
// `ATTRIBUTE_LABEL` kommt aus labels.ts (nur Typ-Importe aus ./types, keine
// Rückabhängigkeit auf events.ts/careerEngine.ts - kein Zirkel).
import { ATTRIBUTE_LABEL, formatMoney } from "./labels";
// investments.ts importiert seinerseits nur aus ./types/./data/./labels - keine
// Rückabhängigkeit auf events.ts/careerEngine.ts, also unbedenklich hier
// importierbar (siehe Vorgabe "Investments können zusätzlich aus passenden
// Events heraus angeboten werden").
import { availableInvestmentIds, investmentCost } from "./investments";

/** Sommerpause-Event (siehe Template weiter unten) - wird NIE über die normale
 * Gewichtungs-Auswahl gezogen, sondern von App.tsx `handleStartSeason` explizit
 * als LETZTES Ereignis jeder Saison angehängt. Als Konstante exportiert, damit
 * App.tsx nicht denselben String-Literal duplizieren muss. */
export const VACATION_TEMPLATE_ID = "urlaub_sommerpause";

/** Landespokalsieg-Feier-Event - wird NIE über die normale Gewichtungs-Auswahl
 * gezogen, sondern von App.tsx `handleContinueFromSummary` explizit als letztes
 * Ereignis GENAU DER Saison erzwungen, in der der Pokal tatsächlich gewonnen
 * wurde (siehe dortiger Kommentar). Deckt seit dem Nutzer-Feedback "keine eigene
 * Pop-up-Animation beim Landespokal-Gewinn" JEDEN Pokalsieg ab, nicht mehr nur
 * den Außenseiter-Coup (siehe `buildNationalCupWinEvent` in careerEngine.ts, wo
 * das Event tatsächlich gebaut wird - hier nur die ID als geteilte Konstante,
 * damit App.tsx keinen eigenen String-Literal dupliziert). */
export const NATIONAL_CUP_WIN_TEMPLATE_ID = "landespokal_sieg";

/** Meisterschafts-Feier-Event (Meisterschale/Zweitliga-Meisterschaft) - dasselbe
 * "erzwungenes Spezial-Event nach der Saisonbilanz"-Muster wie
 * `NATIONAL_CUP_WIN_TEMPLATE_ID` (siehe dort), nur für den Liga-Titel statt des
 * Pokals. Gebaut in `buildLeagueTitleWinEvent` (careerEngine.ts) - hier nur die
 * ID als geteilte Konstante. */
export const LEAGUE_TITLE_WIN_TEMPLATE_ID = "meisterschaft_sieg";

/** "Heimkehrer"-Info-Event (siehe Template weiter unten) - wird NIE über die
 * normale Gewichtungs-Auswahl gezogen, sondern von App.tsx `handleChoice` direkt
 * nach einem echten Wechsel erzwungen, wenn `applyClubOfferChoice` eine Heimkehr
 * erkannt hat (siehe `ClubOfferResult.homecomingClubReturn`, `detectClubHomecoming`
 * in types.ts). Als Konstante exportiert, damit App.tsx nicht denselben
 * String-Literal dupliziert. */
export const HOMECOMING_TEMPLATE_ID = "heimkehr_verein";

// Hilfsfunktion für lesbaren Vereinsnamen im Text
const club = (p: Player) => p.club.name;

/**
 * Passende Trennungs-Sprache je nach Beziehungsstatus VOR der Trennung (siehe
 * Nutzer-Feedback: "hat sich getrennt" liest sich bei Verheirateten/Verlobten
 * falsch) - eine Ehe endet in einer Scheidung, eine Verlobung wird gelöst, nur
 * eine "normale" Beziehung wird schlicht beendet. Nimmt bewusst den Status VOR
 * dem Effekt entgegen (`p.relationshipStatus` beim `build()`-Aufruf, also vor
 * `relationshipStatus: "single"`), nicht danach.
 */
function breakupPastPhrase(status: RelationshipStatus): string {
  if (status === "verheiratet") return "hat sich scheiden lassen";
  if (status === "verlobt") return "hat die Verlobung gelöst";
  return "hat sich getrennt";
}
/** Wie `breakupPastPhrase`, aber mit Partnernamen eingebettet (für Sätze wie
 * "hat sich von X getrennt"/"hat die Verlobung mit X gelöst"). */
function breakupFromPhrase(status: RelationshipStatus, name: string): string {
  if (status === "verheiratet") return `hat sich von ${name} scheiden lassen`;
  if (status === "verlobt") return `hat die Verlobung mit ${name} gelöst`;
  return `hat sich von ${name} getrennt`;
}

// Hilfsfunktion: zufälliger Vorname für neue Beziehungen. Der Spieler selbst
// wird immer mit einem Namen aus FIRST_NAMES erzeugt (siehe `createPlayer`) -
// da die allermeisten Spieler also männlich sind und heterosexuelle
// Beziehungen der Normalfall sind, bekommt der Partner/die Partnerin ganz
// überwiegend einen weiblichen Namen. Bewusst auf 2% (statt der ursprünglich
// gedachten 5%) gesenkt: über eine ganze Karriere hinweg kann "erste_liebe"/
// "beziehung_neu" mehrfach feuern (z.B. nach einer Trennung), wodurch sich
// mehrere unabhängige 5%-Würfe schon innerhalb einer einzigen Karriere spürbar
// zu oft zu mindestens einem männlichen Partnernamen aufsummierten.
function randomPartnerName(rng: () => number): string {
  const pool = rng() < 0.02 ? FIRST_NAMES : FEMALE_FIRST_NAMES;
  return pool[Math.floor(rng() * pool.length)];
}

// Hilfsfunktion: zufällige Ganzzahl in [min, max] - für variablen Effekt-Impact
// (dieselbe Entscheidung soll sich nicht jedes Mal exakt gleich anfühlen).
function rInt(ctx: { rng: () => number }, min: number, max: number): number {
  return min + Math.floor(ctx.rng() * (max - min + 1));
}

// Hilfsfunktion: zufällige Text-Variante aus einer Liste wählen - für sehr häufig
// gezogene Events (mehrfach pro Karriere, siehe Bugreport "Repetition"), deren
// Titel/Beschreibung sonst jedes Mal wortgleich wäre. Bewusst NUR Text-Varianz,
// keine neuen Effekte/Entscheidungen - reine Abwechslung, keine Spiellogik-Änderung.
function pickVariant<T>(ctx: { rng: () => number }, options: readonly T[]): T {
  return options[Math.floor(ctx.rng() * options.length)];
}

/** Wahrscheinlichkeit einer Nationalmannschafts-Berufung DIESE Saison - siehe
 * ausführlichen Kommentar bei `nationalmannschaft_einladung`. Per Monte-Carlo-
 * Simulation über ein ~20-saisonales Länderspiel-Fenster kalibriert: Gesamtstärke
 * 50 bleibt praktisch chancenlos (Ø 1 Karriere-Cap), 70 ergibt eine solide,
 * aber nicht übermächtige Nebenkarriere (Ø ~19), 90 einen echten Stammspieler
 * der Nationalelf (Ø ~62), 95+ einen ernsthaften Kandidaten für die 100-Cap-Marke
 * (Ø ~105) - "Wunderkind"-Bereich statt Standard-Verlauf.
 */
function nationalTeamCallUpChance(overall: number, tier: 1 | 2, established: boolean, candidacySeasons = 0): number {
  const base = clamp((overall - 52) / 42, 0.02, 0.97);
  const tierFactor = tier === 1 ? 1 : 0.3;
  const establishedBonus = established ? 0.15 : 0;
  // Snub-Streak-Bonus (siehe `Player.nationalTeamCandidacySeasons`, "CAREER NARRATIVE
  // ... TECHNISCHE VERANKERUNG" Abschnitt 19/20): wächst mit jeder weiteren
  // aufeinanderfolgenden "würdigen" Saison OHNE Berufung, gedeckelt bei +0.5 - ein
  // dauerhaft verdienter Spieler bleibt so NICHT unbegrenzt vom reinen Zufall
  // abhängig, ohne dass eine Berufung je auf 100% garantiert würde. Bei
  // `candidacySeasons = 0` (Normalfall) exakt die vorherige, kalibrierte Formel.
  const streakBonus = clamp(candidacySeasons * 0.06, 0, 0.5);
  return clamp(base * tierFactor + establishedBonus + streakBonus, 0.02, 0.98);
}

// Frühestes typisches Heiratsalter, gekoppelt an Bildung: wer viel in Bildung
// investiert hat, heiratet im Schnitt später (Karrierefokus/späterer Weg),
// wer wenig investiert hat, eher früher - Anfang 20 bleibt möglich, aber die
// Ausnahme statt die Regel. Analog für Nachwuchs (siehe `kind_geboren`).
function minMarriageAge(education: number): number {
  if (education >= 65) return 27;
  if (education <= 35) return 20;
  return 23;
}

// Hilfsfunktion: zufälliger voller Name für Storyline-Nebenfiguren (z.B. Rivalen)
function randomFullName(rng: () => number): string {
  return `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
}

// Hilfsfunktion: true, wenn der Spieler höchstens eine abgeschlossene Saison beim
// AKTUELLEN Verein hat - d.h. gerade erst gewechselt ist und sich noch in der
// frühen Eingewöhnungsphase befindet. Basis für Ankunfts-/Eingewöhnungs-Events
// nach einem Transfer (siehe z.B. "vertrag_neuankunft_schwierig",
// "beziehung_familie_umzug"). Bewusst über abgeschlossene Saisons gezählt (nicht
// "seasonHistory letzter Eintrag != aktueller Verein"): Die Events für eine Saison
// werden alle VOR etwaigen Wechseln in dieser Saison ausgewählt (siehe
// `pickSeasonTemplateIds`), und `simulateSeason` trägt den bereits aktualisierten
// Verein in den Saisoneintrag ein - direkt nach einem Wechsel wäre der letzte
// Eintrag daher fälschlich schon der NEUE Verein, ein reiner Vergleich mit dem
// letzten Eintrag würde das Fenster praktisch nie treffen.
function recentlyTransferred(p: Player): boolean {
  let seasonsAtCurrentClub = 0;
  for (let i = p.seasonHistory.length - 1; i >= 0; i--) {
    if (p.seasonHistory[i].club !== p.club.name) break;
    seasonsAtCurrentClub++;
  }
  return seasonsAtCurrentClub <= 1;
}

// Hilfsfunktion: Europapokal-Ergebnis der zuletzt abgeschlossenen Saison (siehe
// `europeanCup.ts`/`SeasonStats.europeanCup`) - `null`, wenn nicht qualifiziert
// oder noch keine Saison gespielt. Basis für alle "europapokal_*"-Events unten:
// die Qualifikation selbst (unabhängig vom Ausgang) UND ein tatsächlicher Titel
// sind zwei unterschiedliche, klar getrennte Auslöser.
function lastEuropeanCup(p: Player) {
  return p.seasonHistory[p.seasonHistory.length - 1]?.europeanCup ?? null;
}

function europeanCompetitionName(competition: "CL" | "EL"): string {
  return competition === "CL" ? "Champions Cup" : "Europa Cup";
}

/**
 * Erfolgschance für die "aktiv gegenhalten"-Option im garantierten Reaktions-
 * Event "taktik_kaderrolle_verteidigen" (siehe `decideRoleChallengeInjection`
 * in careerEngine.ts) - bewusst NICHT die sonst im Spiel übliche feste Zahl
 * (Bugreport "wenn das Spiel mir sagt ich bekomme weniger Spielzeit, kann ich
 * aktiv nichts dagegen tun"): verknüpft die Chance mit Auftreten im Gespräch
 * (Charisma + Mentalität), Standfestigkeit im Konflikt (Führungsstärke), dem
 * bisherigen Vereinsverhältnis UND einem "Vertrauensvorschuss" durch die
 * zuletzt gezeigte sportliche Leistung (Ø-Bewertung der letzten Saison) - wer
 * zuletzt gut gespielt hat, hat spürbar bessere Karten als jemand mit
 * identischem Charakter, aber schwacher Form. Bewusst weiterhin GEKAPPT
 * (15-85%) - nie ein Selbstläufer, nie aussichtslos, Gegenwind bleibt Teil
 * des Spiels.
 */
function roleChallengeSuccessChance(p: Player): number {
  const base = 0.35;
  const lastStats = p.seasonHistory[p.seasonHistory.length - 1];
  const formBonus = lastStats ? (lastStats.avgRating - 6.0) * 0.035 : 0;
  const presenceBonus = ((p.attributes.charisma - 50 + (p.attributes.mentalitaet - 50)) / 2 / 100) * 0.35;
  const leadershipBonus = ((p.traits.fuehrung - 50) / 100) * 0.25;
  const relationBonus = ((p.clubRelation - 50) / 100) * 0.15;
  return clamp(base + formBonus + presenceBonus + leadershipBonus + relationBonus, 0.15, 0.85);
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  // ---------------------------------------------------------------------
  // JUGEND (14-17)
  // ---------------------------------------------------------------------
  {
    id: "jugend_schule",
    category: "jugend",
    minAge: 14,
    maxAge: 17,
    weight: 3,
    build: (p) => ({
      category: "jugend",
      title: "Schule oder Fußball?",
      description: `Deine Lehrer verlangen mehr Einsatz in der Schule, während der Trainer von ${club(p)} zusätzliche Extra-Einheiten anbietet. Wie teilst du deine Zeit ein?`,
      choices: [
        {
          id: "schule",
          label: "Schwerpunkt Schule",
          detail: "Bessere Bildung, aber weniger Trainingszeit.",
          effects: { educationPoints: 12, attributes: { intelligenz: 1 }, fitness: -2, logText: "hat sich auf die Schule konzentriert.", logKind: "info" },
        },
        {
          id: "balance",
          label: "Beides unter einen Hut bringen",
          detail: "Solide, aber unspektakuläre Entwicklung.",
          effects: { educationPoints: 5, attributes: { technik: 1 }, logText: "hat Schule und Training ausbalanciert.", logKind: "info" },
        },
        {
          id: "fussball",
          label: "Voll auf Fußball fokussieren",
          detail: "Schnellerer sportlicher Fortschritt, Bildung leidet.",
          effects: { attributes: { technik: 2, physis: 1 }, educationPoints: -4, logText: "hat alles auf die Fußballkarriere gesetzt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "jugend_probetraining",
    category: "jugend",
    minAge: 16,
    maxAge: 17,
    weight: 2,
    unique: true,
    build: () => ({
      category: "jugend",
      title: "Einladung zum Sichtungstraining",
      description: `Ein renommierter Nachwuchsverein möchte dich zu einem Probetraining einladen. Nimmst du die weite Anreise auf dich?`,
      choices: [
        {
          id: "ja",
          label: "Hinfahren und zeigen, was du kannst",
          effects: { attributes: { mentalitaet: 1 }, reputation: 3, logText: "hat bei einem Sichtungstraining überzeugt.", logKind: "positive" },
        },
        {
          id: "nein",
          label: "Lieber beim Heimatverein bleiben",
          effects: { clubRelation: 4, morale: 3, logText: "ist dem Heimatverein treu geblieben.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "jugend_mannschaftskapitaen",
    category: "jugend",
    minAge: 15,
    maxAge: 17,
    weight: 2,
    build: () => ({
      category: "jugend",
      title: "Streit in der Kabine",
      description: `Zwei Mitspieler der Jugendmannschaft geraten in einen heftigen Streit. Als talentierter Spieler wirst du gefragt, wie es weitergehen soll.`,
      choices: [
        {
          id: "schlichten",
          label: "Schlichten und Ruhe reinbringen",
          effects: { attributes: { mentalitaet: 1, charisma: 1 }, clubRelation: 2, traitDeltas: { fuehrung: 3 }, logText: "hat als Streitschlichter überzeugt.", logKind: "positive" },
        },
        {
          id: "raushalten",
          label: "Sich raushalten",
          effects: { logText: "hat sich aus dem Streit rausgehalten.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "jugend_wachstumsschub",
    category: "jugend",
    minAge: 14,
    maxAge: 17,
    weight: 2,
    build: () => ({
      category: "jugend",
      title: "Wachstumsschub",
      description: "Du bist in den letzten Monaten deutlich gewachsen und musst dich an deinen neuen Körper gewöhnen.",
      choices: [
        {
          id: "koordination",
          label: "Extra Koordinationstraining einlegen",
          effects: { attributes: { technik: 1, physis: 1 }, fitness: -3, logText: "hat den Wachstumsschub mit Zusatztraining kompensiert.", logKind: "info" },
        },
        {
          id: "ruhe",
          label: "Dem Körper Zeit geben",
          effects: { fitness: 4, attributes: { physis: 1 }, logText: "hat sich Zeit gegeben, um sich zu entwickeln.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "jugend_erstvertrag_akademie",
    category: "meilenstein",
    minAge: 16,
    maxAge: 17,
    weight: 3,
    unique: true,
    build: (p) => ({
      category: "meilenstein",
      title: "Erster Ausbildungsvertrag",
      description: `${club(p)} bietet dir deinen ersten offiziellen Vertrag als Ausbildungsspieler an. Ein großer Schritt!`,
      choices: [
        {
          id: "unterschreiben",
          label: "Unterschreiben",
          effects: { morale: 8, reputation: 4, wealth: 2000, logText: "hat den ersten Ausbildungsvertrag unterschrieben.", logKind: "milestone" },
        },
      ],
    }),
  },
  {
    id: "jugend_turnierfahrt",
    category: "jugend",
    minAge: 15,
    maxAge: 17,
    weight: 1.4,
    build: (p) => ({
      category: "jugend",
      title: "Auswärtsfahrt zum Jugendturnier",
      description: `Die Jugendmannschaft von ${club(p)} fährt zu einem großen internationalen Nachwuchsturnier - eine seltene Chance, sich vor Scouts zu zeigen.`,
      choices: [
        {
          id: "beweisen",
          label: "Sich unbedingt beweisen wollen",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { reputation: 5, attributes: { technik: 1 }, logText: "hat sich beim Jugendturnier vor den Scouts glänzend präsentiert.", logKind: "positive" },
            failure: { morale: -3, logText: "hat sich beim Jugendturnier unter Druck gesetzt und enttäuscht.", logKind: "negative" },
          },
        },
        {
          id: "team",
          label: "Vor allem als Team auftreten",
          effects: { traitDeltas: { fuehrung: 1 }, clubRelation: 2, logText: "hat beim Jugendturnier vor allem den Teamgedanken in den Vordergrund gestellt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "jugend_wachstumsschmerzen",
    category: "verletzung",
    minAge: 14,
    maxAge: 17,
    weight: 1,
    build: (_p, ctx) => ({
      category: "verletzung",
      title: "Wachstumsschmerzen im Knie",
      description: "Der schnelle Wachstumsschub macht sich mit stechenden Schmerzen unterhalb der Kniescheibe bemerkbar - eine typische Wachstumsverletzung in diesem Alter.",
      choices: [
        {
          id: "durchbeissen",
          label: "Trotz der Schmerzen weitertrainieren",
          effects: {},
          followUpChance: {
            chance: 0.4,
            success: { attributes: { mentalitaet: 1 }, logText: "hat sich trotz Wachstumsschmerzen durchgebissen und keinen Schaden davongetragen.", logKind: "positive" },
            failure: { injuryWeeksOut: rInt(ctx, 3, 6), injuryLabel: "Reizung am Knie (Wachstumsschmerzen)", morale: -3, logText: "hat die Wachstumsschmerzen ignoriert und sich eine Reizung am Knie zugezogen.", logKind: "negative" },
          },
        },
        {
          id: "pausieren",
          label: "Pausieren und zum Physiotherapeuten gehen",
          effects: { fitness: 4, educationPoints: 2, logText: "hat die Wachstumsschmerzen ernst genommen und pausiert.", logKind: "positive" },
        },
      ],
    }),
  },
  {
    id: "jugend_socialmedia_hype",
    category: "medien",
    minAge: 15,
    maxAge: 17,
    weight: 1,
    // Bewusst niedrige Schwelle: mit 15-17 hat man realistisch noch keine große
    // Bekanntheit aufgebaut, aber schon ein bisschen lokalen Buzz reicht für
    // virale Jugendspiel-Ausschnitte.
    condition: (p) => p.reputation > 6,
    build: () => ({
      category: "medien",
      title: "Die ersten Follower als Nachwuchsspieler",
      description: "Ausschnitte deiner Jugendspiele verbreiten sich in den sozialen Medien - plötzlich hast du als Teenager eine echte Fangemeinde.",
      choices: [
        {
          id: "pflegen",
          label: "Die Community aktiv pflegen",
          effects: { traitDeltas: { medienimage: 3 }, reputation: 2, fitness: -1, logText: "hat als Jugendspieler begonnen, die eigene Social-Media-Präsenz aktiv zu pflegen.", logKind: "info" },
        },
        {
          id: "raushalten",
          label: "Sich raushalten und auf den Sport konzentrieren",
          effects: { attributes: { mentalitaet: 1 }, logText: "hat sich vom frühen Social-Media-Hype bewusst ferngehalten.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "jugend_vergleich_talent",
    category: "jugend",
    minAge: 14,
    maxAge: 17,
    weight: 1.2,
    build: (p, ctx) => {
      // Range statt Fixwerten (siehe Nutzer-Feedback "zu vorhersehbar").
      const anspornenTechnik = rInt(ctx, 1, 2);
      const anspornenArbeitsmoral = rInt(ctx, 2, 4);
      const resignierenMorale = -rInt(ctx, 2, 6);
      const resignierenArbeitsmoral = -rInt(ctx, 1, 2);
      return {
        category: "jugend",
        title: "Das noch größere Talent",
        description: `Ein Mitspieler in der Jugendmannschaft von ${club(p)} gilt als noch größeres Ausnahmetalent - die Vergleiche mit ihm/ihr sind allgegenwärtig.`,
        choices: [
          {
            id: "anspornen",
            label: "Sich davon anspornen lassen",
            effects: { attributes: { technik: anspornenTechnik }, traitDeltas: { arbeitsmoral: anspornenArbeitsmoral }, logText: "hat sich vom Vergleich mit dem Ausnahmetalent zusätzlich anspornen lassen.", logKind: "positive" },
          },
          {
            id: "resignieren",
            label: "Sich im Vergleich klein fühlen",
            effects: { morale: resignierenMorale, traitDeltas: { arbeitsmoral: resignierenArbeitsmoral }, logText: "hat sich im Schatten des Ausnahmetalents zunehmend klein gefühlt.", logKind: "negative" },
          },
        ],
      };
    },
  },
  {
    id: "jugend_elternehrgeiz",
    category: "jugend",
    minAge: 14,
    maxAge: 17,
    weight: 1,
    build: (_p, ctx) => {
      // Range statt Fixwerten (siehe Nutzer-Feedback "zu vorhersehbar").
      const abgrenzenMorale = rInt(ctx, 1, 4);
      const abgrenzenDisziplin = rInt(ctx, 1, 2);
      const fuegenMorale = -rInt(ctx, 1, 5);
      const fuegenEducation = rInt(ctx, 1, 3);
      return {
        category: "jugend",
        title: "Elternehrgeiz",
        description: "Ein Elternteil mischt sich zunehmend in Training und Aufstellung ein und setzt dich mit hohen Erwartungen unter Druck.",
        choices: [
          {
            id: "abgrenzen",
            label: "Sich klar abgrenzen",
            effects: { attributes: { mentalitaet: 1 }, morale: abgrenzenMorale, traitDeltas: { disziplin: abgrenzenDisziplin }, logText: "hat sich klar von elterlichem Druck abgegrenzt.", logKind: "positive" },
          },
          {
            id: "fuegen",
            label: "Sich den Erwartungen fügen",
            effects: { morale: fuegenMorale, educationPoints: fuegenEducation, logText: "hat sich dem elterlichen Ehrgeiz gefügt, statt sich abzugrenzen.", logKind: "negative" },
          },
        ],
      };
    },
  },
  {
    id: "jugend_heimweh_internat",
    category: "lifestyle",
    minAge: 14,
    maxAge: 17,
    weight: 1,
    build: (p) => ({
      category: "lifestyle",
      title: "Heimweh im Internat",
      description: `Das Leben im Nachwuchsleistungszentrum von ${club(p)}, weit weg von zu Hause, macht sich mit starkem Heimweh bemerkbar.`,
      choices: [
        {
          id: "durchhalten",
          label: "Die Zähne zusammenbeißen und durchhalten",
          effects: { traitDeltas: { arbeitsmoral: 2, disziplin: 1 }, morale: -2, logText: "hat das Heimweh im Internat tapfer durchgestanden.", logKind: "info" },
        },
        {
          id: "gespraech",
          label: "Das Gespräch mit den Eltern und Betreuern suchen",
          effects: { morale: 6, clubRelation: 2, logText: "hat das Heimweh offen angesprochen und Unterstützung gefunden.", logKind: "positive" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // TRAINING & LIFESTYLE (alle Altersstufen)
  // ---------------------------------------------------------------------
  {
    id: "training_extraschicht",
    category: "training",
    minAge: 15,
    maxAge: 38,
    weight: 3,
    build: (_p, ctx) => {
      const gain = rInt(ctx, 1, 2);
      const cost = rInt(ctx, 3, 7);
      const recover = rInt(ctx, 3, 6);
      // Eines der am häufigsten gezogenen Events der ganzen Karriere (Ø 3x, siehe
      // Bugreport "Repetition") - Titel/Beschreibung variieren, damit die x-te
      // Extraschicht nicht wortgleich zur ersten wirkt. Effekte/Entscheidungen
      // bleiben unverändert, reine Textvarianz.
      const variant = pickVariant(ctx, [
        { title: "Zusätzliche Trainingseinheit", description: "Der Athletiktrainer bietet eine freiwillige Extraschicht am Abend an." },
        { title: "Freiwilliges Extratraining", description: "Nach dem regulären Training fragt der Fitnesscoach, ob du noch eine Zusatzeinheit dranhängen willst." },
        { title: "Angebot: Sondertraining", description: "Der Athletiktrainer hat abends noch die Halle frei und bietet dir eine individuelle Extraschicht an." },
        { title: "Extra-Einheit am Abend", description: "Wieder mal steht eine freiwillige Abendeinheit im Kraftraum zur Wahl - Athletiktrainer inklusive." },
      ]);
      return {
        category: "training",
        title: variant.title,
        description: variant.description,
        choices: [
          {
            id: "ja",
            label: "Teilnehmen",
            effects: { attributes: { physis: gain }, fitness: -cost, traitDeltas: { arbeitsmoral: 3 }, logText: "hat eine intensive Extraschicht im Training absolviert.", logKind: "info" },
          },
          {
            id: "nein",
            label: "Lieber regenerieren",
            effects: { fitness: recover, traitDeltas: { arbeitsmoral: -1 }, logText: "hat sich für Regeneration entschieden.", logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "training_technikfokus",
    category: "training",
    minAge: 15,
    maxAge: 34,
    weight: 3,
    // Teilt sich den Slot mit "training_spezialisierung" (siehe dort) - beide
    // sind reine Trainingsschwerpunkt-Wahlen, sollen sich in derselben Saison
    // gegenseitig ersetzen statt zu addieren.
    exclusiveGroup: "training_fokus",
    build: (_p, ctx) => {
      const gain = rInt(ctx, 1, 3);
      const cost = rInt(ctx, 1, 3);
      // Zweithäufigstes Event der Karriere (Ø 2.8x) - Text-Varianten aus demselben
      // Grund wie bei "training_extraschicht" (siehe dort).
      const variant = pickVariant(ctx, [
        { title: "Individueller Trainingsschwerpunkt", description: "Der Trainerstab lässt dich einen Schwerpunkt für die kommenden Wochen wählen." },
        { title: "Trainingsplan-Update", description: "Der Trainerstab passt den Trainingsplan an und fragt, worauf du in den nächsten Wochen besonders Wert legen willst." },
        { title: "Persönlicher Fokus im Training", description: "Vor der nächsten Trainingswoche darfst du selbst festlegen, welcher Bereich besonders im Fokus stehen soll." },
        { title: "Schwerpunktwoche", description: "Der Trainerstab kündigt eine Schwerpunktwoche an und lässt dich die Richtung mitbestimmen." },
      ]);
      return {
        category: "training",
        title: variant.title,
        description: variant.description,
        choices: [
          {
            id: "technik",
            label: "Technik verfeinern",
            effects: { attributes: { technik: gain }, fitness: -cost, traitDeltas: { arbeitsmoral: 2 }, logText: "hat gezielt an der Technik gefeilt.", logKind: "info" },
          },
          {
            id: "tempo",
            label: "Schnelligkeit trainieren",
            effects: { attributes: { tempo: gain }, fitness: -cost, traitDeltas: { arbeitsmoral: 2 }, logText: "hat an der Schnelligkeit gearbeitet.", logKind: "info" },
          },
          {
            id: "mental",
            label: "Mentaltraining mit dem Sportpsychologen",
            effects: { attributes: { mentalitaet: gain }, morale: 2, traitDeltas: { arbeitsmoral: 2 }, logText: "hat mentale Stärke aufgebaut.", logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "training_spezialisierung",
    category: "training",
    minAge: 17,
    maxAge: 30,
    weight: 2.5,
    // Teilt sich den Slot mit "training_technikfokus" (siehe dort) - echter
    // Trade-off statt einer weiteren generischen Trainingswahl: Stärke
    // ausbauen (Spezialist) oder Schwäche ausgleichen (Allrounder).
    exclusiveGroup: "training_fokus",
    dynamicWeight: (p) => {
      const technikLastig = p.attributes.technik - p.attributes.physis;
      return clamp(1 + Math.abs(technikLastig) / 40, 1, 1.8);
    },
    build: (p, ctx) => {
      const strongKey: AttributeKey = p.attributes.technik >= p.attributes.physis ? "technik" : "physis";
      const weakKey: AttributeKey = strongKey === "technik" ? "physis" : "technik";
      return {
        category: "training",
        title: "Spezialisierung oder Ausgleich?",
        description: "Der Trainerstab stellt dich vor eine grundsätzliche Weichenstellung für die kommenden Trainingsmonate.",
        choices: [
          {
            id: "vertiefen",
            label: `Stärke vertiefen (${ATTRIBUTE_LABEL[strongKey]})`,
            detail: "Baut die eigene Stärke gezielt weiter aus, statt Schwächen auszugleichen.",
            effects: {
              attributes: { [strongKey]: rInt(ctx, 3, 5) },
              traitDeltas: { arbeitsmoral: 1 },
              logText: `hat sich entschieden, die eigene Stärke im Bereich ${ATTRIBUTE_LABEL[strongKey]} gezielt weiter auszubauen.`,
              logKind: "info",
            },
          },
          {
            id: "ausgleichen",
            label: `Schwäche ausgleichen (${ATTRIBUTE_LABEL[weakKey]})`,
            detail: "Kleinerer Zuwachs, macht das eigene Profil aber ausgewogener.",
            effects: {
              attributes: { [weakKey]: rInt(ctx, 2, 4) },
              traitDeltas: { disziplin: 2 },
              logText: `hat gezielt an der schwächeren Seite (${ATTRIBUTE_LABEL[weakKey]}) gearbeitet.`,
              logKind: "info",
            },
          },
        ],
      };
    },
  },
  {
    id: "durchbruch_kabinenritual",
    category: "lifestyle",
    minAge: 18,
    maxAge: 23,
    weight: 1.3,
    unique: true,
    build: (p) => ({
      category: "lifestyle",
      title: "Kabinen-Ritual für Neuzugänge",
      description: `Als Neuzugang bei ${club(p)} sollst du dich der Mannschaftstradition stellen: ein peinliches Lied vor versammelter Kabine singen.`,
      choices: [
        {
          id: "mitmachen",
          label: "Mit Humor mitmachen",
          effects: { clubRelation: 8, attributes: { charisma: 1 }, traitDeltas: { medienimage: 1 }, logText: "hat das Kabinen-Ritual mit Humor über sich ergehen lassen und die Mannschaft für sich gewonnen.", logKind: "positive" },
        },
        {
          id: "verweigern",
          label: "Sich verweigern",
          effects: { clubRelation: -6, traitDeltas: { disziplin: 1 }, logText: "hat sich dem traditionellen Kabinen-Ritual verweigert.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "durchbruch_erstes_gehalt",
    category: "lifestyle",
    minAge: 18,
    maxAge: 23,
    weight: 1,
    unique: true,
    condition: (p) => p.contract.wagePerYear > 20000,
    build: (_p, ctx) => {
      const carCost = rInt(ctx, 30, 60) * 1000;
      return {
        category: "lifestyle",
        title: "Der erste große Gehaltsscheck",
        description: "Das erste richtige Profi-Gehalt ist da - deutlich mehr Geld, als du je zuvor zur Verfügung hattest.",
        choices: [
          {
            id: "investieren",
            label: "Klug anlegen und sparen",
            effects: { wealth: 8000, traitDeltas: { arbeitsmoral: 2 }, attributes: { intelligenz: 1 }, logText: "hat das erste große Gehalt klug angelegt statt es zu verprassen.", logKind: "positive" },
          },
          {
            id: "auto",
            label: "Sich ein Luxusauto gönnen",
            effects: { wealth: -carCost, morale: 8, reputation: 2, logText: `hat sich vom ersten großen Gehalt ein Luxusauto für ${Math.round(carCost / 1000)} Tsd € gegönnt.`, logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "lifestyle_party",
    category: "lifestyle",
    minAge: 17,
    maxAge: 36,
    weight: 2,
    build: (_p, ctx) => {
      // Range statt Fixwerten (siehe Nutzer-Feedback "zu vorhersehbar") - beide
      // Entscheidungen sollen sich über mehrere Ziehungen hinweg unterschiedlich
      // stark anfühlen, nicht jedes Mal exakt gleich.
      const hingehenMorale = rInt(ctx, 5, 10);
      const hingehenRep = rInt(ctx, 1, 3);
      const hingehenFitness = -rInt(ctx, 5, 10);
      const hingehenDisziplin = -rInt(ctx, 2, 5);
      const absagenFitness = rInt(ctx, 3, 7);
      const absagenClubRelation = rInt(ctx, 1, 2);
      const absagenDisziplin = rInt(ctx, 1, 3);
      const absagenArbeitsmoral = rInt(ctx, 1, 2);
      return {
        category: "lifestyle",
        title: "Einladung zur Release-Party",
        description: "Ein Bekannter lädt dich zu einer großen Party ein - genau vor einem wichtigen Trainingsblock.",
        choices: [
          {
            id: "hingehen",
            label: "Hingehen und feiern",
            effects: { morale: hingehenMorale, reputation: hingehenRep, fitness: hingehenFitness, traitDeltas: { disziplin: hingehenDisziplin }, logText: "hat ausgelassen gefeiert.", logKind: "info" },
          },
          {
            id: "absagen",
            label: "Absagen und früh schlafen",
            effects: { fitness: absagenFitness, clubRelation: absagenClubRelation, traitDeltas: { disziplin: absagenDisziplin, arbeitsmoral: absagenArbeitsmoral }, logText: "hat auf die Party verzichtet und sich ausgeruht.", logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "lifestyle_ernaehrung",
    category: "lifestyle",
    minAge: 16,
    maxAge: 38,
    weight: 2,
    build: (_p, ctx) => {
      // Häufiges Lifestyle-Event über die Karriere hinweg (Ø 2.2x) - Text-Varianten
      // aus demselben Grund wie bei den anderen Events oben (siehe dort).
      const variant = pickVariant(ctx, [
        { title: "Ernährungsberatung", description: "Der Vereinsarzt schlägt eine strikte Ernährungsumstellung vor." },
        { title: "Neuer Ernährungsplan", description: "Die Vereinsernährungsberaterin will deinen Speiseplan grundlegend umstellen." },
        { title: "Ernährungscheck beim Verein", description: "Bei der jährlichen Untersuchung empfiehlt der Vereinsarzt deutlich striktere Ernährungsgewohnheiten." },
        { title: "Diät-Empfehlung", description: "Der Fitnesscoach rät zu einer strengeren Ernährungsumstellung, um noch mehr aus dir herauszuholen." },
      ]);
      return {
      category: "lifestyle",
      title: variant.title,
      description: variant.description,
      choices: [
        {
          id: "ja",
          label: "Konsequent umsetzen",
          effects: { attributes: { physis: 1 }, fitness: 4, morale: -1, traitDeltas: { disziplin: 2 }, logText: "hat die Ernährung konsequent umgestellt.", logKind: "info" },
        },
        {
          id: "nein",
          label: "Beim Altbewährten bleiben",
          effects: { morale: 1, traitDeltas: { disziplin: -1 }, logText: "ist bei den gewohnten Essgewohnheiten geblieben.", logKind: "info" },
        },
      ],
      };
    },
  },
  {
    id: "lifestyle_investition",
    category: "lifestyle",
    minAge: 20,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.wealth > 50000,
    build: () => ({
      category: "lifestyle",
      title: "Investitionsangebot",
      description: "Ein Berater schlägt vor, einen Teil deines Vermögens in ein Immobilienprojekt zu investieren.",
      choices: [
        {
          id: "investieren",
          label: "Investieren",
          effects: {},
          followUpChance: {
            chance: 0.6,
            success: { wealth: 30000, logText: "hat mit einer Investition gutes Geld verdient.", logKind: "positive" },
            failure: { wealth: -20000, logText: "hat mit einer Investition Geld verloren.", logKind: "negative" },
          },
        },
        {
          id: "nein",
          label: "Lieber auf Nummer sicher gehen",
          effects: { logText: "hat auf eine riskante Investition verzichtet.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "weiterbildung_nebenbei",
    category: "lifestyle",
    minAge: 18,
    maxAge: 29,
    weight: 1.5,
    condition: (p) => p.education < 90,
    build: (_p, ctx) => ({
      category: "lifestyle",
      title: "Weiterbildung neben dem Profialltag",
      description: "Ein Fernstudienangebot würde sich zeitlich neben dem Profialltag gerade noch ausgehen.",
      choices: [
        {
          id: "beginnen",
          label: "Fernstudium beginnen",
          effects: { educationPoints: rInt(ctx, 8, 14), fitness: -3, traitDeltas: { arbeitsmoral: 2 }, logText: "hat neben dem Profialltag ein Fernstudium begonnen.", logKind: "positive" },
        },
        {
          id: "fokus",
          label: "Sich voll auf den Sport konzentrieren",
          effects: { attributes: { mentalitaet: 1 }, logText: "hat sich bewusst gegen ein Studium und für den vollen Fokus auf den Sport entschieden.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // MEDIEN
  // ---------------------------------------------------------------------
  {
    id: "medien_pressekonferenz",
    category: "medien",
    minAge: 17,
    maxAge: 40,
    weight: 3,
    build: (p, ctx) => {
      // Dritthäufigstes Event der Karriere (Ø 2.7x) - Text-Varianten aus demselben
      // Grund wie bei den Trainings-Events oben (siehe dort).
      const variant = pickVariant(ctx, [
        { title: "Pressekonferenz", description: `Nach einer wichtigen Partie will die Presse wissen, wie du die Lage bei ${club(p)} einschätzt.` },
        { title: "Medienrunde nach dem Spiel", description: `Die Reporter warten schon in der Mixed Zone von ${club(p)} und wollen deine Einschätzung zur aktuellen Lage hören.` },
        { title: "Fragerunde der Beat-Reporter", description: `Die Beat-Reporter, die ${club(p)} regelmäßig begleiten, bitten dich um ein kurzes Statement zur Situation.` },
        { title: "Interviewanfrage nach dem Training", description: `Nach dem Training bittet ein Sender um ein kurzes O-Ton-Interview zur Lage bei ${club(p)}.` },
      ]);
      return {
      category: "medien",
      title: variant.title,
      description: variant.description,
      choices: [
        {
          id: "diplomatisch",
          label: "Diplomatisch antworten",
          effects: { attributes: { charisma: 1 }, clubRelation: 1, traitDeltas: { medienimage: 3 }, logText: "hat sich diplomatisch gegenüber der Presse geäußert.", logKind: "info" },
        },
        {
          id: "provokant",
          label: "Provokant Klartext reden",
          effects: { reputation: 5, clubRelation: -3, traitDeltas: { medienimage: -3, disziplin: -1 }, logText: "hat mit provokanten Aussagen für Schlagzeilen gesorgt.", logKind: "negative" },
        },
        {
          id: "zurueckhaltend",
          label: "Sich zurückhalten, wenig sagen",
          effects: { logText: "hat sich bei der Pressekonferenz bedeckt gehalten.", logKind: "info" },
        },
      ],
      };
    },
  },
  {
    id: "medien_interview_privat",
    category: "medien",
    minAge: 18,
    maxAge: 40,
    weight: 2,
    condition: (p) => p.reputation > 30,
    build: () => ({
      category: "medien",
      title: "Homestory-Anfrage",
      description: "Ein Magazin möchte eine große Homestory über dein Privatleben veröffentlichen.",
      choices: [
        {
          id: "ja",
          label: "Zustimmen",
          effects: { reputation: 6, morale: -2, traitDeltas: { medienimage: 3 }, logText: "hat einer Homestory zugestimmt.", logKind: "info" },
        },
        {
          id: "nein",
          label: "Privatsphäre wahren",
          effects: { morale: 3, logText: "hat die eigene Privatsphäre geschützt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "medien_kritik",
    category: "medien",
    minAge: 18,
    maxAge: 40,
    weight: 2,
    build: (p) => ({
      category: "medien",
      title: "Öffentliche Kritik",
      description: `Ein bekannter Experte kritisiert deine letzten Leistungen für ${club(p)} scharf in der Zeitung.`,
      choices: [
        {
          id: "kontern",
          label: "Öffentlich kontern",
          effects: { reputation: 3, morale: -3, traitDeltas: { medienimage: -2 }, logText: "hat auf öffentliche Kritik gekontert.", logKind: "negative" },
        },
        {
          id: "ignorieren",
          label: "Ignorieren und auf dem Platz antworten",
          effects: { attributes: { mentalitaet: 1 }, traitDeltas: { disziplin: 2 }, logText: "hat Kritik ignoriert und auf dem Platz geantwortet.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // SPONSORING
  // ---------------------------------------------------------------------
  {
    id: "sponsor_schuhe",
    category: "sponsoring",
    minAge: 17,
    maxAge: 40,
    weight: 2,
    condition: (p) => p.reputation > 15,
    build: (_p, ctx) => {
      // Häufiges Sponsoring-Event (Ø >2x/Karriere) - Text-Varianten, damit nicht
      // jedes Mal wortgleich derselbe Schuhhersteller-Deal auftaucht.
      const variant = pickVariant(ctx, [
        { title: "Angebot eines Schuhherstellers", description: "Ein Sportartikelhersteller bietet dir einen Ausrüstervertrag an - inklusive Werbeterminen neben dem Training." },
        { title: "Neuer Ausrüsterdeal", description: "Eine bekannte Sportmarke will dich als Testimonial gewinnen - inklusive regelmäßiger Werbetermine." },
        { title: "Schuhvertrag im Angebot", description: "Ein Ausrüster meldet sich mit einem lukrativen Vertragsangebot samt Marketingauftritten." },
        { title: "Werbepartner klopft an", description: "Ein Sportartikelhersteller wirbt um dich als Aushängeschild - mit Terminen abseits des Trainings." },
      ]);
      return {
        category: "sponsoring",
        title: variant.title,
        description: variant.description,
        choices: [
          {
            id: "annehmen",
            label: "Vertrag annehmen",
            effects: { wealth: 15000, fitness: -3, logText: "hat einen Ausrüstervertrag unterschrieben.", logKind: "positive" },
          },
          {
            id: "ablehnen",
            label: "Ablehnen, volle Konzentration auf den Sport",
            effects: { fitness: 2, attributes: { physis: 1 }, logText: "hat ein Sponsoring-Angebot abgelehnt.", logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "sponsor_grossmarke",
    category: "sponsoring",
    minAge: 20,
    maxAge: 40,
    weight: 2,
    condition: (p) => p.reputation > 45,
    build: () => ({
      category: "sponsoring",
      title: "Globaler Werbedeal",
      description: "Eine internationale Marke will dich als Gesicht einer großen Kampagne - viel Geld, aber ein enger Zeitplan während der Saison.",
      choices: [
        {
          id: "annehmen",
          label: "Deal unterschreiben",
          effects: { wealth: 80000, reputation: 8, morale: -3, fitness: -4, logText: "hat einen großen Werbedeal abgeschlossen.", logKind: "positive" },
        },
        {
          id: "ablehnen",
          label: "Ablehnen und sich auf den Sport konzentrieren",
          effects: { attributes: { mentalitaet: 1 }, logText: "hat einen lukrativen Werbedeal ausgeschlagen.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "sponsor_wohltaetigkeit",
    category: "sponsoring",
    minAge: 19,
    maxAge: 40,
    weight: 1,
    build: (p) => ({
      category: "sponsoring",
      title: "Wohltätigkeitsprojekt",
      description: `Eine Stiftung bittet dich, ein soziales Projekt in der Region von ${club(p)} zu unterstützen.`,
      choices: [
        {
          id: "engagieren",
          label: "Sich engagieren",
          effects: { reputation: 5, wealth: -3000, clubRelation: 3, logText: "hat sich sozial engagiert.", logKind: "positive" },
        },
        {
          id: "spenden",
          label: "Nur Geld spenden, kein öffentlicher Auftritt",
          effects: { wealth: -1000, reputation: 1, logText: "hat still gespendet.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // VERLETZUNG
  // ---------------------------------------------------------------------
  {
    id: "verletzung_risiko",
    category: "verletzung",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    condition: (p) => p.fitness < 60,
    build: () => ({
      category: "verletzung",
      title: "Angeschlagen zum Training",
      description: "Du spürst ein Ziehen im Oberschenkel, aber der Trainer braucht dich für das nächste wichtige Spiel.",
      choices: [
        {
          id: "spielen",
          label: "Trotzdem spielen",
          effects: {},
          followUpChance: {
            chance: 0.45,
            success: { clubRelation: 3, morale: 2, logText: "hat sich angeschlagen durchgebissen und überzeugt.", logKind: "positive" },
            failure: { injuryWeeksOut: 6, injuryLabel: "Muskelfaserriss", morale: -6, logText: "hat sich verletzt, weil er/sie trotz Beschwerden gespielt hat.", logKind: "negative" },
          },
        },
        {
          id: "pausieren",
          label: "Aussetzen und auskurieren",
          effects: { fitness: 6, clubRelation: -2, logText: "hat sich geschont, um eine Verletzung zu vermeiden.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "verletzung_reha_entscheidung",
    category: "verletzung",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    condition: (p) => p.injury !== null,
    build: (p) => ({
      category: "verletzung",
      title: "Reha-Entscheidung",
      description: `Deine Verletzung (${p.injury?.label ?? "Verletzung"}) heilt gut. Der Reha-Trainer schlägt ein beschleunigtes Programm vor.`,
      choices: [
        {
          id: "forcieren",
          label: "Reha forcieren, früher zurück",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { injuryWeeksOut: -3, logText: "ist dank forcierter Reha früher zurückgekehrt.", logKind: "positive" },
            failure: { injuryWeeksOut: 3, fitness: -5, logText: "hat einen Rückschlag in der Reha erlitten.", logKind: "negative" },
          },
        },
        {
          id: "normal",
          label: "Normalen Reha-Plan einhalten",
          effects: { fitness: 3, logText: "hat den regulären Reha-Plan eingehalten.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "verletzung_reha_klinik",
    category: "verletzung",
    minAge: 16,
    maxAge: 40,
    weight: 1.8,
    condition: (p) => p.injury !== null,
    build: (p, ctx) => ({
      category: "verletzung",
      title: "Reha in der Spezialklinik",
      description: `${club(p)} bietet dir für die Genesung von deiner Verletzung (${p.injury?.label ?? "Verletzung"}) einen mehrwöchigen Aufenthalt in einer spezialisierten Reha-Klinik an.`,
      choices: [
        {
          id: "klinik",
          label: "Sich voll auf die Klinik einlassen",
          effects: { injuryWeeksOut: -rInt(ctx, 2, 4), fitness: 4, traitDeltas: { arbeitsmoral: 2 }, logText: "hat sich voll auf die Reha in der Spezialklinik eingelassen und Fortschritte gemacht.", logKind: "positive" },
        },
        {
          id: "zuhause",
          label: "Reha lieber in Vereinsnähe fortsetzen",
          effects: { fitness: 2, clubRelation: 2, logText: "hat die Reha bewusst in Vereinsnähe statt in der Spezialklinik fortgesetzt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "verletzung_mentale_belastung",
    category: "verletzung",
    minAge: 17,
    maxAge: 40,
    weight: 1.5,
    condition: (p) => p.injury !== null && p.injury.weeksOut >= 8,
    build: () => ({
      category: "verletzung",
      title: "Die mentale Last der langen Pause",
      description: "Die lange Zwangspause nagt zunehmend an dir - Zweifel und Ungeduld machen sich breit, während die Mannschaft ohne dich weiterspielt.",
      choices: [
        {
          id: "psychologe",
          label: "Sportpsychologische Begleitung annehmen",
          effects: { morale: 6, attributes: { mentalitaet: 1 }, traitDeltas: { arbeitsmoral: 1 }, logText: "hat sich während der langen Pause sportpsychologisch begleiten lassen.", logKind: "positive" },
        },
        {
          id: "alleine",
          label: "Allein durchbeißen",
          effects: { morale: -4, traitDeltas: { arbeitsmoral: 2, disziplin: 1 }, logText: "beißt sich während der langen Pause allein durch, ohne fremde Hilfe.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "verletzung_ersatzmann",
    category: "verletzung",
    minAge: 17,
    maxAge: 40,
    weight: 1.3,
    condition: (p) => p.injury !== null,
    build: (p) => ({
      category: "verletzung",
      title: "Der Ersatzmann liefert",
      description: `Während du bei ${club(p)} auf der Ausfallliste stehst, überzeugt dein Vertreter auf deiner Position mit starken Leistungen.`,
      choices: [
        {
          id: "freuen",
          label: "Sich ehrlich für den Vertreter freuen",
          effects: { clubRelation: 4, traitDeltas: { fuehrung: 2 }, logText: "hat sich trotz eigener Verletzung ehrlich über die starken Leistungen des Vertreters gefreut.", logKind: "positive" },
        },
        {
          id: "eifersucht",
          label: "Insgeheim um den Stammplatz bangen",
          effects: { morale: -5, traitDeltas: { disziplin: -1 }, logText: "bangt insgeheim um den eigenen Stammplatz nach der Verletzung.", logKind: "negative" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // TAKTIK / SPIELMOMENTE
  // ---------------------------------------------------------------------
  {
    id: "taktik_elfmeter",
    category: "taktik",
    minAge: 17,
    maxAge: 40,
    weight: 2,
    // Torhüter treten so gut wie nie als Elfmeterschütze an - das bleibt Feldspielern
    // vorbehalten.
    condition: (p) => p.attributes.mentalitaet > 20 && p.position !== "TW",
    build: (p) => ({
      category: "taktik",
      title: "Elfmeter im Endspurt",
      description: `Kurz vor Schluss bekommt ${club(p)} einen Elfmeter zugesprochen. Der Stammschütze ist unsicher - übernimmst du die Verantwortung?`,
      choices: [
        {
          id: "uebernehmen",
          label: "Selbst schießen",
          effects: {},
          followUpChance: {
            chance: 0.55,
            success: { reputation: 6, morale: 6, clubRelation: 2, logText: "hat in der Crunchtime einen Elfmeter verwandelt.", logKind: "positive" },
            failure: { morale: -8, reputation: -2, logText: "hat einen wichtigen Elfmeter vergeben.", logKind: "negative" },
          },
        },
        {
          id: "abgeben",
          label: "Verantwortung abgeben",
          effects: { clubRelation: 1, logText: "hat die Elfmeter-Verantwortung abgegeben.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "taktik_kapitaensbinde",
    category: "taktik",
    minAge: 22,
    maxAge: 40,
    weight: 1,
    unique: true,
    condition: (p) => p.clubRelation > 55 && p.reputation > 35,
    build: (p) => ({
      category: "meilenstein",
      title: "Angebot der Kapitänsbinde",
      description: `Der Trainer von ${club(p)} bietet dir die Kapitänsbinde an - mehr Verantwortung, aber auch mehr Druck.`,
      choices: [
        {
          id: "annehmen",
          label: "Kapitän werden",
          effects: { attributes: { mentalitaet: 2, charisma: 1 }, reputation: 6, clubRelation: 4, traitDeltas: { fuehrung: 10 }, logText: "wurde zum Mannschaftskapitän ernannt.", logKind: "milestone" },
        },
        {
          id: "ablehnen",
          label: "Höflich ablehnen",
          effects: { morale: 2, traitDeltas: { fuehrung: -2 }, logText: "hat die Kapitänsbinde vorerst abgelehnt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "taktik_schiedsrichter",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    build: () => ({
      category: "taktik",
      title: "Strittige Schiedsrichterentscheidung",
      description: "Nach einer knappen Fehlentscheidung gegen deine Mannschaft kochen die Emotionen hoch.",
      choices: [
        {
          id: "reklamieren",
          label: "Lautstark reklamieren",
          effects: {},
          followUpChance: {
            chance: 0.3,
            success: { reputation: 2, logText: "hat lautstark reklamiert, ohne Konsequenzen.", logKind: "info" },
            failure: { attributes: {}, logText: "hat für lautstarkes Reklamieren die Gelbe Karte gesehen.", logKind: "negative" },
          },
        },
        {
          id: "ruhig",
          label: "Ruhig bleiben und weiterspielen",
          effects: { attributes: { mentalitaet: 1 }, logText: "ist trotz Fehlentscheidung ruhig geblieben.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "taktik_flanke_dribbling",
    category: "taktik",
    minAge: 16,
    maxAge: 40,
    weight: 2,
    // Reines Feldspieler-Szenario (Ballführung im letzten Drittel) - für Torhüter
    // gibt es das eigenständige Gegenstück "torwart_glanzparade".
    condition: (p) => p.position !== "TW",
    build: () => ({
      category: "taktik",
      title: "Entscheidende Spielsituation",
      description: "Im letzten Drittel des Spielfelds hast du eine Anspielstation, aber auch die Chance auf ein Solo.",
      choices: [
        {
          id: "solo",
          label: "Dribbling wagen",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { reputation: 3, morale: 4, logText: "hat ein sehenswertes Solo erfolgreich abgeschlossen.", logKind: "positive" },
            failure: { morale: -3, clubRelation: -1, logText: "ist mit einem riskanten Solo gescheitert.", logKind: "negative" },
          },
        },
        {
          id: "abspielen",
          label: "Sicher abspielen",
          effects: { attributes: { intelligenz: 1 }, clubRelation: 1, logText: "hat sich für die sichere Lösung entschieden.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // NATIONALMANNSCHAFT
  // ---------------------------------------------------------------------
  {
    id: "nationalmannschaft_einladung",
    category: "nationalmannschaft",
    minAge: 18,
    maxAge: 38,
    weight: 2,
    // Der Nationaltrainer beobachtet praktisch nur die erste Liga - ein Liga-2-Spieler
    // braucht schon eine wirklich außergewöhnliche Saison (Ø-Note 8+) UND ein
    // ordentliches Grundniveau, um trotzdem aufzufallen. Reine Liga-2-Routine
    // reicht nicht für eine Nominierung.
    condition: (p) => {
      if (p.reputation <= 40) return false;
      const overall = overallRatingFromAttributes(p.attributes, p.position);
      if (p.club.tier === 2) {
        const last = p.seasonHistory[p.seasonHistory.length - 1];
        if (!last || last.avgRating < 8 || overall < 68) return false;
      }
      const established = p.nationalTeamCaps >= 10;
      return Math.random() < nationalTeamCallUpChance(overall, p.club.tier, established, p.nationalTeamCandidacySeasons);
    },
    // Zusätzlich zur steigenden Grundwahrscheinlichkeit (siehe `nationalTeamCallUpChance`)
    // gewinnt das Event bei einer langen Kandidatur-Serie auch die gewichtete
    // Saison-Auswahl deutlich häufiger (siehe `pickSeasonTemplateIds`) - sonst könnte
    // ein an sich fälliger Spieler trotz erfüllter `condition` weiter im Eventpool
    // untergehen. Bleibt bei `candidacySeasons = 0` neutral (Faktor 1).
    dynamicWeight: (p) => 1 + clamp(p.nationalTeamCandidacySeasons * 0.5, 0, 6),
    build: (p, ctx) => {
      const isDebut = p.nationalTeamCaps === 0;
      const overall = overallRatingFromAttributes(p.attributes, p.position);
      const attackWeight = { TW: 0, IV: 0.1, AV: 0.2, ZM: 0.35, FS: 0.6, ST: 0.75 }[p.position];
      const goalsDelta = ctx.rng() < attackWeight ? rInt(ctx, 1, 2) : 0;
      // Sowohl die Erfolgschance des Einsatzes als auch die Zahl der dabei
      // gesammelten Länderspiele skalieren mit der Gesamtstärke - ein echtes
      // Wunderkind (95+) ist im Nationaltrikot praktisch gesetzt und sammelt pro
      // Berufung mehrere Einsätze, ein knapper Grenzfall-Kandidat bleibt auch dort
      // eher Mitläufer. Genau diese Staffelung macht 100+ Länderspiele zu einem
      // realistischen (wenn auch seltenen) Ziel für absolute Ausnahmespieler,
      // statt für jeden Nationalspieler gleich erreichbar zu sein.
      const successChance = clamp(0.32 + (overall - 55) / 85, 0.32, 0.95);
      const capsOnSuccess =
        overall >= 95 ? rInt(ctx, 5, 8) : overall >= 85 ? rInt(ctx, 3, 5) : overall >= 70 ? rInt(ctx, 2, 4) : rInt(ctx, 1, 3);
      return {
        category: "nationalmannschaft",
        title: isDebut ? "Einladung zur Nationalmannschaft" : "Erneute Berufung in die Nationalmannschaft",
        description: isDebut
          ? "Der Nationaltrainer beruft dich erstmals für ein Länderspiel-Camp - eine große Ehre, aber auch zusätzliche Belastung."
          : `Nach starken Leistungen bei ${club(p)} wirst du erneut für die Nationalmannschaft nominiert (bisher ${p.nationalTeamCaps} Länderspiele).`,
        choices: [
          {
            id: "folgen",
            label: "Der Einladung folgen",
            effects: {},
            followUpChance: {
              chance: successChance,
              success: {
                reputation: 14,
                fitness: -6,
                morale: 8,
                capsDelta: capsOnSuccess,
                goalsDelta,
                attributes: { mentalitaet: 1, physis: 1 },
                traitDeltas: { fuehrung: 1 },
                logText:
                  (isDebut
                    ? "hat sein/ihr Debüt für die Nationalmannschaft gegeben und überzeugt."
                    : capsOnSuccess >= 5
                    ? "war beim Nationalmannschafts-Camp gesetzt und sammelte gleich mehrere weitere Länderspiele."
                    : "kam erneut für die Nationalmannschaft zum Einsatz und überzeugte.") +
                  (goalsDelta > 0 ? ` Dabei ${goalsDelta === 1 ? "erzielte er/sie ein Länderspieltor" : `erzielte er/sie ${goalsDelta} Länderspieltore`}.` : ""),
                logKind: "milestone",
              },
              failure: {
                reputation: 2,
                fitness: -6,
                morale: -2,
                capsDelta: 1,
                logText: isDebut
                  ? "hat sein/ihr Debüt für die Nationalmannschaft gegeben, kam aber nur sporadisch zum Einsatz."
                  : "kam im Nationalmannschafts-Camp nur sporadisch zum Einsatz.",
                logKind: "info",
              },
            },
          },
          {
            id: "absagen",
            label: "Wegen Belastung absagen",
            effects: { fitness: 4, reputation: -3, logText: "hat eine Nationalmannschaftseinladung wegen Belastung abgesagt.", logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "nationalmannschaft_kapitaen",
    category: "nationalmannschaft",
    minAge: 24,
    maxAge: 38,
    weight: 1,
    unique: true,
    // War auf caps>=15 & fuehrung>=65 gesetzt - laut Simulation (1000 Karrieren) werden
    // beide Werte so gut wie nie gleichzeitig erreicht (max. beobachtet: 16 Caps,
    // 91 Führung, aber praktisch nie zusammen). Schwellen gesenkt, damit das Event bei
    // Spielern mit echter Nationalmannschaftskarriere auch tatsächlich feuern kann.
    condition: (p) => p.nationalTeamCaps >= 8 && p.traits.fuehrung >= 60,
    build: () => ({
      category: "nationalmannschaft",
      title: "Kapitän der Nationalmannschaft",
      description: "Nach zahlreichen starken Länderspielen und als anerkannte Führungspersönlichkeit bietet dir der Nationaltrainer die Kapitänsbinde an.",
      choices: [
        {
          id: "annehmen",
          label: "Die Kapitänsbinde annehmen",
          effects: { reputation: 10, nationalTeamCaptain: true, traitDeltas: { fuehrung: 5 }, logText: "wurde zum Kapitän der Nationalmannschaft ernannt.", logKind: "milestone" },
        },
        {
          id: "ablehnen",
          label: "Höflich ablehnen",
          effects: { morale: 2, logText: "hat die Kapitänsbinde der Nationalmannschaft vorerst abgelehnt.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // VERTRAG / TRANSFER
  // ---------------------------------------------------------------------
  {
    id: "vertrag_verlaengerung",
    category: "vertrag",
    minAge: 17,
    maxAge: 40,
    weight: 3,
    // Der Ausbildungsvertrag in der Jugendakademie (siehe `createPlayer`, läuft
    // ebenfalls mit yearsLeft) ist noch kein echter Profivertrag - eine
    // "Vertragsverlängerung" ergibt inhaltlich erst ab dem ersten Profivertrag
    // Sinn (siehe `shouldOfferProDebut`/`applyClubOfferChoice` "stay-debut").
    condition: (p) => p.contract.squadRole !== "Ausbildungsspieler" && p.contract.yearsLeft <= 1,
    build: (p) => ({
      category: "vertrag",
      title: "Vertragsverlängerung",
      description: `Dein Vertrag bei ${club(p)} läuft aus. Der Verein bietet eine Verlängerung an.`,
      choices: [
        {
          id: "verlaengern_geld",
          label: "Verlängern, Fokus auf hohes Gehalt",
          effects: { wageMultiplier: 1.3, clubRelation: 1, wantsTransfer: false, logText: "hat den Vertrag mit deutlich höherem Gehalt verlängert.", logKind: "milestone" },
        },
        {
          id: "verlaengern_rolle",
          label: "Verlängern, Fokus auf Stammplatzgarantie",
          effects: {
            clubRelation: 6,
            morale: 4,
            wantsTransfer: false,
            // Echte vertragliche Garantie statt nur eines Stimmungs-Bonus: für 2
            // Saisons mindestens Stammspieler, was sich über die Kaderrolle direkt
            // auf Einsatzminuten und darüber auf Tore/Vorlagen auswirkt.
            startingRoleGuaranteeSeasons: 2,
            logText: "hat verlängert mit vertraglich fixierter Stammplatzgarantie für die kommenden zwei Saisons.",
            logKind: "milestone",
          },
        },
        {
          id: "ablehnen",
          label: "Nicht verlängern, offen für Wechsel",
          effects: { clubRelation: -6, reputation: 2, wantsTransfer: true, logText: "hat eine Vertragsverlängerung abgelehnt und ist wechselbereit.", logKind: "info" },
        },
      ],
    }),
  },
  // Beispiel-Integration "Investments können zusätzlich aus passenden Events
  // heraus angeboten werden" (siehe investments.ts) - derselbe Aktivierungsweg
  // wie im Dashboard-Panel (`EffectDelta.activateInvestmentId`, ausgewertet in
  // `applyEffects`), nur als Entscheidung statt als direkte Nutzeraktion.
  // `availableInvestmentIds` prüft bereits Freischaltung/Cooldown/"max. 1
  // aktiv" gebündelt - dieselbe Quelle wie das Panel, keine doppelte Logik.
  {
    id: "investment_berater_angebot",
    category: "vertrag",
    minAge: 21,
    maxAge: 32,
    weight: 1,
    condition: (p) => availableInvestmentIds(p).includes("berater_coach") && p.wealth >= investmentCost("berater_coach", p),
    build: (p) => {
      const cost = investmentCost("berater_coach", p);
      return {
        category: "vertrag",
        title: "Ein Berater meldet sich",
        description: `Ein erfahrener Berater/Coach bietet ${p.name} seine Dienste an - professionelle Unterstützung bei Vertragsverhandlungen und im Trainingsalltag, gegen eine jährliche Gebühr von ${formatMoney(cost)}.`,
        choices: [
          {
            id: "annehmen",
            label: `Berater engagieren (${formatMoney(cost)})`,
            effects: { activateInvestmentId: "berater_coach" },
          },
          {
            id: "ablehnen",
            label: "Lieber allein weitermachen",
            effects: { logText: "hat das Angebot eines Beraters vorerst ausgeschlagen.", logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "transfer_loan",
    category: "transfer",
    minAge: 17,
    maxAge: 23,
    weight: 1,
    condition: (p) => p.clubRelation < 40,
    build: (p) => ({
      category: "transfer",
      title: "Leihangebot",
      description: `${club(p)} schlägt vor, dich für mehr Spielpraxis an einen anderen Verein zu verleihen.`,
      choices: [
        {
          id: "ja",
          label: "Leihe akzeptieren",
          // BEWUSST kein wantsTransfer:true - dies ist ein vom VEREIN vorgeschlagener
          // Leihvorschlag (siehe description), keine aktiv-öffentliche Wechselforderung
          // des Spielers. `wantsTransfer` garantiert im Transfersystem ein sofortiges
          // Angebot im nächsten Fenster OHNE Cooldown und färbt spätere Angebotstexte
          // als "dein öffentlich geäußerter Wechselwunsch" - das wäre hier irreführend
          // (bloße Zustimmung zu einer vereinsseitigen Leihe, kein eigener Vorstoß).
          effects: { attributes: { mentalitaet: 1 }, clubRelation: 2, morale: 2, logText: "akzeptiert die vom Verein vorgeschlagene Leihe für mehr Spielpraxis.", logKind: "info" },
        },
        {
          id: "nein",
          label: "Um den Stammplatz kämpfen",
          effects: { clubRelation: -2, morale: -1, logText: "hat sich gegen eine Leihe entschieden.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // GEHALT
  // ---------------------------------------------------------------------
  {
    id: "gehaltsverhandlung",
    category: "vertrag",
    minAge: 19,
    maxAge: 37,
    weight: 2,
    condition: (p) => p.reputation > 35 && p.contract.yearsLeft >= 1,
    build: (p) => ({
      category: "vertrag",
      title: "Gehaltsverhandlung",
      description: `Dein Berater sieht nach den letzten Leistungen bei ${club(p)} Potenzial für mehr Gehalt und will nachverhandeln.`,
      choices: [
        {
          id: "hart",
          label: "Hart verhandeln lassen",
          effects: {},
          followUpChance: {
            chance: 0.55,
            success: { wageMultiplier: 1.35, reputation: 2, logText: "hat nach zähen Verhandlungen ein deutlich höheres Gehalt durchgesetzt.", logKind: "positive" },
            failure: { clubRelation: -10, morale: -4, logText: "ist mit einer harten Gehaltsforderung gescheitert - das Verhältnis zum Verein ist abgekühlt.", logKind: "negative" },
          },
        },
        {
          id: "moderat",
          label: "Moderat nachfragen",
          effects: { wageMultiplier: 1.12, clubRelation: -1, logText: "hat sich auf eine moderate Gehaltserhöhung geeinigt.", logKind: "positive" },
        },
        {
          id: "verzichten",
          label: "Auf eine Erhöhung verzichten",
          effects: { clubRelation: 5, morale: 2, logText: "hat auf eine Gehaltserhöhung verzichtet und sich damit beim Verein beliebt gemacht.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // BEZIEHUNG & FAMILIE
  // ---------------------------------------------------------------------
  {
    id: "erste_liebe",
    category: "beziehung",
    minAge: 18,
    maxAge: 22,
    weight: 2,
    exclusiveGroup: "beziehung_start",
    condition: (p) => p.relationshipStatus === "single",
    build: (_p, ctx) => {
      const name = randomPartnerName(ctx.rng);
      return {
        category: "beziehung",
        title: "Erste große Liebe",
        description: `Du lernst ${name} kennen - und plötzlich dreht sich nicht mehr alles nur um Fußball.`,
        choices: [
          {
            id: "verlieben",
            label: `Sich auf die Beziehung mit ${name} einlassen`,
            effects: {
              relationshipStatus: "in_beziehung",
              partnerName: name,
              morale: 8,
              fitness: -2,
              logText: `ist jetzt mit ${name} zusammen.`,
              logKind: "positive",
            },
          },
          {
            id: "fokus",
            label: "Sich voll auf den Sport konzentrieren",
            effects: { attributes: { mentalitaet: 1 }, logText: "hat sich vorerst gegen eine Beziehung und für den Sport entschieden.", logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "beziehung_neu",
    category: "beziehung",
    minAge: 20,
    maxAge: 34,
    weight: 2,
    exclusiveGroup: "beziehung_start",
    condition: (p) => p.relationshipStatus === "single",
    build: (_p, ctx) => {
      const name = randomPartnerName(ctx.rng);
      return {
        category: "beziehung",
        title: "Neue Bekanntschaft",
        description: `Über gemeinsame Freunde lernst du ${name} kennen. Es funkt sofort.`,
        choices: [
          {
            id: "verlieben",
            label: `Kontakt zu ${name} vertiefen`,
            effects: { relationshipStatus: "in_beziehung", partnerName: name, morale: 7, logText: `hat mit ${name} eine neue Beziehung begonnen.`, logKind: "positive" },
          },
          {
            id: "nein",
            label: "Erstmal Single bleiben",
            effects: { logText: "hat sich vorerst gegen eine neue Beziehung entschieden.", logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "beziehung_liebe_im_alter",
    category: "beziehung",
    minAge: 30,
    maxAge: 41,
    weight: 1.8,
    exclusiveGroup: "beziehung_start",
    condition: (p) => p.relationshipStatus === "single" && p.age >= 30,
    build: (p, ctx) => {
      const name = randomPartnerName(ctx.rng);
      const hasKids = p.children > 0;
      return {
        category: "beziehung",
        title: "Zweite Chance auf die große Liebe",
        description: hasKids
          ? `Mit ${p.age} Jahren lernst du überraschend ${name} kennen - eine zweite Chance auf die große Liebe, die du nicht mehr erwartet hattest. Mit ${p.children} Kind(ern) ist die Entscheidung diesmal aber nicht nur deine eigene.`
          : `Mit ${p.age} Jahren lernst du überraschend ${name} kennen - eine zweite Chance auf die große Liebe, die du nicht mehr erwartet hattest.`,
        choices: hasKids
          ? [
              {
                id: "einlassen",
                label: "Sich vorsichtig darauf einlassen, Kinder im Blick behalten",
                detail: "Schön, aber emotional nicht einfach - die Familiensituation macht es komplizierter.",
                effects: {
                  relationshipStatus: "in_beziehung",
                  partnerName: name,
                  morale: 6,
                  attributes: { mentalitaet: -1 },
                  logText: `lässt sich vorsichtig auf die unerwartete neue Liebe mit ${name} ein - mit Rücksicht auf die Kinder emotional keine leichte Entscheidung.`,
                  logKind: "positive",
                },
              },
              {
                id: "abwarten",
                label: "Erstmal abwarten - die Kinder sollen nicht noch mehr Veränderung erleben",
                effects: { logText: "stellt die Bedürfnisse der Kinder vorerst über die eigene neue Liebe.", logKind: "info" },
              },
            ]
          : [
              {
                id: "einlassen",
                label: "Sich voll darauf einlassen",
                effects: {
                  relationshipStatus: "in_beziehung",
                  partnerName: name,
                  morale: 10,
                  logText: `hat sich mit ${name} auf eine unerwartete zweite Liebe eingelassen.`,
                  logKind: "positive",
                },
              },
              {
                id: "abwarten",
                label: "Vorsichtig bleiben",
                effects: { logText: "bleibt vorerst vorsichtig - noch nicht bereit für eine neue Beziehung.", logKind: "info" },
              },
            ],
      };
    },
  },
  {
    id: "beziehungskonflikt",
    category: "beziehung",
    minAge: 18,
    maxAge: 36,
    weight: 2,
    exclusiveGroup: "beziehung_crisis",
    // Echter Auslöser statt reiner Stimmungstext: die Beschreibung spricht von
    // "vielen Reisen und Einsätzen" - das soll auch mechanisch stimmen, nicht
    // pauschal für jeden Spieler in einer Beziehung gelten. Greift daher nur bei
    // einer wirklich reisereichen Kaderrolle (Stammspieler/Rotation) ODER einer
    // nachweislich vollen letzten Saison (viele Spiele).
    condition: (p) => {
      if (!(p.relationshipStatus === "in_beziehung" || p.relationshipStatus === "verlobt" || p.relationshipStatus === "verheiratet")) {
        return false;
      }
      const busyRole = p.contract.squadRole === "Stammspieler" || p.contract.squadRole === "Rotation";
      const lastSeason = p.seasonHistory[p.seasonHistory.length - 1];
      const busySchedule = lastSeason ? lastSeason.matches >= 12 : false;
      return busyRole || busySchedule;
    },
    build: (p) => {
      const status = p.relationshipStatus;
      return {
        category: "beziehung",
        title: "Stress in der Beziehung",
        description: `Die vielen Reisen, Trainingslager und der Rummel um deine Person belasten die Beziehung mit ${p.partnerName ?? "deiner Partnerin/deinem Partner"}.`,
        choices: [
          {
            id: "zeit",
            label: "Bewusst Zeit investieren",
            effects: { morale: 4, fitness: -3, logText: "hat gezielt Zeit in die Beziehung investiert.", logKind: "positive" },
          },
          {
            id: "schleifen",
            label: "Erstmal weiterlaufen lassen",
            effects: {},
            followUpChance: {
              chance: 0.55,
              success: { morale: 2, logText: "hat die Beziehungskrise ohne große Aussprache überstanden.", logKind: "info" },
              failure: {
                relationshipStatus: "single",
                partnerName: null,
                morale: -10,
                reputation: -2,
                logText: `${breakupPastPhrase(status)} - die Beziehung ist an der Belastung durch die Karriere zerbrochen.`,
                logKind: "negative",
              },
            },
          },
          {
            id: "trennen",
            label: "Die Beziehung beenden",
            effects: {
              relationshipStatus: "single",
              partnerName: null,
              morale: -6,
              logText: `${breakupPastPhrase(status)}, um sich auf die Karriere zu konzentrieren.`,
              logKind: "negative",
            },
          },
        ],
      };
    },
  },
  {
    id: "beziehung_auslandswechsel_risiko",
    category: "beziehung",
    minAge: 19,
    maxAge: 37,
    weight: 1.6,
    exclusiveGroup: "beziehung_crisis",
    // Auslöser: ein FRISCHER Wechsel, der aktuell im Ausland endet - entweder der
    // erste Schritt weg von der Heimat oder ein weiterer Sprung von einem
    // Auslandsverein zum nächsten. Beides stellt eine bestehende Beziehung vor
    // dieselbe Grundfrage: mitziehen, Fernbeziehung wagen oder trennen.
    condition: (p) =>
      (p.relationshipStatus === "in_beziehung" || p.relationshipStatus === "verlobt" || p.relationshipStatus === "verheiratet") &&
      p.country !== p.homeCountryId &&
      recentlyTransferred(p),
    build: (p) => {
      const realName = p.partnerName;
      const name = realName ?? "deine Partnerin/dein Partner";
      const status = p.relationshipStatus;
      return {
        category: "beziehung",
        title: "Fernbeziehung oder Umzug?",
        description: `Der Wechsel ins Ausland zu ${club(p)} stellt die Beziehung mit ${name} auf die Probe: gemeinsam auswandern, die Distanz überbrücken oder einen Schlussstrich ziehen?`,
        choices: [
          {
            id: "umzug",
            label: `${name} zieht mit`,
            detail: "Große gemeinsame Veränderung - kostet Geld und Eingewöhnungszeit, stärkt aber den Rückhalt.",
            effects: {
              wealth: -15000,
              morale: 6,
              clubRelation: 2,
              logText: `ist mit ${name} gemeinsam ins Ausland gezogen - ein mutiger Neuanfang zu zweit.`,
              logKind: "positive",
            },
          },
          {
            id: "fernbeziehung",
            label: "Fernbeziehung wagen",
            detail: "Bleibt vorerst getrennt wohnen - ob die Beziehung die Distanz übersteht, ist offen.",
            effects: {},
            followUpChance: {
              chance: 0.5,
              success: {
                morale: 2,
                traitDeltas: { disziplin: 1 },
                logText: `hält die Fernbeziehung mit ${name} über die Distanz erstaunlich gut durch.`,
                logKind: "positive",
              },
              failure: {
                relationshipStatus: "single",
                partnerName: null,
                // Trennung durch den Auslandswechsel - Grundlage für ein mögliches
                // Wiederaufflammen nach der Rückkehr in die Heimat (siehe
                // "beziehung_alte_liebe_zurueck").
                exPartnerName: realName,
                morale: -9,
                logText: `${breakupPastPhrase(status)} - die Fernbeziehung mit ${name} ist an der Distanz zum neuen Auslandsverein zerbrochen.`,
                logKind: "negative",
              },
            },
          },
          {
            id: "trennen",
            label: "Einvernehmlich trennen",
            detail: "Reiner Schnitt vor dem Neuanfang - schmerzhaft, aber klar.",
            effects: {
              relationshipStatus: "single",
              partnerName: null,
              exPartnerName: realName,
              morale: -5,
              logText: `${breakupFromPhrase(status, name)} - einvernehmlich, vor dem Auslandswechsel.`,
              logKind: "negative",
            },
          },
        ],
      };
    },
  },
  {
    id: "beziehung_eigene_lustlosigkeit",
    category: "beziehung",
    minAge: 21,
    maxAge: 38,
    weight: 1.4,
    exclusiveGroup: "beziehung_crisis",
    // Bewusster Gegenpol zu "beziehungskonflikt" (Belastung durch die Karriere)
    // und "beziehung_auslandswechsel_risiko" (äußerer Auslöser): hier liegt es
    // nicht am Partner oder den Umständen, sondern an der eigenen schwindenden
    // Begeisterung - ein ehrlicherer, unbequemerer Auslöser.
    condition: (p) => p.relationshipStatus === "in_beziehung" || p.relationshipStatus === "verlobt" || p.relationshipStatus === "verheiratet",
    build: (p) => {
      const name = p.partnerName ?? "deiner Partnerin/deinem Partner";
      const status = p.relationshipStatus;
      const bondNoun = status === "verheiratet" ? "Ehe" : status === "verlobt" ? "Verlobung" : "Beziehung";
      return {
        category: "beziehung",
        title: "Der Funke fehlt",
        description: `Du merkst: Die Begeisterung für die Beziehung mit ${name} ist nicht mehr da wie früher - und es liegt diesmal nicht am Trubel um die Karriere, sondern an dir selbst.`,
        choices: [
          {
            id: "ansprechen",
            label: "Ehrlich ansprechen und aktiv daran arbeiten",
            detail: "Unangenehmes Gespräch - echte Chance, die Beziehung neu zu beleben.",
            effects: {},
            followUpChance: {
              chance: 0.6,
              success: {
                morale: 5,
                traitDeltas: { fuehrung: 1 },
                logText: `hat die eigene Lustlosigkeit offen angesprochen - das ehrliche Gespräch hat die Beziehung mit ${name} neu belebt.`,
                logKind: "positive",
              },
              failure: {
                relationshipStatus: "single",
                partnerName: null,
                morale: -4,
                logText: `hat die eigene Lustlosigkeit offen angesprochen - das Gespräch hat nur bestätigt: die ${bondNoun} mit ${name} ist am Ende.`,
                logKind: "negative",
              },
            },
          },
          {
            id: "beenden",
            label: "Sich ehrlich eingestehen und Schluss machen",
            detail: "Kein äußerer Anlass, nur die eigene Ehrlichkeit - ein sauberer, fairer Schnitt.",
            effects: {
              relationshipStatus: "single",
              partnerName: null,
              morale: -4,
              traitDeltas: { disziplin: 1 },
              logText: `hat sich eingestanden, selbst nicht mehr voll bei der Sache zu sein, und ${breakupFromPhrase(status, name)}.`,
              logKind: "negative",
            },
          },
          {
            id: "ignorieren",
            label: "Einfach weiterlaufen lassen, ohne es anzusprechen",
            detail: "Wenig Ehrlichkeit sich selbst gegenüber - riskiert ein böses Erwachen.",
            effects: {},
            followUpChance: {
              chance: 0.35,
              success: {
                logText: "hat die eigene Lustlosigkeit einfach ignoriert - die Beziehung läuft äußerlich unverändert weiter.",
                logKind: "info",
              },
              failure: {
                relationshipStatus: "single",
                partnerName: null,
                morale: -9,
                reputation: -1,
                logText: `hat die eigene Lustlosigkeit einfach ignoriert, bis die ${bondNoun} mit ${name} daran zerbrochen ist.`,
                logKind: "negative",
              },
            },
          },
        ],
      };
    },
  },
  {
    id: "beziehung_alte_liebe_zurueck",
    category: "beziehung",
    minAge: 19,
    maxAge: 40,
    weight: 2.5,
    // Nur einmal pro Karriere relevant - hängt an einem konkreten Ex-Partner/einer
    // konkreten Ex-Partnerin (siehe `exPartnerName`), nicht an einem wiederholbaren
    // Muster.
    unique: true,
    exclusiveGroup: "beziehung_start",
    // Setzt voraus: aktuell Single UND ein offener Handlungsstrang aus einer
    // früheren Trennung durch Auslandswechsel (siehe `beziehung_auslandswechsel_risiko`
    // - `exPartnerName` wird NUR dort gesetzt).
    // War früher zusätzlich an `p.country === p.homeCountryId` ("erst nach Rückkehr in
    // die Heimat") gekoppelt - laut Simulation (1500 Karrieren) hat das Event dadurch
    // NIE gefeuert: Die "Zweiter Frühling"-Mechanik boostet nach der Trennung alle
    // Beziehungs-Start-Events gleichermaßen (inkl. diesem hier), aber die anderen
    // (erste_liebe, beziehung_neu, beziehung_liebe_im_alter) haben keine
    // Heimat-Bedingung und lösen die Single-Phase meist schon auf, bevor überhaupt ein
    // Wechsel zurück in die Heimat stattfindet. Bedingung auf "single + exPartnerName"
    // reduziert - eine Nachricht per WhatsApp funktioniert auch aus der Ferne, der
    // Text unterscheidet nur noch, ob man zufällig gerade daheim ist oder nicht.
    condition: (p) => p.relationshipStatus === "single" && !!p.exPartnerName,
    build: (p) => {
      const name = p.exPartnerName ?? "der alten Liebe";
      const isHome = p.country === p.homeCountryId;
      return {
        category: "beziehung",
        title: "Nachricht aus alten Zeiten",
        description: isHome
          ? `Zurück in der Heimat meldet sich unerwartet ${name} per WhatsApp - die Person, von der du dich damals wegen des Auslandswechsels getrennt hattest. Ob sich nach der Zeit und der Distanz wieder etwas anknüpfen lässt?`
          : `Aus heiterem Himmel meldet sich ${name} per WhatsApp - die Person, von der du dich damals wegen des Auslandswechsels getrennt hattest. Auch über die Entfernung hinweg scheint da noch etwas zu sein. Ob sich nach der Zeit wieder etwas anknüpfen lässt?`,
        choices: [
          {
            id: "antworten_treffen",
            label: "Antworten und sich treffen",
            detail: "Ein echter zweiter Anlauf - ob der alte Funke wieder überspringt, ist offen.",
            effects: {},
            followUpChance: {
              chance: 0.6,
              success: {
                relationshipStatus: "in_beziehung",
                partnerName: name,
                exPartnerName: null,
                morale: 12,
                reputation: 1,
                logText: isHome
                  ? `hat sich nach der Rückkehr in die Heimat mit der alten Liebe ${name} wiedergefunden.`
                  : `hat trotz der Entfernung wieder zur alten Liebe ${name} gefunden.`,
                logKind: "positive",
              },
              failure: {
                exPartnerName: null,
                morale: -3,
                logText: `hat sich mit ${name} getroffen - der alte Funke war nach der Zeit auseinander aber einfach nicht mehr da.`,
                logKind: "negative",
              },
            },
          },
          {
            id: "freundlich_ablehnen",
            label: "Freundlich, aber bestimmt ablehnen",
            detail: "Klarer Schnitt - die Vergangenheit bleibt Vergangenheit.",
            effects: {
              exPartnerName: null,
              logText: `hat der Nachricht von ${name} freundlich, aber bestimmt eine Absage erteilt.`,
              logKind: "info",
            },
          },
          {
            id: "nicht_antworten",
            label: "Nicht antworten",
            detail: "Die Nachricht bleibt unbeantwortet im Chat stehen.",
            effects: {
              exPartnerName: null,
              logText: `hat auf die Nachricht von ${name} gar nicht erst reagiert.`,
              logKind: "info",
            },
          },
        ],
      };
    },
  },
  {
    id: "heiratsantrag",
    category: "beziehung",
    minAge: 19,
    maxAge: 36,
    // Höheres Gewicht, weil die Bedingung (in einer Beziehung + Mindestalter) den
    // Pool ohnehin stark einschränkt - sonst bleibt die Beziehung oft jahrelang
    // ohne Fortschritt hängen, weil das Gewicht gegen den riesigen Gesamtpool
    // kaum ins Gewicht fällt.
    weight: 3,
    condition: (p) => p.relationshipStatus === "in_beziehung" && p.age >= minMarriageAge(p.education),
    build: (p) => ({
      category: "beziehung",
      title: "Der große Antrag",
      description: `Du überlegst, ${p.partnerName ?? "deiner Partnerin/deinem Partner"} einen Heiratsantrag zu machen.`,
      choices: [
        {
          id: "antrag",
          label: "Den Antrag machen",
          effects: { relationshipStatus: "verlobt", morale: 10, reputation: 2, logText: `hat sich mit ${p.partnerName ?? "der großen Liebe"} verlobt.`, logKind: "milestone" },
        },
        {
          id: "warten",
          label: "Noch warten",
          effects: { logText: "wartet mit dem Antrag noch ab.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "hochzeit",
    category: "beziehung",
    minAge: 20,
    maxAge: 37,
    weight: 2,
    condition: (p) => p.relationshipStatus === "verlobt",
    build: (p) => ({
      category: "beziehung",
      title: "Die Hochzeit",
      description: `Es ist so weit: Du heiratest ${p.partnerName ?? "deine große Liebe"}. Groß und öffentlich feiern oder klein und privat?`,
      choices: [
        {
          id: "gross",
          label: "Große Promi-Hochzeit",
          effects: {
            relationshipStatus: "verheiratet",
            wealth: -25000,
            reputation: 12,
            morale: 12,
            logText: `hat ${p.partnerName ?? "die große Liebe"} in einer aufwendigen Promi-Hochzeit geheiratet - Magazine haben exklusive Fotorechte gekauft.`,
            logKind: "milestone",
          },
        },
        {
          id: "klein",
          label: "Kleine, private Feier",
          effects: {
            relationshipStatus: "verheiratet",
            wealth: -5000,
            morale: 10,
            clubRelation: 2,
            logText: `hat ${p.partnerName ?? "die große Liebe"} im kleinen Kreis geheiratet - einige Teamkollegen waren gerührt eingeladen.`,
            logKind: "milestone",
          },
        },
      ],
    }),
  },
  {
    id: "schwiegereltern",
    category: "beziehung",
    minAge: 20,
    maxAge: 36,
    weight: 1,
    condition: (p) => p.relationshipStatus === "verlobt" || p.relationshipStatus === "verheiratet",
    build: () => ({
      category: "beziehung",
      title: "Die Schwiegereltern",
      description: "Das erste große Familienessen mit den Schwiegereltern steht an.",
      choices: [
        {
          id: "diplomatisch",
          label: "Charmant und diplomatisch auftreten",
          effects: { reputation: 2, morale: 3, logText: "hat die Schwiegereltern für sich gewonnen.", logKind: "positive" },
        },
        {
          id: "locker",
          label: "Einfach man selbst sein",
          effects: {},
          followUpChance: {
            chance: 0.6,
            success: { morale: 3, logText: "kam bei den Schwiegereltern gut an, ganz ohne sich zu verstellen.", logKind: "positive" },
            failure: { morale: -2, logText: "hat sich beim Familienessen einen kleinen Fauxpas erlaubt.", logKind: "negative" },
          },
        },
      ],
    }),
  },
  {
    id: "kind_geboren",
    category: "beziehung",
    minAge: 21,
    maxAge: 39,
    // Höheres Gewicht aus demselben Grund wie bei "heiratsantrag" - die Bedingung
    // grenzt den Pool bereits stark ein.
    weight: 3,
    // Auf Wunsch bewusst auch für "in_beziehung" geöffnet (nicht nur verlobt/
    // verheiratet) - Nachwuchs ohne Trauschein ist realistisch genauso möglich.
    condition: (p) =>
      (p.relationshipStatus === "verheiratet" || p.relationshipStatus === "verlobt" || p.relationshipStatus === "in_beziehung") &&
      p.age >= minMarriageAge(p.education) + 2,
    build: (p) => ({
      category: "beziehung",
      title: "Nachwuchs",
      description: `${p.partnerName ?? "Deine Partnerin/dein Partner"} und du werdet Eltern - wie organisiert ihr die ersten Monate?`,
      choices: [
        {
          id: "elternzeit",
          label: "Elternzeit voll ausschöpfen, Verein informieren",
          detail: "Kurzer Ausfall, klare Kommunikation - danach meist stabilisierender Effekt.",
          effects: {
            morale: 15,
            injuryWeeksOut: 2,
            injuryLabel: "Elternzeit",
            childrenDelta: 1,
            logText: "ist Elternteil geworden und hat die Elternzeit voll ausgeschöpft.",
            logKind: "milestone",
          },
        },
        {
          id: "training",
          label: "Sehr kurze Pause, schnell zurück ins Training",
          detail: "Wenig Ausfallzeit, aber Schlafmangel kann auf die Form drücken.",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { morale: 8, attributes: { physis: 1 }, childrenDelta: 1, logText: "ist Elternteil geworden, war aber schon nach kurzer Zeit zurück im Training - die Balance gelingt.", logKind: "milestone" },
            failure: {
              morale: 2,
              fitness: -5,
              childrenDelta: 1,
              logText: "ist Elternteil geworden und schnell zurück ins Training - der Schlafmangel drückt spürbar auf die Form.",
              logKind: "negative",
            },
          },
        },
        {
          id: "unterstuetzung",
          label: "Familie organisiert Unterstützung (Großeltern, Nanny)",
          detail: "Moderate Belastung, meist eine gute Balance.",
          effects: {
            wealth: -8000,
            morale: 10,
            fitness: -1,
            childrenDelta: 1,
            logText: "ist Elternteil geworden und hat sich mit organisierter Unterstützung (Großeltern, Nanny) eine gute Balance geschaffen.",
            logKind: "milestone",
          },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // VETERAN / SPÄTPHASE (30+)
  // ---------------------------------------------------------------------
  {
    id: "veteran_mentor",
    category: "meilenstein",
    minAge: 30,
    maxAge: 40,
    weight: 2,
    build: (p) => ({
      category: "meilenstein",
      title: "Rolle als Mentor",
      description: `Junge Talente bei ${club(p)} bitten dich immer wieder um Rat.`,
      choices: [
        {
          id: "investieren",
          label: "Zeit in die jungen Spieler investieren",
          effects: { attributes: { mentalitaet: 1, charisma: 1 }, clubRelation: 5, fitness: -2, traitDeltas: { fuehrung: 5 }, logText: "hat sich als Mentor für die jungen Spieler im Kader engagiert.", logKind: "positive" },
        },
        {
          id: "fokus",
          label: "Sich auf die eigene Fitness konzentrieren",
          effects: { attributes: { physis: 1 }, logText: "hat sich lieber auf die eigene Fitness konzentriert.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "veteran_trainerschein",
    category: "meilenstein",
    minAge: 30,
    maxAge: 40,
    weight: 1,
    build: () => ({
      category: "meilenstein",
      title: "Trainerschein-Lehrgang",
      description: "Der Verband bietet berufsbegleitende Trainerlehrgänge an - eine Investition in die Zeit nach der Karriere.",
      choices: [
        {
          id: "ja",
          label: "Lehrgang beginnen",
          effects: { educationPoints: 10, attributes: { intelligenz: 1 }, fitness: -3, logText: "hat mit einem Trainerschein-Lehrgang begonnen.", logKind: "positive" },
        },
        {
          id: "nein",
          label: "Sich voll auf die aktive Karriere konzentrieren",
          effects: { logText: "hat sich gegen den Trainerschein-Lehrgang entschieden.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "veteran_abschiedsspiel",
    category: "meilenstein",
    minAge: 33,
    maxAge: 40,
    weight: 1,
    unique: true,
    condition: (p) => p.clubRelation > 60,
    build: (p) => ({
      category: "meilenstein",
      title: "Testimonial-Spiel",
      description: `${club(p)} bietet dir zu Ehren deiner langen Karriere ein Testimonial-Spiel an.`,
      choices: [
        {
          id: "ja",
          label: "Angebot annehmen",
          effects: { wealth: 20000, reputation: 8, morale: 10, logText: "wurde mit einem Testimonial-Spiel für die lange Karriere geehrt.", logKind: "milestone" },
        },
        {
          id: "nein",
          label: "Lieber bescheiden bleiben",
          effects: { clubRelation: 3, logText: "hat auf ein großes Testimonial-Spiel verzichtet.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "veteran_regeneration",
    category: "training",
    minAge: 30,
    maxAge: 40,
    weight: 1.4,
    build: (p, ctx) => ({
      category: "training",
      title: "Der Kampf gegen die Uhr",
      description: `Der Körper erholt sich nicht mehr wie mit 20 - der Athletiktrainer von ${club(p)} rät zu einem angepassten Trainingspensum.`,
      choices: [
        {
          id: "reduzieren",
          label: "Pensum bewusst reduzieren, auf Regeneration setzen",
          effects: { fitness: rInt(ctx, 5, 9), traitDeltas: { disziplin: 1 }, logText: "hat das Trainingspensum bewusst reduziert und auf Regeneration gesetzt.", logKind: "positive" },
        },
        {
          id: "vollgas",
          label: "Weiter Vollgas geben wie eh und je",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { attributes: { physis: 1 }, traitDeltas: { arbeitsmoral: 2 }, logText: "hat trotz des Alters weiter Vollgas gegeben und sich behauptet.", logKind: "positive" },
            failure: { injuryWeeksOut: rInt(ctx, 3, 6), injuryLabel: "Überlastung", fitness: -6, logText: "hat sich mit dem alten Trainingspensum überlastet.", logKind: "negative" },
          },
        },
      ],
    }),
  },
  {
    id: "veteran_binde_abgeben",
    category: "meilenstein",
    minAge: 32,
    maxAge: 40,
    weight: 1,
    unique: true,
    condition: (p) => p.traits.fuehrung >= 55 && p.clubRelation > 50,
    build: (p) => ({
      category: "meilenstein",
      title: "Die Binde geht weiter",
      description: `Der Trainer von ${club(p)} findet, es sei Zeit, die Kapitänsbinde an einen jüngeren Spieler weiterzureichen.`,
      choices: [
        {
          id: "wuerdevoll",
          label: "Die Rolle würdevoll abgeben und als Vorbild wirken",
          effects: { clubRelation: 6, reputation: 4, traitDeltas: { fuehrung: 3 }, logText: "hat die Kapitänsbinde würdevoll an einen jüngeren Spieler weitergegeben.", logKind: "positive" },
        },
        {
          id: "kaempfen",
          label: "Um die Binde kämpfen",
          effects: { morale: 4, clubRelation: -5, traitDeltas: { fuehrung: -1 }, logText: "hat um die Kapitänsbinde gekämpft, statt sie kampflos abzugeben.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "veteran_lockruf_geld",
    category: "transfer",
    minAge: 32,
    // Bewusst enger als das frühere maxAge:38 (Bugreport: Event kam kurz vor
    // Karriereende, "letzter großer Zahltag" konnte praktisch nicht mehr
    // ausgekostet werden) - typischerweise um 34 gedacht, siehe unten zusätzlich
    // die Sperre für Spieler, die ohnehin schon knapp vor dem Karriereende stehen.
    maxAge: 35,
    weight: 1,
    // `!isNearRetirement(p)`: kein "letzter großer Zahltag" mehr anbieten, wenn die
    // Karriere durch Leistungsabbau/Fitness ohnehin gleich zu Ende geht - sonst
    // wirkt der große Wechsel sinnlos, weil kaum noch Zeit bleibt, ihn zu erleben.
    condition: (p) => p.reputation > 55 && !isNearRetirement(p),
    build: (p, ctx) => {
      const wealthGain = rInt(ctx, 400, 900) * 1000;
      return {
        category: "transfer",
        title: "Lockruf des großen Geldes",
        description: `Ein finanzstarker Verein aus einer weniger konkurrenzfähigen Liga will dich von ${club(p)} weglocken - ein letzter großer, gut dotierter Vertrag vor dem Karriereende.`,
        choices: [
          {
            id: "wechseln",
            label: "Den lukrativen Wechsel wagen",
            effects: {
              wealth: wealthGain,
              reputation: -6,
              morale: 6,
              wantsTransfer: true,
              logText: `hat sich für den letzten großen Zahltag entschieden und wechselt in eine weniger konkurrenzfähige Liga (+${Math.round(wealthGain / 1000)} Tsd €).`,
              logKind: "info",
            },
          },
          {
            id: "ablehnen",
            label: "Sportlichen Ehrgeiz über das Geld stellen",
            effects: { reputation: 3, clubRelation: 4, traitDeltas: { arbeitsmoral: 2 }, logText: "hat den lukrativen Lockruf abgelehnt und den sportlichen Ehrgeiz über das Geld gestellt.", logKind: "positive" },
          },
        ],
      };
    },
  },
  {
    id: "veteran_tv_experte",
    category: "medien",
    minAge: 30,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.traits.medienimage >= 45,
    build: () => ({
      category: "medien",
      title: "Erste Angebote als TV-Experte",
      description: "Ein Sportsender fragt an, ob du schon während der aktiven Karriere gelegentlich als Experte vor der Kamera auftreten willst - eine frühe Investition in die Zeit danach.",
      choices: [
        {
          id: "annehmen",
          label: "Erste TV-Auftritte annehmen",
          effects: { wealth: 12000, traitDeltas: { medienimage: 3 }, fitness: -2, logText: "hat neben der aktiven Karriere erste Auftritte als TV-Experte angenommen.", logKind: "positive" },
        },
        {
          id: "ablehnen",
          label: "Sich voll aufs Feld konzentrieren",
          effects: { attributes: { mentalitaet: 1 }, logText: "hat sich lieber voll auf das Sportliche konzentriert statt auf TV-Auftritte.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "veteran_familie_karriere",
    category: "beziehung",
    minAge: 30,
    maxAge: 40,
    weight: 1.2,
    condition: (p) => p.relationshipStatus === "verheiratet" || p.children > 0,
    build: (p) => ({
      category: "beziehung",
      title: "Die Familie wächst mit der Karriere",
      description: `Zwischen Auswärtsspielen, Lehrgängen und dem Alltag bei ${club(p)} wird es zunehmend schwerer, genug Zeit für die Familie zu finden.`,
      choices: [
        {
          id: "familie",
          label: "Bewusst mehr Zeit für die Familie freihalten",
          effects: { morale: 6, attributes: { mentalitaet: 1 }, clubRelation: -2, logText: "hält sich bewusst mehr Zeit für die Familie frei.", logKind: "positive" },
        },
        {
          id: "karriere",
          label: "Der Karriere weiter Priorität geben",
          effects: { reputation: 3, clubRelation: 3, morale: -4, logText: "gibt der Karriere weiter klar Priorität vor dem Familienleben.", logKind: "negative" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // ZUFALLSEREIGNISSE (positiv & negativ, unabhängig von der Karrierephase)
  // ---------------------------------------------------------------------
  {
    id: "fan_liebling",
    category: "medien",
    minAge: 18,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.reputation > 30,
    build: () => ({
      category: "medien",
      title: "Fan-Liebling",
      description: "Die Fans wählen dich in einer Umfrage zum Publikumsliebling der Saison.",
      choices: [
        {
          id: "annehmen",
          label: "Die Ehre genießen",
          effects: { reputation: 6, morale: 8, traitDeltas: { medienimage: 4 }, logText: "wurde von den Fans zum Publikumsliebling gewählt.", logKind: "positive" },
        },
      ],
    }),
  },
  {
    id: "erbschaft",
    category: "lifestyle",
    minAge: 22,
    maxAge: 40,
    weight: 1,
    build: (p) => {
      // Wer sich gut mit Finanzen/Verträgen auskennt (Bildung), holt beim Regeln
      // eines Nachlasses spürbar mehr heraus - eine echte Entscheidung statt
      // reinem Zufallsgeld ohne jeden Bezug zum Spieler.
      const financialSkill = clamp(0.35 + p.education / 200, 0.35, 0.8);
      return {
        category: "lifestyle",
        title: "Unerwartetes Erbe",
        description: "Ein entfernter Verwandter ist verstorben und hinterlässt dir ein kleines Vermögen - der Nachlass muss geregelt werden.",
        choices: [
          {
            id: "verwalter",
            label: "Einem Nachlassverwalter überlassen",
            effects: { wealth: 15000, logText: "hat eine Erbschaft einem Nachlassverwalter überlassen.", logKind: "positive" },
          },
          {
            id: "selbst",
            label: "Sich selbst um den Nachlass kümmern",
            effects: {},
            followUpChance: {
              chance: financialSkill,
              success: { wealth: 45000, educationPoints: 1, logText: "hat den Nachlass geschickt selbst geregelt und deutlich mehr herausgeholt.", logKind: "positive" },
              failure: { wealth: 5000, morale: -2, logText: "hat sich beim eigenständigen Regeln des Nachlasses verzettelt - am Ende blieb kaum etwas übrig.", logKind: "negative" },
            },
          },
        ],
      };
    },
  },
  {
    id: "steuerproblem",
    category: "lifestyle",
    minAge: 20,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.wealth > 20000,
    build: () => ({
      category: "lifestyle",
      title: "Ärger mit dem Finanzamt",
      description: "Dein Finanzberater hat Fehler gemacht - eine Steuernachzahlung steht an.",
      choices: [
        {
          id: "zahlen",
          label: "Nachzahlung begleichen",
          effects: { wealth: -20000, morale: -3, logText: "musste eine unangenehme Steuernachzahlung leisten.", logKind: "negative" },
        },
        {
          id: "anwalt",
          label: "Anwalt einschalten und anfechten",
          effects: {},
          followUpChance: {
            chance: 0.4,
            success: { wealth: -5000, logText: "hat die Steuernachforderung mit anwaltlicher Hilfe deutlich reduziert.", logKind: "positive" },
            failure: { wealth: -24000, morale: -4, logText: "hat den Steuerstreit verloren und zusätzlich Anwaltskosten gezahlt.", logKind: "negative" },
          },
        },
      ],
    }),
  },
  {
    id: "skandal_boulevard",
    category: "medien",
    minAge: 18,
    maxAge: 38,
    weight: 1,
    build: () => ({
      category: "medien",
      title: "Boulevard-Schlagzeile",
      description: "Eine Boulevardzeitung bringt eine reißerische, halb erfundene Geschichte über dein Privatleben.",
      choices: [
        {
          id: "rechtlich",
          label: "Rechtlich dagegen vorgehen",
          effects: { wealth: -8000, reputation: 3, traitDeltas: { medienimage: 1 }, logText: "ist rechtlich gegen eine Boulevard-Geschichte vorgegangen.", logKind: "info" },
        },
        {
          id: "kontern",
          label: "Selbstironisch in den sozialen Medien kontern",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { reputation: 6, morale: 3, traitDeltas: { medienimage: 5 }, logText: "hat eine Boulevard-Schlagzeile mit Humor gekontert und Sympathien gesammelt.", logKind: "positive" },
            failure: { reputation: -5, traitDeltas: { medienimage: -6 }, logText: "ist mit einem missglückten Konter zur Schlagzeile selbst zum Gespött geworden.", logKind: "negative" },
          },
        },
        {
          id: "ignorieren",
          label: "Ignorieren",
          effects: { reputation: -2, traitDeltas: { medienimage: -3 }, logText: "hat eine Boulevard-Schlagzeile einfach ignoriert.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "autounfall_schreck",
    category: "lifestyle",
    minAge: 18,
    maxAge: 38,
    weight: 1,
    build: (p) => {
      // Reaktionsvermögen/Nervenstärke (Mentalität) beeinflusst, wie glimpflich der
      // Schreckmoment ausgeht - keine reine Zufallsentscheidung ohne Spielerbezug.
      const chance = clamp(0.6 + (p.attributes.mentalitaet - 50) / 200, 0.5, 0.85);
      return {
        category: "lifestyle",
        title: "Schreckmoment im Straßenverkehr",
        description: "Auf dem Weg zum Training kommt dir im dichten Verkehr ein Auto gefährlich nah.",
        choices: [
          {
            id: "weiter",
            label: "Ruhig bleiben und weiterfahren",
            effects: {},
            followUpChance: {
              chance,
              success: { morale: -1, logText: "kam mit dem Schrecken im Straßenverkehr davon.", logKind: "info" },
              failure: { injuryWeeksOut: 4, injuryLabel: "Schleudertrauma", morale: -5, logText: "hat bei einem doch nicht ganz vermiedenen Unfall eine Verletzung davongetragen.", logKind: "negative" },
            },
          },
          {
            id: "anhalten",
            label: "Sofort anhalten und durchatmen",
            effects: { fitness: -2, morale: -1, logText: "hat nach dem Schreckmoment im Verkehr sofort angehalten, um durchzuatmen - kein Risiko eingegangen.", logKind: "info" },
          },
        ],
      };
    },
  },
  {
    id: "modelvertrag",
    category: "sponsoring",
    minAge: 19,
    maxAge: 36,
    weight: 1,
    condition: (p) => p.attributes.charisma > 55,
    build: () => ({
      category: "sponsoring",
      title: "Angebot als Werbegesicht",
      description: "Eine Modeagentur will dich als Gesicht einer neuen Kampagne buchen.",
      choices: [
        {
          id: "ja",
          label: "Zusagen",
          effects: { wealth: 20000, reputation: 5, fitness: -2, logText: "wurde als Werbegesicht einer Modekampagne gebucht.", logKind: "positive" },
        },
        {
          id: "nein",
          label: "Ablehnen und beim Sport bleiben",
          effects: { attributes: { mentalitaet: 1 }, logText: "hat ein Modelangebot ausgeschlagen.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // JUGEND (zusätzliche, fußballnahe Ereignisse für die frühen Jahre)
  // ---------------------------------------------------------------------
  {
    id: "jugend_technikpartner",
    category: "training",
    minAge: 14,
    maxAge: 17,
    weight: 2,
    // Teilt sich den Slot mit "jugend_torwarttrainer_akademie" (nur Torhüter,
    // siehe dort) - für Torhüter die passendere, positionsspezifische Wahl.
    exclusiveGroup: "jugend_technik_ausbau",
    build: () => ({
      category: "training",
      title: "Technik-Partnerübungen",
      description: "Ein erfahrener Feldspieler des Vereins bietet an, nach dem Training gemeinsam an Technikdetails zu feilen.",
      choices: [
        {
          id: "annehmen",
          label: "Angebot annehmen",
          effects: { attributes: { technik: 2 }, fitness: -2, logText: "hat mit einem erfahrenen Spieler zusätzliche Technikeinheiten absolviert.", logKind: "positive" },
        },
        {
          id: "ablehnen",
          label: "Lieber mit Gleichaltrigen üben",
          effects: { attributes: { mentalitaet: 1 }, logText: "hat lieber mit der eigenen Altersklasse trainiert.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "jugend_torwarttrainer_akademie",
    category: "jugend",
    minAge: 14,
    maxAge: 18,
    weight: 2,
    condition: (p) => p.position === "TW",
    exclusiveGroup: "jugend_technik_ausbau",
    build: (_p, ctx) => ({
      category: "jugend",
      title: "Eigener Torwarttrainer in der Akademie",
      description: `Die Akademie von ${club(_p)} stellt dir erstmals einen spezialisierten Torwarttrainer für Einzeleinheiten zur Seite.`,
      choices: [
        {
          id: "technik",
          label: "Schwerpunkt Stellungsspiel & Technik",
          effects: {
            attributes: { technik: rInt(ctx, 3, 5), intelligenz: 1 },
            fitness: -3,
            traitDeltas: { arbeitsmoral: 2 },
            logText: "hat mit dem neuen Torwarttrainer intensiv an Stellungsspiel und Technik gearbeitet.",
            logKind: "info",
          },
        },
        {
          id: "reflexe",
          label: "Schwerpunkt Reflexe & Explosivität",
          effects: {
            attributes: { tempo: rInt(ctx, 2, 4), physis: rInt(ctx, 1, 3) },
            fitness: -4,
            traitDeltas: { arbeitsmoral: 1 },
            logText: "hat mit dem neuen Torwarttrainer gezielt Reflexe und Explosivität trainiert.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "jugend_elternabend",
    category: "jugend",
    minAge: 14,
    maxAge: 16,
    weight: 1,
    build: () => ({
      category: "jugend",
      title: "Elternabend beim Verein",
      description: "Der Verein lädt zu einem Gespräch über die weitere sportliche und schulische Zukunft ein.",
      choices: [
        {
          id: "ehrgeiz",
          label: "Ehrgeizige sportliche Ziele formulieren",
          effects: { attributes: { mentalitaet: 1 }, reputation: 1, logText: "hat beim Elternabend ehrgeizige Ziele formuliert.", logKind: "info" },
        },
        {
          id: "balance",
          label: "Auf eine ausgewogene Entwicklung pochen",
          effects: { educationPoints: 4, logText: "hat sich beim Elternabend für eine ausgewogene Entwicklung starkgemacht.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // FUSSBALLALLTAG: TRAINER, TAKTIK, SPIELMOMENTE
  // ---------------------------------------------------------------------
  {
    id: "neuer_trainer",
    category: "meilenstein",
    minAge: 18,
    maxAge: 38,
    weight: 2,
    build: (p, ctx) => {
      // Häufiges Event über die Karriere hinweg (Ø 2.3x) - Text-Varianten aus
      // demselben Grund wie bei den anderen Events oben (siehe dort).
      const variant = pickVariant(ctx, [
        { title: "Neuer Trainer", description: `Bei ${club(p)} übernimmt ein neuer Cheftrainer und stellt Kader sowie eingespielte Automatismen infrage.` },
        { title: "Trainerwechsel", description: `${club(p)} verpflichtet einen neuen Cheftrainer, der von der ersten Einheit an eigene Ideen durchsetzen will.` },
        { title: "Neubesetzung auf der Trainerbank", description: `Nach dem Trainerwechsel bei ${club(p)} stellt der neue Chef von Beginn an alles auf den Prüfstand.` },
        { title: "Frischer Wind an der Seitenlinie", description: `Der neue Cheftrainer von ${club(p)} bringt eigene Automatismen mit und krempelt den Trainingsalltag um.` },
      ]);
      return {
      category: "meilenstein",
      title: variant.title,
      description: variant.description,
      choices: [
        {
          id: "beweisen",
          label: "Sich sofort beweisen wollen",
          effects: { fitness: -3 },
          followUpChance: {
            chance: 0.55,
            success: { clubRelation: 8, morale: 5, traitDeltas: { arbeitsmoral: 2 }, logText: "hat den neuen Trainer von sich überzeugt.", logKind: "positive" },
            failure: { clubRelation: -6, morale: -4, logText: "kommt beim neuen Trainer bislang nicht gut an.", logKind: "negative" },
          },
        },
        {
          id: "abwarten",
          label: "Abwarten und den eigenen Stil zeigen",
          effects: { clubRelation: 2, logText: "lässt sich von der neuen Trainersituation nicht aus der Ruhe bringen.", logKind: "info" },
        },
      ],
      };
    },
  },
  {
    id: "formationswechsel",
    category: "taktik",
    minAge: 18,
    maxAge: 36,
    weight: 2,
    build: (p) => ({
      category: "taktik",
      title: "Taktikumstellung",
      description: `Der Trainerstab von ${club(p)} experimentiert mit einer neuen Formation und will dich auf einer ungewohnten Position testen.`,
      choices: [
        {
          id: "einlassen",
          label: "Sich auf die neue Rolle einlassen",
          effects: {},
          followUpChance: {
            chance: 0.55,
            success: { attributes: { intelligenz: 1 }, clubRelation: 4, logText: "hat sich auf der ungewohnten Position ausgezeichnet geschlagen.", logKind: "positive" },
            failure: { morale: -3, clubRelation: -2, logText: "kam mit der taktischen Umstellung nicht klar.", logKind: "negative" },
          },
        },
        {
          id: "bestehen",
          label: "Auf der angestammten Position bestehen",
          effects: { attributes: { mentalitaet: 1 }, clubRelation: -1, logText: "hat auf der angestammten Position bestanden.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "standardtraining",
    category: "training",
    minAge: 17,
    maxAge: 34,
    weight: 1.4,
    build: (p, ctx) => ({
      category: "training",
      title: "Standardsituationen üben",
      description:
        p.position === "TW"
          ? "Nach dem regulären Training bleibt Zeit für zusätzliches Training gegen Freistöße und Eckbälle - Stellungsspiel, Abklatschen und Herauslaufen."
          : "Nach dem regulären Training bleibt Zeit für zusätzliches Freistoß- und Eckballtraining.",
      choices: [
        {
          id: "investieren",
          label: "Zusätzliche Stunden investieren",
          effects: { attributes: { technik: rInt(ctx, 1, 3) }, fitness: -rInt(ctx, 2, 4), traitDeltas: { arbeitsmoral: 2 }, logText: "hat zusätzliche Stunden ins Standardtraining investiert.", logKind: "info" },
        },
        {
          id: "regenerieren",
          label: "Lieber regenerieren",
          effects: { fitness: rInt(ctx, 2, 5), logText: "hat sich für Regeneration statt Zusatztraining entschieden.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "co_trainer_taktik",
    category: "taktik",
    minAge: 26,
    maxAge: 40,
    weight: 1,
    build: (p) => ({
      category: "taktik",
      title: "Der Co-Trainer bittet um taktischen Input",
      description: `Als erfahrener Spieler wirst du bei ${club(p)} in die Spielvorbereitung einbezogen.`,
      choices: [
        {
          id: "einbringen",
          label: "Sich aktiv einbringen",
          effects: { attributes: { intelligenz: 1, charisma: 1 }, clubRelation: 3, traitDeltas: { fuehrung: 4 }, logText: "hat sich aktiv in die taktische Vorbereitung eingebracht.", logKind: "positive" },
        },
        {
          id: "raushalten",
          label: "Sich raushalten",
          effects: { logText: "hat sich aus der taktischen Vorbereitung rausgehalten.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "pokal_kraftakt",
    category: "taktik",
    minAge: 17,
    maxAge: 40,
    weight: 2,
    build: (p) => ({
      category: "taktik",
      title: "Pokal-Achtelfinale gegen einen Außenseiter",
      description: `${club(p)} tut sich gegen einen krassen Außenseiter überraschend schwer.`,
      choices: [
        {
          id: "vollrisiko",
          label: "Vollrisiko im Angriff gehen",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { reputation: 5, morale: 5, clubRelation: 3, logText: "hat mit einem Kraftakt das Weiterkommen im Pokal klargemacht.", logKind: "positive" },
            // cupExit verhindert, dass die Saison trotz dieses Aus' später doch noch
            // einen Pokaltitel auswürfelt (siehe simulateSeason) - ein gewonnener Pokal
            // NACH einem miterlebten Aus wäre ein handfester Widerspruch im Rückblick.
            failure: { morale: -4, clubRelation: -2, cupExit: true, logText: "hat das peinliche Pokal-Aus gegen einen Außenseiter miterlebt.", logKind: "negative" },
          },
        },
        {
          id: "sicher",
          label: "Auf Nummer sicher spielen",
          effects: { clubRelation: 1, logText: "hat im Pokal auf Nummer sicher gespielt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "hattrick_chance",
    category: "taktik",
    minAge: 17,
    maxAge: 38,
    weight: 1,
    condition: (p) => p.position === "ST" || p.position === "FS",
    build: () => ({
      category: "taktik",
      title: "Der Hattrick lockt",
      description: "Zwei Tore stehen schon zu Buche - eine weitere Großchance bietet sich, doch ein Mitspieler steht frei.",
      choices: [
        {
          id: "abschliessen",
          label: "Selbst abschließen für den Hattrick",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { reputation: 7, morale: 8, logText: "hat den Auftritt mit einem Hattrick gekrönt.", logKind: "positive" },
            failure: { morale: -3, clubRelation: -1, logText: "hat die große Chance auf den Hattrick vergeben.", logKind: "negative" },
          },
        },
        {
          id: "abspielen",
          label: "Elegant den Mitspieler bedienen",
          effects: { attributes: { intelligenz: 1 }, clubRelation: 3, logText: "hat uneigennützig den besser postierten Mitspieler bedient.", logKind: "positive" },
        },
      ],
    }),
  },
  {
    id: "rote_karte_nachspiel",
    category: "meilenstein",
    minAge: 17,
    maxAge: 38,
    weight: 1,
    condition: (p) => p.seasonHistory.length > 0 && p.seasonHistory[p.seasonHistory.length - 1].redCards > 0,
    build: () => ({
      category: "meilenstein",
      title: "Nachspiel vor dem Sportgericht",
      description: "Nach einem Platzverweis in der vergangenen Saison lädt das Verbandsgericht zur Anhörung.",
      choices: [
        {
          id: "einsichtig",
          label: "Einsichtig auftreten",
          effects: { reputation: 1, wealth: -1000, logText: "ist vor dem Sportgericht einsichtig aufgetreten und kam glimpflich davon.", logKind: "info" },
        },
        {
          id: "anfechten",
          label: "Die Entscheidung anfechten",
          effects: {},
          followUpChance: {
            chance: 0.4,
            success: { reputation: 3, logText: "hat vor dem Sportgericht Recht bekommen.", logKind: "positive" },
            failure: { wealth: -6000, morale: -3, logText: "hat den Einspruch vor dem Sportgericht verloren und zusätzlich gezahlt.", logKind: "negative" },
          },
        },
      ],
    }),
  },
  {
    id: "spieler_des_monats",
    category: "medien",
    minAge: 18,
    maxAge: 38,
    weight: 1,
    condition: (p) => p.reputation > 25,
    build: () => ({
      category: "medien",
      title: "Spieler des Monats",
      description: "Für die starken Leistungen der letzten Wochen wirst du zum Spieler des Monats gewählt.",
      choices: [
        {
          id: "annehmen",
          label: "Die Auszeichnung entgegennehmen",
          effects: { reputation: 5, morale: 6, wealth: 3000, traitDeltas: { medienimage: 3 }, logText: "wurde zum Spieler des Monats gewählt.", logKind: "positive" },
        },
      ],
    }),
  },
  {
    id: "torschuetzenkoenig_rennen",
    category: "meilenstein",
    minAge: 18,
    maxAge: 36,
    weight: 1,
    condition: (p) => p.position === "ST" && p.reputation > 40,
    build: () => ({
      category: "meilenstein",
      title: "Kampf um die Torjägerkanone",
      description: "Ein direkter Konkurrent liefert sich mit dir ein Kopf-an-Kopf-Rennen um die Torjägerkrone.",
      choices: [
        {
          id: "extra",
          label: "Zusätzliche Abschlusseinheiten ansetzen",
          effects: { attributes: { technik: 1 }, fitness: -3, logText: "hat im Rennen um die Torjägerkrone zusätzliche Abschlusseinheiten eingelegt.", logKind: "info" },
        },
        {
          id: "locker",
          label: "Locker angehen lassen",
          effects: { morale: 2, logText: "nimmt das Rennen um die Torjägerkrone gelassen.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "jugend_nationalmannschaft",
    category: "nationalmannschaft",
    minAge: 16,
    maxAge: 20,
    weight: 2,
    condition: (p) => p.reputation > 15,
    build: () => ({
      category: "nationalmannschaft",
      title: "Einladung zur U-Nationalmannschaft",
      description: "Der Verband beruft dich erstmals in eine Nachwuchs-Nationalmannschaft.",
      choices: [
        {
          id: "folgen",
          label: "Der Einladung folgen",
          effects: { reputation: 5, fitness: -3, morale: 4, capsDelta: 2, logText: "wurde in eine U-Nationalmannschaft berufen.", logKind: "positive" },
        },
        {
          id: "absagen",
          label: "Wegen Vereins-Belastung absagen",
          effects: { clubRelation: 1, logText: "hat eine U-Nationalmannschaftseinladung wegen Belastung abgesagt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "vorbereitungstour",
    category: "lifestyle",
    minAge: 17,
    maxAge: 36,
    weight: 1,
    build: (p) => ({
      category: "lifestyle",
      title: "Vorbereitungstour im Ausland",
      description: `${club(p)} reist zu einer PR-Tour mit vollem Sponsoren-Programm ins Ausland.`,
      choices: [
        {
          id: "mitziehen",
          label: "Voll bei den Sponsoren-Terminen mitziehen",
          effects: { wealth: 5000, reputation: 3, fitness: -4, logText: "hat bei der Vorbereitungstour voll im Sponsoren-Programm mitgezogen.", logKind: "info" },
        },
        {
          id: "training",
          label: "Auf Trainingsqualität pochen",
          effects: { attributes: { physis: 1 }, fitness: -1, logText: "hat bei der Vorbereitungstour auf Trainingsqualität statt PR gepocht.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "eigentor",
    category: "taktik",
    minAge: 16,
    maxAge: 38,
    weight: 1,
    condition: (p) => p.position !== "TW",
    build: () => ({
      category: "taktik",
      title: "Unglückliches Eigentor",
      description: "Ein verunglückter Klärungsversuch landet unhaltbar im eigenen Netz.",
      choices: [
        {
          id: "zurueckmelden",
          label: "Sich sofort zurückmelden wollen",
          effects: { attributes: { mentalitaet: 1 }, fitness: -2, morale: -2, logText: "hat sich nach einem Eigentor sofort zurückgemeldet.", logKind: "negative" },
        },
        {
          id: "beruhen",
          label: "Es erstmal auf sich beruhen lassen",
          effects: { morale: -4, logText: "hat ein unglückliches Eigentor erstmal verdauen müssen.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "rivalitaets_derby",
    category: "taktik",
    minAge: 17,
    maxAge: 40,
    weight: 2,
    build: (p) => ({
      category: "taktik",
      title: "Stadtderby",
      description: `Das Derby steht an - die Fans von ${club(p)} erwarten von dir ein Statement.`,
      choices: [
        {
          id: "vollgas",
          label: "Mit vollem Einsatz vorangehen",
          effects: {},
          followUpChance: {
            chance: 0.55,
            success: { reputation: 6, clubRelation: 5, morale: 6, traitDeltas: { fuehrung: 2, medienimage: 2 }, logText: "wurde im Derby zum gefeierten Helden.", logKind: "positive" },
            failure: { injuryWeeksOut: 3, injuryLabel: "Blessur im Zweikampf", morale: -4, logText: "hat sich im hitzigen Derby eine Blessur zugezogen.", logKind: "negative" },
          },
        },
        {
          id: "kontrolliert",
          label: "Klug und kontrolliert spielen",
          effects: { attributes: { intelligenz: 1 }, clubRelation: 2, logText: "hat das Derby klug und kontrolliert bestritten.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "auswaertsreise_chaos",
    category: "lifestyle",
    minAge: 16,
    maxAge: 40,
    weight: 1,
    build: () => ({
      category: "lifestyle",
      title: "Chaos auf der Auswärtsreise",
      description: "Eine Flugverspätung wirbelt die Vorbereitung auf ein wichtiges Auswärtsspiel durcheinander.",
      choices: [
        {
          id: "ruhe",
          label: "Ruhe bewahren",
          effects: { attributes: { mentalitaet: 1 }, logText: "hat das Reisechaos vor einem Auswärtsspiel gelassen hingenommen.", logKind: "info" },
        },
        {
          id: "aufregen",
          label: "Sich sichtlich aufregen",
          effects: { morale: -2, logText: "hat sich über das Reisechaos sichtlich aufgeregt.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "sportwissenschaft",
    category: "training",
    minAge: 24,
    maxAge: 38,
    weight: 1,
    build: (_p, ctx) => ({
      category: "training",
      title: "Neue Sportwissenschafts-Methoden",
      description: "Der Verein bietet ein kostenpflichtiges High-End-Reha- und Recovery-Programm an.",
      choices: [
        {
          id: "investieren",
          label: "Auf eigene Kosten investieren",
          effects: { wealth: -5000, fitness: rInt(ctx, 4, 8), attributes: { physis: rInt(ctx, 1, 2) }, traitDeltas: { arbeitsmoral: 2 }, logText: "hat auf eigene Kosten in modernste Sportwissenschaft investiert.", logKind: "positive" },
        },
        {
          id: "standard",
          label: "Beim Standardprogramm bleiben",
          effects: {},
        },
      ],
    }),
  },
  {
    id: "videostudium",
    category: "training",
    minAge: 20,
    maxAge: 36,
    weight: 1.3,
    build: (_p, ctx) => ({
      category: "training",
      title: "Videostudium mit dem Analysten",
      description: "Der Videoanalyst bietet an, gegnerische Spielsysteme gemeinsam im Detail durchzugehen.",
      choices: [
        {
          id: "intensiv",
          label: "Intensiv mitarbeiten",
          effects: { attributes: { intelligenz: rInt(ctx, 1, 3) }, traitDeltas: { arbeitsmoral: 2 }, logText: "hat sich intensiv ins Videostudium mit dem Analysten vertieft.", logKind: "info" },
        },
        {
          id: "kurz",
          label: "Kurz reinschauen, dann Feierabend",
          effects: { attributes: { intelligenz: 1 }, morale: 1, logText: "hat nur kurz beim Videostudium reingeschaut.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "krafttraining",
    category: "training",
    minAge: 16,
    maxAge: 30,
    weight: 1.5,
    build: (_p, ctx) => ({
      category: "training",
      title: "Zusatztraining im Kraftraum",
      description: "Der Athletikcoach schlägt ein zusätzliches Krafttraining im Kraftraum vor.",
      choices: [
        {
          id: "volles_programm",
          label: "Volles Programm durchziehen",
          effects: { attributes: { physis: rInt(ctx, 2, 3) }, fitness: -rInt(ctx, 4, 7), traitDeltas: { arbeitsmoral: 2 }, logText: "hat ein forderndes Zusatztraining im Kraftraum durchgezogen.", logKind: "info" },
        },
        {
          id: "leicht",
          label: "Leichtes Programm, Verletzungen vorbeugen",
          effects: { attributes: { physis: 1 }, fitness: -1, logText: "hat im Kraftraum bewusst ein leichtes Programm gewählt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "persoenlicher_fitnesscoach",
    category: "training",
    minAge: 20,
    maxAge: 36,
    weight: 1,
    condition: (p) => p.wealth > 30000,
    build: (_p, ctx) => ({
      category: "training",
      title: "Angebot eines Fitnesscoachs",
      description: "Ein renommierter privater Fitnesscoach bietet ein individuelles Trainingsprogramm auf eigene Kosten an.",
      choices: [
        {
          id: "engagieren",
          label: "Coach engagieren",
          effects: { wealth: -15000, attributes: { physis: rInt(ctx, 1, 2), mentalitaet: 1 }, traitDeltas: { arbeitsmoral: 2 }, logText: "hat sich einen privaten Fitnesscoach geleistet.", logKind: "positive" },
        },
        {
          id: "ablehnen",
          label: "Beim Vereinsprogramm bleiben",
          effects: { logText: "hat auf den privaten Fitnesscoach verzichtet und bleibt beim Vereinsprogramm.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "mentaltrainer_intensivwoche",
    category: "training",
    minAge: 25,
    maxAge: 40,
    weight: 1,
    build: (_p, ctx) => ({
      category: "training",
      title: "Mentaltrainer-Intensivwoche",
      description: "Ein Mentaltrainer bietet eine Intensivwoche an, um in der zweiten Karrierehälfte fokussiert zu bleiben.",
      choices: [
        {
          id: "teilnehmen",
          label: "Teilnehmen",
          effects: { attributes: { mentalitaet: rInt(ctx, 1, 3) }, morale: 3, traitDeltas: { arbeitsmoral: 2 }, logText: "hat an einer Mentaltrainer-Intensivwoche teilgenommen.", logKind: "info" },
        },
        {
          id: "erfahrung",
          label: "Auf die eigene Erfahrung vertrauen",
          effects: { traitDeltas: { fuehrung: 1 }, logText: "vertraut lieber auf die eigene Erfahrung als auf einen Mentaltrainer.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "zweikampf_haerte",
    category: "taktik",
    minAge: 15,
    maxAge: 40,
    weight: 1,
    build: () => ({
      category: "taktik",
      title: "Robustes Auftreten gefordert",
      description: "Der Gegner geht couragiert und robust in die Zweikämpfe.",
      choices: [
        {
          id: "dagegenhalten",
          label: "Genauso hart dagegenhalten",
          effects: {},
          followUpChance: {
            chance: 0.6,
            success: { attributes: { physis: 1, mentalitaet: 1 }, reputation: 2, logText: "hat im robusten Zweikampfduell die Oberhand behalten.", logKind: "positive" },
            failure: { injuryWeeksOut: 2, injuryLabel: "Prellung", morale: -2, logText: "hat sich in einem robusten Zweikampf eine Prellung zugezogen.", logKind: "negative" },
          },
        },
        {
          id: "technik",
          label: "Auf Technik statt Härte setzen",
          effects: { attributes: { technik: 1 }, logText: "hat auf Technik statt auf harte Zweikämpfe gesetzt.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // DEFENSIVAKTIONEN - auch Verteidigen ist eine sportliche Chance, sich zu
  // beweisen, nicht nur Tore und Vorlagen. Bringt naturgemäß auch eigene
  // Verletzungsrisiken mit sich (Grätschen, Kopfballduelle, Zusammenpralle).
  // ---------------------------------------------------------------------
  {
    id: "rettender_tackle",
    category: "taktik",
    minAge: 16,
    maxAge: 37,
    weight: 1.4,
    // Ein letzter rettender Tackle vor dem eigenen Tor ist eine Abwehr-Szene -
    // Stürmer und Flügelspieler stehen dort im Spielaufbau schlicht nicht.
    condition: (p) => p.position !== "ST" && p.position !== "FS",
    build: (p) => ({
      category: "taktik",
      title: "Der rettende Tackle",
      description: `Ein Gegenspieler entwischt der Abwehr von ${club(p)} und läuft frei aufs Tor zu - nur du kannst ihn jetzt noch stoppen.`,
      choices: [
        {
          id: "vollgas",
          label: "Vollen Einsatz zeigen (Grätsche)",
          effects: {},
          followUpChance: {
            chance: 0.55,
            success: {
              reputation: 5,
              clubRelation: 3,
              attributes: { mentalitaet: 1, physis: 1 },
              logText: "hat mit einer spektakulären Grätsche im letzten Moment gerettet.",
              logKind: "positive",
            },
            failure: {
              injuryWeeksOut: 4,
              injuryLabel: "Knieprellung",
              morale: -4,
              logText: "hat sich bei einer verzweifelten Rettungstat verletzt.",
              logKind: "negative",
            },
          },
        },
        {
          id: "taktisches_foul",
          label: "Lieber taktisch stoppen (Foul in Kauf nehmen)",
          effects: {
            attributes: { mentalitaet: 1 },
            traitDeltas: { disziplin: -2 },
            logText: "hat den Gegenspieler bewusst taktisch gestoppt, um Schlimmeres zu verhindern.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "kopfballduell_abwehr",
    category: "taktik",
    minAge: 16,
    maxAge: 38,
    weight: 1.2,
    // Kopfballduell in der eigenen Box klären ist Abwehrarbeit - für Stürmer/
    // Flügelspieler (die im Angriff stehen) und Torhüter (klären mit den Fäusten,
    // nicht per Kopf) unpassend.
    condition: (p) => p.position !== "ST" && p.position !== "FS" && p.position !== "TW",
    build: (p) => ({
      category: "taktik",
      title: "Kopfballduell in der eigenen Box",
      description: `${club(p)} verteidigt eine gefährliche Ecke - im Kopfballduell mit einem kopfballstarken Stürmer musst du klären.`,
      choices: [
        {
          id: "vollgas",
          label: "Vollen Kopfeinsatz zeigen",
          effects: {},
          followUpChance: {
            chance: 0.6,
            success: {
              attributes: { physis: 1 },
              clubRelation: 2,
              reputation: 2,
              logText: "hat die gefährliche Ecke per Kopf entscheidend geklärt.",
              logKind: "positive",
            },
            failure: {
              injuryWeeksOut: 3,
              injuryLabel: "Gehirnerschütterung",
              morale: -5,
              fitness: -4,
              logText: "hat sich beim Kopfballduell eine Gehirnerschütterung zugezogen.",
              logKind: "negative",
            },
          },
        },
        {
          id: "vorsichtig",
          label: "Vorsichtig positionieren, Kopfballrisiko meiden",
          effects: {
            attributes: { intelligenz: 1 },
            clubRelation: -1,
            logText: "hat das Kopfballduell aus Vorsicht gemieden und stattdessen clever verteidigt.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "abwehrchef",
    category: "taktik",
    minAge: 21,
    maxAge: 36,
    weight: 1,
    unique: true,
    // Die Abwehrkette organisiert klassischerweise der Innenverteidiger oder der
    // Torhüter (bester Überblick auf die Kette) - für Stürmer/Flügelspieler/
    // Mittelfeld unpassend.
    condition: (p) => p.stage !== "jugend" && (p.position === "IV" || p.position === "TW" || p.position === "AV"),
    build: (p) => ({
      category: "taktik",
      title: "Abwehrchef gesucht",
      description: `Die Abwehr von ${club(p)} wirkt zunehmend unsortiert - der Trainer bittet dich, die Kette künftig lautstark zu organisieren.`,
      choices: [
        {
          id: "uebernehmen",
          label: "Die Verantwortung übernehmen",
          effects: {
            traitDeltas: { fuehrung: 4 },
            attributes: { mentalitaet: 1 },
            clubRelation: 3,
            logText: "übernimmt fortan die Organisation der Abwehrkette.",
            logKind: "positive",
          },
        },
        {
          id: "ablehnen",
          label: "Lieber im Hintergrund bleiben",
          effects: { logText: "überlässt die Organisation der Abwehr lieber anderen.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // TORHÜTER-SPEZIFISCH - eigene Spielmomente für die Position, die sonst
  // nirgends im Ereignispool vorkommt (Elfmeter, Strafraumbeherrschung,
  // Fehlgriffe sind torwartspezifische Situationen).
  // ---------------------------------------------------------------------
  {
    id: "torwart_elfmeterheld",
    category: "taktik",
    minAge: 18,
    maxAge: 38,
    weight: 1.3,
    condition: (p) => p.position === "TW",
    build: (p) => ({
      category: "taktik",
      title: "Elfmeterheld gesucht",
      description: `Im Elfmeterschießen eines wichtigen Pokalspiels von ${club(p)} liegt es an dir, den entscheidenden Versuch zu parieren.`,
      choices: [
        {
          id: "videostudium",
          label: "Auf Videostudien der Schützen vertrauen",
          effects: {},
          followUpChance: {
            chance: 0.55,
            success: { reputation: 7, morale: 8, attributes: { intelligenz: 1 }, logText: "hat dank akribischer Vorbereitung den entscheidenden Elfmeter pariert und wird zum Helden.", logKind: "positive" },
            failure: { morale: -4, logText: "hat sich trotz Vorbereitung im entscheidenden Elfmeterschießen nicht auszeichnen können.", logKind: "negative" },
          },
        },
        {
          id: "bauchgefuehl",
          label: "Aus dem Bauch heraus reagieren",
          effects: {},
          followUpChance: {
            chance: 0.4,
            success: { reputation: 9, morale: 10, traitDeltas: { medienimage: 2 }, logText: "hat rein aus dem Bauch heraus reagiert und einen spektakulären Reflex-Save gezeigt.", logKind: "positive" },
            failure: { morale: -6, clubRelation: -2, logText: "hat sich im entscheidenden Elfmeterschießen komplett verschätzt.", logKind: "negative" },
          },
        },
      ],
    }),
  },
  {
    id: "torwart_strafraumbeherrschung",
    category: "taktik",
    minAge: 17,
    maxAge: 38,
    weight: 1.2,
    condition: (p) => p.position === "TW",
    build: (p) => ({
      category: "taktik",
      title: "Kommandogewalt im eigenen Strafraum",
      description: `Bei ${club(p)} häufen sich zuletzt hohe Bälle und Ecken gegen dein Team - der Trainer erwartet mehr Präsenz im Strafraum.`,
      choices: [
        {
          id: "aggressiv",
          label: "Konsequent herauslaufen und Bälle abfangen",
          effects: {},
          followUpChance: {
            chance: 0.6,
            success: { reputation: 4, clubRelation: 4, attributes: { mentalitaet: 1 }, logText: "hat mit mutigem Herauslaufen mehrere gefährliche Situationen im Keim erstickt.", logKind: "positive" },
            failure: { morale: -5, clubRelation: -4, injuryWeeksOut: 2, injuryLabel: "Zusammenprall im Strafraum", logText: "ist bei einem riskanten Herauslaufen mit einem Gegenspieler zusammengeprallt.", logKind: "negative" },
          },
        },
        {
          id: "linientreue",
          label: "Lieber auf der Linie bleiben",
          effects: { attributes: { intelligenz: 1 }, logText: "hat sich bewusst für mehr Sicherheit auf der Linie entschieden statt für riskantes Herauslaufen.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "torwart_patzer",
    category: "medien",
    minAge: 18,
    maxAge: 38,
    weight: 1,
    condition: (p) => p.position === "TW",
    build: (p) => ({
      category: "medien",
      title: "Der Patzer geht viral",
      description: `Ein missglückter Abschlag von dir bei ${club(p)} landet direkt beim Gegner und führt zu einem Gegentor - die Szene verbreitet sich rasend schnell in den sozialen Medien.`,
      choices: [
        {
          id: "bekennen",
          label: "Sich öffentlich dazu bekennen",
          effects: { attributes: { mentalitaet: 1 }, traitDeltas: { medienimage: 2, disziplin: 1 }, clubRelation: 2, logText: "hat sich nach dem viralen Patzer öffentlich und selbstkritisch dazu bekannt.", logKind: "positive" },
        },
        {
          id: "rausreden",
          label: "Die Schuld beim Team suchen",
          effects: { morale: 2, clubRelation: -5, traitDeltas: { medienimage: -3 }, logText: "hat nach dem viralen Patzer die Schuld beim Team gesucht - kommt in der Kabine nicht gut an.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "torwart_liga_elfmeter",
    category: "taktik",
    minAge: 17,
    maxAge: 39,
    weight: 1.1,
    // Bewusst getrennt von "torwart_elfmeterheld" (Elfmeterschießen nach 120
    // Minuten, K.o.-Charakter) - hier geht es um einen reinen Strafstoß im
    // laufenden Ligaspiel, ein deutlich häufigerer, "normalerer" Spielmoment,
    // der trotzdem als echter Boost zählen soll ("Elfmeter gehalten").
    condition: (p) => p.position === "TW",
    build: (p) => {
      const name = club(p);
      return {
        category: "taktik",
        title: "Elfmeter in der Crunchtime",
        description: `In einem wichtigen Ligaspiel von ${name} gibt es Strafstoß gegen dich - kurz vor Schluss, bei knappem Spielstand.`,
        choices: [
          {
            id: "winkel_verkuerzen",
            label: "Früh herauskommen, Winkel verkürzen",
            detail: "Aggressive Technik - bei Erfolg ein starker Reflex-Save, bei Misserfolg ein unnötig hoher Chip drüber.",
            effects: {},
            followUpChance: {
              chance: 0.5,
              success: {
                reputation: 7,
                morale: 8,
                attributes: { intelligenz: 1 },
                logText: "hat den Elfmeter durch beherztes Herauskommen und Winkelverkürzung pariert.",
                logKind: "positive",
              },
              failure: {
                morale: -5,
                clubRelation: -2,
                logText: "wird beim Elfmeter mit einem sehenswerten Lupfer über sich selbst überlistet.",
                logKind: "negative",
              },
            },
          },
          {
            id: "linie_abwarten",
            label: "Auf der Linie bleiben und reagieren",
            detail: "Sicherer, reaktiver Ansatz - kleinere Fallhöhe in beide Richtungen.",
            effects: {},
            followUpChance: {
              chance: 0.4,
              success: {
                reputation: 4,
                morale: 5,
                logText: "hat den Elfmeter mit einem reinen Reflex von der Linie pariert.",
                logKind: "positive",
              },
              failure: {
                morale: -3,
                logText: "ist beim Elfmeter chancenlos - der Schuss sitzt zu platziert.",
                logKind: "negative",
              },
            },
          },
          {
            id: "nervenkrieg",
            label: "Nervenkrieg mit dem Schützen suchen",
            detail: "Psychospielchen vor dem Anlauf - riskiert Kritik an der Fairness, kann den Schützen aber aus dem Konzept bringen.",
            effects: {},
            followUpChance: {
              chance: 0.3,
              success: {
                reputation: 6,
                morale: 6,
                traitDeltas: { medienimage: -1 },
                logText: "bringt den Schützen mit einem Nervenkrieg vor dem Elfmeter aus dem Konzept - der Ball geht daneben.",
                logKind: "positive",
              },
              failure: {
                morale: -2,
                traitDeltas: { medienimage: -2 },
                logText: "wirkt beim Nervenkrieg vor dem Elfmeter unsportlich, ohne den Schützen zu beeindrucken - der Elfmeter sitzt.",
                logKind: "negative",
              },
            },
          },
        ],
      };
    },
  },
  {
    id: "torwart_glanzparade",
    category: "taktik",
    minAge: 16,
    maxAge: 39,
    weight: 1.3,
    // "Random Glanztaten": unabhängig von Elfmetern eine zufällige Weltklasse-
    // Szene aus dem laufenden Spiel - der torwartspezifische Gegenpart zu einem
    // spektakulären Distanztor bei Feldspielern.
    condition: (p) => p.position === "TW",
    build: (p) => ({
      category: "taktik",
      title: "Der Distanzschuss fliegt in den Winkel",
      description: `Ein platzierter Distanzschuss gegen ${club(p)} fliegt scheinbar unhaltbar in den Winkel - im letzten Moment wirfst du dich hinein.`,
      choices: [
        {
          id: "alles_riskieren",
          label: "Sich mit vollem Risiko hineinwerfen",
          detail: "Volle Flugparade - bei Erfolg eine Weltklasse-Szene, bei Misserfolg ein unnötiges Verletzungsrisiko.",
          effects: {},
          followUpChance: {
            chance: 0.45,
            success: {
              reputation: 10,
              morale: 8,
              attributes: { technik: 1 },
              logText: "hält mit einer spektakulären Flugparade einen unhaltbar scheinenden Distanzschuss - die Bilder gehen viral.",
              logKind: "positive",
            },
            failure: {
              injuryWeeksOut: 2,
              injuryLabel: "Prellung nach Hechtsprung",
              morale: -4,
              logText: "verletzt sich bei einem beherzten Hechtsprung nach einem Distanzschuss.",
              logKind: "negative",
            },
          },
        },
        {
          id: "kontrolliert_abwehren",
          label: "Kontrolliert um den Pfosten lenken",
          detail: "Weniger spektakulär, dafür risikoarm - kein Verletzungsrisiko.",
          effects: {
            attributes: { mentalitaet: 1 },
            logText: "lenkt den Distanzschuss kontrolliert um den Pfosten, ohne unnötiges Risiko einzugehen.",
            logKind: "info",
          },
        },
      ],
    }),
  },

  {
    id: "teamkollege_krise",
    category: "taktik",
    minAge: 20,
    maxAge: 36,
    weight: 1,
    build: () => ({
      category: "taktik",
      title: "Teamkollege in der Krise",
      description: "Ein Teamkollege steckt seit Wochen erkennbar in einer persönlichen Krise und wirkt neben der Spur - der Mannschaft entgeht das nicht.",
      choices: [
        {
          id: "unterstuetzen",
          label: "Das Gespräch suchen und unterstützen",
          effects: { traitDeltas: { fuehrung: 3 }, clubRelation: 3, morale: 2, logText: "hat einen Teamkollegen in der Krise unterstützt und aufgefangen.", logKind: "positive" },
        },
        {
          id: "raushalten",
          label: "Sich raushalten, ist nicht das eigene Thema",
          effects: { traitDeltas: { fuehrung: -2 }, logText: "hat sich bei der Krise eines Teamkollegen bewusst rausgehalten.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "unglueckliches_zusammenprall",
    category: "verletzung",
    minAge: 15,
    maxAge: 40,
    weight: 1.3,
    build: (_p, ctx) => {
      // Häufigstes Verletzungs-Event der Karriere (Ø 2.4x) - Text-Varianten aus
      // demselben Grund wie bei den anderen Events oben (siehe dort).
      const variant = pickVariant(ctx, [
        { title: "Unglücklicher Zusammenprall", description: "Bei einem harmlos wirkenden Zweikampf prallst du unglücklich mit einem Gegenspieler zusammen." },
        { title: "Blöder Zusammenstoß", description: "Beim Kampf um einen zweiten Ball rennst du unglücklich mit einem Gegenspieler zusammen." },
        { title: "Kollision im Zweikampf", description: "Ein eigentlich unspektakulärer Zweikampf endet mit einem harten Zusammenstoß zweier Köpfe." },
        { title: "Zusammenprall beim Kopfballduell", description: "Bei einem Kopfballduell triffst du unglücklich mit einem Gegenspieler zusammen." },
      ]);
      return {
      category: "verletzung",
      title: variant.title,
      description: variant.description,
      choices: [
        {
          id: "weiterspielen",
          label: "Vorsichtig weiterspielen lassen",
          effects: {},
          followUpChance: {
            chance: 0.6,
            success: { morale: 1, logText: "kommt bei einem unglücklichen Zusammenprall glimpflich davon.", logKind: "info" },
            failure: {
              injuryWeeksOut: 5,
              injuryLabel: "Bänderdehnung",
              morale: -4,
              logText: "zieht sich bei einem unglücklichen Zusammenprall eine Bänderdehnung zu.",
              logKind: "negative",
            },
          },
        },
        {
          id: "behandeln",
          label: "Sofort behandeln lassen, kein Risiko eingehen",
          effects: { fitness: 2, clubRelation: 1, logText: "lässt sich nach dem Zusammenprall sofort vorsorglich behandeln.", logKind: "info" },
        },
      ],
      };
    },
  },

  // ---------------------------------------------------------------------
  // AUFSTIEG: die Chance, sich sportlich zu beweisen
  // ---------------------------------------------------------------------
  {
    id: "bewaehrungschance",
    category: "taktik",
    minAge: 17,
    maxAge: 34,
    weight: 3,
    condition: (p) =>
      p.stage !== "jugend" &&
      (p.contract.squadRole === "Ersatzbank" ||
        p.contract.squadRole === "Ergänzungsspieler" ||
        p.contract.squadRole === "Rotation"),
    build: (p) => ({
      category: "taktik",
      title: "Die große Chance",
      description: `Der gesetzte Stammspieler auf deiner Position fällt aus - ${club(p)} braucht dich in einem wichtigen Spiel. Jetzt zählt jeder Ballkontakt.`,
      choices: [
        {
          id: "nutzen",
          label: "Die Chance beim Schopfe packen",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: {
              reputation: 8,
              clubRelation: 8,
              morale: 10,
              squadRoleOverride: "Stammspieler",
              roleProtectionSeasons: 2,
              traitDeltas: { arbeitsmoral: 2 },
              logText: "hat die große Chance genutzt und sich in die Stammelf gespielt!",
              logKind: "milestone",
            },
            failure: {
              morale: -6,
              clubRelation: -4,
              logText: "hat die große Chance nicht nutzen können und verschwindet wieder in der Rotation.",
              logKind: "negative",
            },
          },
        },
        {
          id: "vorsichtig",
          label: "Auf Nummer sicher spielen, keine Fehler riskieren",
          effects: { clubRelation: 2, logText: "hat sich in der großen Chance auf Nummer sicher zurückgehalten.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // CHARAKTER-EVENTS: durch vergangene Entscheidungen (Traits) freigeschaltet
  // ---------------------------------------------------------------------
  {
    id: "vorbildfunktion",
    category: "meilenstein",
    minAge: 20,
    maxAge: 38,
    weight: 1,
    condition: (p) => p.traits.arbeitsmoral >= 75,
    build: (p) => ({
      category: "meilenstein",
      title: "Vorbildfunktion",
      description: `Deine bekannte Arbeitsmoral ist ${club(p)} nicht entgangen - der Verein bittet dich, als Vorbild für die Jugendabteilung voranzugehen.`,
      choices: [
        {
          id: "annehmen",
          label: "Die Rolle annehmen",
          effects: { clubRelation: 6, reputation: 3, traitDeltas: { fuehrung: 3 }, logText: "wurde wegen seiner/ihrer Arbeitsmoral zum Vorbild für die Jugendabteilung ernannt.", logKind: "positive" },
        },
        {
          id: "ablehnen",
          label: "Lieber im Hintergrund bleiben",
          effects: { logText: "hat die Vorbildrolle für die Jugendabteilung abgelehnt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "reputationskrise",
    category: "meilenstein",
    minAge: 18,
    maxAge: 36,
    weight: 2,
    // War auf disziplin<=25 gesetzt - laut Simulation (1500 Karrieren) sinkt disziplin
    // in der Praxis nie unter ~32, das Event konnte also nie feuern. Schwelle auf einen
    // tatsächlich erreichbaren Wert angehoben.
    condition: (p) => p.traits.disziplin <= 38,
    build: (p) => ({
      category: "meilenstein",
      title: "Der Verein zieht die Reißleine",
      description: `Dein Lebenswandel abseits des Platzes sorgt bei ${club(p)} zunehmend für Unmut - die Vereinsführung sucht das klärende Gespräch.`,
      choices: [
        {
          id: "aendern",
          label: "Verhaltensänderung geloben",
          effects: { clubRelation: 4, morale: -3, traitDeltas: { disziplin: 15 }, logText: "hat dem Verein eine Verhaltensänderung zugesagt.", logKind: "info" },
        },
        {
          id: "weiter",
          label: "Weitermachen wie bisher",
          effects: { clubRelation: -10, reputation: -3, logText: "hat sich vom Verein nichts vorschreiben lassen wollen.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "werbepartner_ansturm",
    category: "sponsoring",
    minAge: 20,
    maxAge: 36,
    weight: 1,
    condition: (p) => p.traits.medienimage >= 75,
    build: () => ({
      category: "sponsoring",
      title: "Ansturm der Sponsoren",
      description: "Dein makelloses Image weckt gleich mehrere Sponsoren-Interessen zeitgleich.",
      choices: [
        {
          id: "bestbietend",
          label: "Dem bestbietenden Sponsor zusagen",
          effects: { wealth: 40000, fitness: -3, logText: "hat dem bestbietenden von mehreren gleichzeitig interessierten Sponsoren zugesagt.", logKind: "positive" },
        },
        {
          id: "exklusiv",
          label: "Einen Exklusivpartner wählen",
          effects: { wealth: 20000, traitDeltas: { medienimage: 3 }, logText: "hat sich für einen Exklusiv-Sponsorenpartner entschieden.", logKind: "positive" },
        },
      ],
    }),
  },
  {
    id: "medienvertrauenskrise",
    category: "medien",
    minAge: 18,
    maxAge: 36,
    weight: 1,
    // War auf medienimage<=25 gesetzt - laut Simulation (2000 Karrieren) wird dieser
    // Wert praktisch nie erreicht (nur 0.006% aller Saison-Snapshots, absolutes
    // Minimum genau 25). Schwelle auf einen tatsächlich erreichbaren Wert angehoben
    // (P5 lag bei 43) - selbes Muster wie bei `reputationskrise`.
    condition: (p) => p.traits.medienimage <= 40,
    build: () => ({
      category: "medien",
      title: "Vertrauenskrise mit den Medien",
      description: "Die Presse begegnet dir mittlerweile durchgehend feindselig - kaum ein Bericht ohne Spitze gegen dich.",
      choices: [
        {
          id: "berater",
          label: "PR-Berater engagieren",
          effects: { wealth: -10000, traitDeltas: { medienimage: 12 }, logText: "hat einen PR-Berater engagiert, um das Verhältnis zur Presse zu kitten.", logKind: "positive" },
        },
        {
          id: "konfrontativ",
          label: "Konfrontativ bleiben",
          effects: { reputation: -3, traitDeltas: { medienimage: -3 }, logText: "bleibt im Umgang mit der Presse konfrontativ.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "mannschaftsrat",
    category: "meilenstein",
    minAge: 22,
    maxAge: 38,
    weight: 1,
    unique: true,
    condition: (p) => p.traits.fuehrung >= 70 && p.clubRelation > 50,
    build: (p) => ({
      category: "meilenstein",
      title: "Wahl in den Mannschaftsrat",
      description: `Die Mitspieler bei ${club(p)} wählen dich als anerkannte Führungspersönlichkeit in den Mannschaftsrat.`,
      choices: [
        {
          id: "annehmen",
          label: "Die Wahl annehmen",
          effects: { clubRelation: 6, reputation: 4, traitDeltas: { fuehrung: 3 }, logText: "wurde in den Mannschaftsrat gewählt.", logKind: "milestone" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // STORYLINES: mehrjährige Ereignis-Reihen mit garantierter Fortsetzung
  // (siehe EffectDelta.storyline / StoryThread). Die erste Stufe wird ganz
  // normal zufällig gezogen, alle Folgestufen sind `storylineOnly` und
  // werden fällig - nicht zufällig - eingespielt.
  // ---------------------------------------------------------------------

  // --- 1) Rivalität im Kabinenflur ---------------------------------------
  {
    id: "rivalitaet_1",
    category: "taktik",
    minAge: 18,
    maxAge: 32,
    weight: 1.4,
    condition: (p) =>
      p.stage !== "jugend" &&
      !p.completedStorylines.includes("rivalitaet") &&
      !p.activeStorylines.some((t) => t.storylineId === "rivalitaet"),
    build: (p, ctx) => {
      const rivalName = randomFullName(ctx.rng);
      return {
        category: "taktik",
        title: "Neuzugang macht Druck",
        description: `${club(p)} hat mit ${rivalName} einen ehrgeizigen Neuzugang genau für deine Position verpflichtet. Der Konkurrenzkampf um den Stammplatz beginnt sofort.`,
        choices: [
          {
            id: "konfrontieren",
            label: "Das direkte Gespräch mit ihm/ihr suchen",
            effects: {
              clubRelation: -2,
              traitDeltas: { fuehrung: 2 },
              logText: `hat ${rivalName} von Anfang an klar die Grenzen aufgezeigt.`,
              logKind: "info",
              storyline: { storylineId: "rivalitaet", label: "Rivalität im Kabinenflur", stage: 1, totalStages: 3, nextTemplateId: "rivalitaet_2", delaySeasons: 2, data: { rivalName } },
            },
          },
          {
            id: "ausarbeiten",
            label: "Die Antwort still auf dem Platz geben",
            effects: {
              attributes: { mentalitaet: 1 },
              traitDeltas: { arbeitsmoral: 2 },
              logText: `lässt die sportlichen Argumente gegen ${rivalName} sprechen.`,
              logKind: "info",
              storyline: { storylineId: "rivalitaet", label: "Rivalität im Kabinenflur", stage: 1, totalStages: 3, nextTemplateId: "rivalitaet_2", delaySeasons: 2, data: { rivalName } },
            },
          },
          {
            id: "team",
            label: "Auf den Rückhalt der Mannschaft setzen",
            effects: {
              clubRelation: 3,
              morale: 2,
              logText: `sucht im Konkurrenzkampf mit ${rivalName} den Rückhalt der Mannschaft.`,
              logKind: "info",
              storyline: { storylineId: "rivalitaet", label: "Rivalität im Kabinenflur", stage: 1, totalStages: 3, nextTemplateId: "rivalitaet_2", delaySeasons: 2, data: { rivalName } },
            },
          },
        ],
      };
    },
  },
  {
    id: "rivalitaet_2",
    category: "taktik",
    minAge: 18,
    maxAge: 34,
    weight: 0,
    storylineOnly: true,
    build: (p, ctx) => {
      const rivalName = ctx.storyData?.rivalName ?? "dein Rivale";
      return {
        category: "taktik",
        title: "Der Konflikt eskaliert",
        description: `Die Rivalität mit ${rivalName} um den Stammplatz bei ${club(p)} sorgt mittlerweile für Gesprächsstoff - sogar die Presse hat den Konkurrenzkampf entdeckt.`,
        choices: [
          {
            id: "versoehnen",
            label: "Das offene Gespräch suchen und Frieden schließen",
            effects: {
              clubRelation: 6,
              morale: 4,
              traitDeltas: { fuehrung: 3, medienimage: 2 },
              logText: `hat sich mit ${rivalName} versöhnt und aus dem Rivalen einen Verbündeten gemacht.`,
              logKind: "positive",
              storyline: { storylineId: "rivalitaet", label: "Rivalität im Kabinenflur", stage: 2, totalStages: 3, nextTemplateId: "rivalitaet_3", delaySeasons: 2, data: { rivalName, outcome: "freund" } },
            },
          },
          {
            id: "weiter_konkurrieren",
            label: "Den Konkurrenzkampf bewusst weiter befeuern",
            effects: {
              attributes: { mentalitaet: 2 },
              traitDeltas: { disziplin: -3 },
              clubRelation: -3,
              reputation: 2,
              logText: `befeuert die Rivalität mit ${rivalName} bewusst weiter.`,
              logKind: "info",
              storyline: { storylineId: "rivalitaet", label: "Rivalität im Kabinenflur", stage: 2, totalStages: 3, nextTemplateId: "rivalitaet_3", delaySeasons: 2, data: { rivalName, outcome: "rivale" } },
            },
          },
        ],
      };
    },
  },
  {
    id: "rivalitaet_3",
    category: "taktik",
    minAge: 18,
    maxAge: 36,
    weight: 0,
    storylineOnly: true,
    build: (p, ctx) => {
      const rivalName = ctx.storyData?.rivalName ?? "dein Rivale";
      const outcome = ctx.storyData?.outcome ?? "freund";
      if (outcome === "freund") {
        return {
          category: "taktik",
          title: "Aus Rivalen wurde ein Duo",
          description: `${rivalName} und du habt aus der anfänglichen Rivalität eine der stärksten Verbindungen der Kabine gemacht - die Chemie auf dem Platz ist inzwischen legendär bei ${club(p)}.`,
          choices: [
            {
              id: "ok",
              label: "Gemeinsam weitermachen",
              effects: {
                clubRelation: 8,
                reputation: 4,
                traitDeltas: { fuehrung: 4 },
                logText: `hat die Rivalität mit ${rivalName} in eine enge Freundschaft verwandelt.`,
                logKind: "milestone",
                storyline: { storylineId: "rivalitaet", label: "Rivalität im Kabinenflur", stage: 3, totalStages: 3 },
              },
            },
          ],
        };
      }
      return {
        category: "taktik",
        title: "Der Rivale zieht weiter",
        description: `Die Fronten zwischen dir und ${rivalName} sind nie richtig aufgetaut - am Ende löst ${club(p)} den Konflikt durch einen Wechsel von ${rivalName}.`,
        choices: [
          {
            id: "ok",
            label: "Den Platz behaupten",
            effects: {
              morale: 5,
              clubRelation: 4,
              roleProtectionSeasons: 1,
              traitDeltas: { arbeitsmoral: 2 },
              logText: `hat sich im Konkurrenzkampf gegen ${rivalName} durchgesetzt - der Rivale verlässt den Verein.`,
              logKind: "milestone",
              storyline: { storylineId: "rivalitaet", label: "Rivalität im Kabinenflur", stage: 3, totalStages: 3 },
            },
          },
        ],
      };
    },
  },

  // --- 2) Der lange Weg zurück (Verletzungs-Comeback) ---------------------
  {
    id: "comeback_1",
    category: "verletzung",
    minAge: 19,
    maxAge: 34,
    // Ein Kreuzbandriss ist ein einschneidendes, aber im echten Profifußball
    // seltenes Karriereereignis (grob 10-20% Lebenszeitrisiko über eine ganze
    // Karriere, nicht "praktisch jedem irgendwann"). Bei Gewicht 1 wurde das
    // Event über die ~15 eligible Saisons hinweg in über 95% aller Karrieren
    // mindestens einmal gezogen - deutlich zu häufig.
    weight: 0.06,
    condition: (p) =>
      !p.completedStorylines.includes("comeback") && !p.activeStorylines.some((t) => t.storylineId === "comeback"),
    build: (p, ctx) => ({
      category: "verletzung",
      title: "Schwere Verletzung",
      description: `Ein unglücklicher Zweikampf endet für dich bei ${club(p)} mit einer schweren Verletzung - die Ärzte sprechen von einer langen Pause, manche zweifeln sogar am Comeback.`,
      choices: [
        {
          id: "aggressiv",
          label: "Riskante, beschleunigte Reha wagen",
          effects: {
            // Ein echter Kreuzbandriss kostet realistisch 8-10 Monate, nicht nur
            // ein paar Wochen - die Saison, in der er passiert, ist damit
            // praktisch gelaufen, und auch die Sommerpause allein reicht nicht
            // aus, um wieder voll einsatzbereit zu sein (siehe `ageUpPlayer`,
            // das nur 16 Wochen pro Sommerpause heilt).
            injuryWeeksOut: rInt(ctx, 32, 38),
            injuryLabel: "Kreuzbandriss",
            morale: -8,
            traitDeltas: { arbeitsmoral: 2 },
            logText: "hat sich schwer verletzt (Kreuzbandriss, monatelange Pause) und wagt eine riskante, beschleunigte Reha.",
            logKind: "negative",
            storyline: { storylineId: "comeback", label: "Der lange Weg zurück", stage: 1, totalStages: 3, nextTemplateId: "comeback_2", delaySeasons: 1, data: { risk: "aggressiv" } },
          },
        },
        {
          id: "geduldig",
          label: "Geduldige, ärztlich empfohlene Reha",
          effects: {
            injuryWeeksOut: rInt(ctx, 38, 44),
            injuryLabel: "Kreuzbandriss",
            morale: -5,
            traitDeltas: { disziplin: 2 },
            logText: "hat sich schwer verletzt (Kreuzbandriss, monatelange Pause) und setzt auf eine geduldige, ärztlich empfohlene Reha.",
            logKind: "negative",
            storyline: { storylineId: "comeback", label: "Der lange Weg zurück", stage: 1, totalStages: 3, nextTemplateId: "comeback_2", delaySeasons: 1, data: { risk: "geduldig" } },
          },
        },
      ],
    }),
  },
  {
    id: "comeback_2",
    category: "verletzung",
    minAge: 19,
    maxAge: 35,
    weight: 0,
    storylineOnly: true,
    build: (p, ctx) => {
      const risk = ctx.storyData?.risk ?? "geduldig";
      const successChance = risk === "aggressiv" ? 0.45 : 0.7;
      return {
        category: "verletzung",
        title: "Das Comeback",
        description:
          risk === "aggressiv"
            ? `Du fühlst dich noch nicht ganz fit, aber ${club(p)} braucht dich - dein Comeback naht früher als eigentlich empfohlen.`
            : `Nach monatelanger Geduld steht dein Comeback bei ${club(p)} endlich bevor - du fühlst dich stabil, die Nervosität ist trotzdem groß.`,
        choices: [
          {
            id: "riskieren",
            label: "Das Comeback jetzt wagen",
            effects: {},
            followUpChance: {
              chance: successChance,
              success: {
                fitness: 10,
                morale: 10,
                attributes: { mentalitaet: 2 },
                traitDeltas: { arbeitsmoral: 3 },
                logText: "hat ein starkes Comeback nach der schweren Verletzung gefeiert.",
                logKind: "positive",
                storyline: { storylineId: "comeback", label: "Der lange Weg zurück", stage: 2, totalStages: 3, nextTemplateId: "comeback_3", delaySeasons: 1, data: { outcome: "stark" } },
              },
              failure: {
                injuryWeeksOut: 6,
                injuryLabel: "Rückschlag",
                morale: -10,
                logText: "erleidet beim Comeback-Versuch einen schmerzhaften Rückschlag.",
                logKind: "negative",
                storyline: { storylineId: "comeback", label: "Der lange Weg zurück", stage: 2, totalStages: 3, nextTemplateId: "comeback_3", delaySeasons: 1, data: { outcome: "rueckschlag" } },
              },
            },
          },
          {
            id: "vorsichtig",
            label: "Sich noch mehr Zeit nehmen",
            effects: {
              fitness: 3,
              morale: 2,
              logText: "verschiebt das Comeback aus Vorsicht um weitere Wochen.",
              logKind: "info",
              storyline: { storylineId: "comeback", label: "Der lange Weg zurück", stage: 2, totalStages: 3, nextTemplateId: "comeback_3", delaySeasons: 1, data: { outcome: "vorsichtig" } },
            },
          },
        ],
      };
    },
  },
  {
    id: "comeback_3",
    category: "verletzung",
    minAge: 19,
    maxAge: 36,
    weight: 0,
    storylineOnly: true,
    build: (p, ctx) => {
      const outcome = ctx.storyData?.outcome ?? "vorsichtig";
      if (outcome === "stark") {
        return {
          category: "verletzung",
          title: "Stärker als vorher zurück",
          description: `Die Horror-Verletzung ist Geschichte - bei ${club(p)} giltst du inzwischen als mentales Vorbild, das stärker zurückgekommen ist, als es je war.`,
          choices: [
            {
              id: "ok",
              label: "Weitermachen",
              effects: {
                reputation: 8,
                clubRelation: 6,
                traitDeltas: { arbeitsmoral: 3, fuehrung: 2 },
                logText: "gilt nach der schweren Verletzung als mentales Vorbild - stärker zurück als je zuvor.",
                logKind: "milestone",
                storyline: { storylineId: "comeback", label: "Der lange Weg zurück", stage: 3, totalStages: 3 },
              },
            },
          ],
        };
      }
      if (outcome === "rueckschlag") {
        return {
          category: "verletzung",
          title: "Der Kampf geht weiter",
          description: `Ganz ausgestanden ist die Verletzung noch nicht - du kämpfst weiter mit den Folgen, hast dich aber nicht unterkriegen lassen.`,
          choices: [
            {
              id: "ok",
              label: "Weiterkämpfen",
              effects: {
                attributes: { physis: -1 },
                traitDeltas: { arbeitsmoral: 3 },
                clubRelation: 3,
                logText: "kämpft nach dem Rückschlag weiter mit den Folgen der Verletzung, hat sich aber nicht unterkriegen lassen.",
                logKind: "info",
                storyline: { storylineId: "comeback", label: "Der lange Weg zurück", stage: 3, totalStages: 3 },
              },
            },
          ],
        };
      }
      return {
        category: "verletzung",
        title: "Der leise Weg zurück",
        description: `Ohne großes Aufsehen, aber solide - dein Comeback bei ${club(p)} ist geglückt.`,
        choices: [
          {
            id: "ok",
            label: "Weitermachen",
            effects: {
              fitness: 6,
              clubRelation: 4,
              morale: 5,
              logText: "ist ohne großes Aufsehen, aber solide zurück im Kader.",
              logKind: "positive",
              storyline: { storylineId: "comeback", label: "Der lange Weg zurück", stage: 3, totalStages: 3 },
            },
          },
        ],
      };
    },
  },

  // --- 3) Vereinsikone ------------------------------------------------------
  {
    id: "ikone_1",
    category: "meilenstein",
    minAge: 26,
    maxAge: 37,
    weight: 1,
    condition: (p) =>
      p.clubChangesCount === 0 &&
      p.clubRelation > 60 &&
      p.seasonHistory.filter((s) => s.club === p.club.name).length >= 5 &&
      !p.completedStorylines.includes("ikone") &&
      !p.activeStorylines.some((t) => t.storylineId === "ikone"),
    build: (p) => ({
      category: "meilenstein",
      title: "Die Fans singen deinen Namen",
      description: `Nach Jahren der Treue zu ${club(p)} ist ein eigener Fangesang für dich in der Kurve entstanden - du bist längst mehr als nur ein Spieler.`,
      choices: [
        {
          id: "genießen",
          label: "Den Moment genießen und die Verbundenheit zeigen",
          effects: {
            clubRelation: 6,
            reputation: 4,
            traitDeltas: { fuehrung: 2 },
            logText: "genießt den eigenen Fangesang sichtlich und zeigt seine/ihre Verbundenheit zum Verein.",
            logKind: "positive",
            storyline: { storylineId: "ikone", label: "Vereinsikone", stage: 1, totalStages: 3, nextTemplateId: "ikone_2", delaySeasons: 2 },
          },
        },
        {
          id: "bescheiden",
          label: "Bescheiden bleiben, den Rummel kleinhalten",
          effects: {
            traitDeltas: { disziplin: 2 },
            morale: 2,
            logText: "bleibt trotz des eigenen Fangesangs bewusst bescheiden.",
            logKind: "info",
            storyline: { storylineId: "ikone", label: "Vereinsikone", stage: 1, totalStages: 3, nextTemplateId: "ikone_2", delaySeasons: 2 },
          },
        },
      ],
    }),
  },
  {
    id: "ikone_2",
    category: "meilenstein",
    minAge: 26,
    maxAge: 39,
    weight: 0,
    storylineOnly: true,
    build: (p) => ({
      category: "meilenstein",
      title: "Der Verein plant etwas Besonderes",
      description: `${club(p)} spielt intern mit dem Gedanken, dich mit einer besonderen Geste zu ehren - Gerüchte über ein Wandbild im Stadionviertel und ein Sondertrikot machen die Runde.`,
      choices: [
        {
          id: "annehmen",
          label: "Sich aktiv einbringen (Autogrammstunden, Fanprojekt)",
          effects: {
            wealth: 10000,
            reputation: 6,
            clubRelation: 6,
            traitDeltas: { medienimage: 4 },
            logText: "bringt sich aktiv in Fanprojekte und Autogrammstunden ein.",
            logKind: "positive",
            storyline: { storylineId: "ikone", label: "Vereinsikone", stage: 2, totalStages: 3, nextTemplateId: "ikone_3", delaySeasons: 2, data: { engaged: "aktiv" } },
          },
        },
        {
          id: "zurueckhalten",
          label: "Lieber zurückhaltend bleiben, Fokus aufs Sportliche",
          effects: {
            attributes: { mentalitaet: 1 },
            clubRelation: 3,
            logText: "bleibt beim Rummel um die eigene Person zurückhaltend und fokussiert sich aufs Sportliche.",
            logKind: "info",
            storyline: { storylineId: "ikone", label: "Vereinsikone", stage: 2, totalStages: 3, nextTemplateId: "ikone_3", delaySeasons: 2, data: { engaged: "zurueckhaltend" } },
          },
        },
      ],
    }),
  },
  {
    id: "ikone_3",
    category: "meilenstein",
    minAge: 26,
    maxAge: 41,
    weight: 0,
    storylineOnly: true,
    build: (p, ctx) => {
      const engaged = ctx.storyData?.engaged ?? "zurueckhaltend";
      return {
        category: "meilenstein",
        title: "Vereinsikone",
        description: `Es ist offiziell: du bist zur lebenden Legende von ${club(p)} geworden - der Verein kündigt zu deinen Ehren ein Testimonial-Spiel an.`,
        choices: [
          {
            id: "ok",
            label: "Die Ehrung annehmen",
            effects: {
              reputation: 10,
              wealth: engaged === "aktiv" ? 30000 : 15000,
              clubRelation: 10,
              traitDeltas: { fuehrung: 3, medienimage: 3 },
              logText: `wird als lebende Vereinsikone von ${club(p)} mit einem Testimonial-Spiel geehrt.`,
              logKind: "milestone",
              storyline: { storylineId: "ikone", label: "Vereinsikone", stage: 3, totalStages: 3 },
            },
          },
        ],
      };
    },
  },

  {
    id: "meilenstein_kabinenansprache",
    category: "meilenstein",
    minAge: 22,
    maxAge: 36,
    weight: 1.8,
    condition: (p) => p.traits.fuehrung > 40,
    dynamicWeight: (p) => clamp(p.traits.fuehrung / 50, 1, 2),
    build: (p) => ({
      category: "meilenstein",
      title: "Die Mannschaft steckt in der Krise",
      description: `Nach zwei enttäuschenden Ergebnissen von ${club(p)} erwartet die Kabine ein klares Wort - alle Blicke richten sich auf dich.`,
      choices: [
        {
          id: "ansprache",
          label: "Kabinenansprache halten",
          detail: "Übernimmst offen die Verantwortung - stärkt Führungsstärke und Vereinsbeziehung.",
          effects: {
            traitDeltas: { fuehrung: 4, medienimage: 2 },
            clubRelation: 3,
            logText: "hat mit einer klaren Ansprache die Kabine wieder auf Kurs gebracht.",
            logKind: "info",
          },
        },
        {
          id: "zurueckhalten",
          label: "Lieber der Mannschaft die Sache selbst überlassen",
          detail: "Kein Risiko, aber die Chance, sich als Führungsspieler zu zeigen, bleibt ungenutzt.",
          effects: {
            traitDeltas: { fuehrung: -2 },
            logText: "hat sich bewusst zurückgehalten und die Kabine sich selbst überlassen.",
            logKind: "info",
          },
        },
      ],
    }),
  },

  // --- 4) Zoff mit dem Trainer ----------------------------------------------
  {
    id: "trainerzoff_1",
    category: "taktik",
    minAge: 21,
    maxAge: 34,
    weight: 1,
    condition: (p) =>
      (p.stage === "etabliert" || p.stage === "veteran") &&
      p.contract.squadRole !== "Ausbildungsspieler" &&
      // Ein Wechsel beendet einen laufenden Trainerkonflikt beim ALTEN Verein
      // (siehe CLUB_BOUND_STORYLINES in careerEngine.ts), aber ohne diese
      // zusätzliche Sperre könnte direkt in der ersten Saison beim NEUEN Verein
      // ein frischer Konflikt aufflammen - das liest sich wie eine nahtlose
      // Fortsetzung des alten Streits statt eines neuen, eigenständigen. Erst ab
      // der zweiten Saison am aktuellen Verein ist ein neuer Trainerkonflikt
      // glaubwürdig.
      !recentlyTransferred(p) &&
      !p.completedStorylines.includes("trainerzoff") &&
      !p.activeStorylines.some((t) => t.storylineId === "trainerzoff"),
    build: (p) => ({
      category: "taktik",
      title: "Taktischer Streit",
      description: `Nach einer öffentlichen taktischen Kontroverse mit dem Trainer von ${club(p)} wirst du überraschend auf die Bank gesetzt.`,
      choices: [
        {
          id: "oeffentlich",
          label: "Den Konflikt öffentlich über die Medien austragen",
          effects: {
            reputation: 3,
            clubRelation: -8,
            traitDeltas: { medienimage: -3, fuehrung: 2 },
            logText: "trägt den Konflikt mit dem Trainer öffentlich über die Medien aus.",
            logKind: "negative",
            storyline: { storylineId: "trainerzoff", label: "Zoff mit dem Trainer", stage: 1, totalStages: 3, nextTemplateId: "trainerzoff_2", delaySeasons: 1, data: { path: "oeffentlich" } },
          },
        },
        {
          id: "intern",
          label: "Das klärende Gespräch intern und sachlich suchen",
          effects: {
            clubRelation: 2,
            traitDeltas: { disziplin: 2, fuehrung: 1 },
            logText: "sucht das klärende Gespräch mit dem Trainer intern und sachlich.",
            logKind: "info",
            storyline: { storylineId: "trainerzoff", label: "Zoff mit dem Trainer", stage: 1, totalStages: 3, nextTemplateId: "trainerzoff_2", delaySeasons: 1, data: { path: "intern" } },
          },
        },
      ],
    }),
  },
  {
    id: "trainerzoff_2",
    category: "taktik",
    minAge: 21,
    maxAge: 35,
    weight: 0,
    storylineOnly: true,
    build: (p, ctx) => {
      const path = ctx.storyData?.path ?? "intern";
      return {
        category: "taktik",
        title: "Die Situation spitzt sich zu",
        description:
          path === "oeffentlich"
            ? `Die öffentliche Auseinandersetzung mit dem Trainer sorgt bei ${club(p)} für Unruhe in der Kabine - die Vereinsführung fordert eine Entscheidung.`
            : `Trotz des klärenden Gesprächs bleibt die Situation mit dem Trainer bei ${club(p)} angespannt - eine Entscheidung steht an.`,
        choices: [
          {
            id: "einlenken",
            label: "Einlenken und sich dem Trainer unterordnen",
            effects: {
              clubRelation: 6,
              traitDeltas: { disziplin: 3 },
              morale: -2,
              logText: "lenkt im Konflikt mit dem Trainer ein.",
              logKind: "info",
              storyline: { storylineId: "trainerzoff", label: "Zoff mit dem Trainer", stage: 2, totalStages: 3, nextTemplateId: "trainerzoff_3", delaySeasons: 1, data: { outcome: "versoehnt" } },
            },
          },
          {
            id: "standhaft",
            label: "Standhaft bleiben und auf einen Wechsel pochen",
            effects: {
              wantsTransfer: true,
              traitDeltas: { fuehrung: 2 },
              clubRelation: -6,
              logText: "bleibt im Konflikt mit dem Trainer standhaft und pocht auf einen Wechsel.",
              logKind: "negative",
              storyline: { storylineId: "trainerzoff", label: "Zoff mit dem Trainer", stage: 2, totalStages: 3, nextTemplateId: "trainerzoff_3", delaySeasons: 1, data: { outcome: "eskaliert" } },
            },
          },
        ],
      };
    },
  },
  {
    id: "trainerzoff_3",
    category: "taktik",
    minAge: 21,
    maxAge: 36,
    weight: 0,
    storylineOnly: true,
    build: (p, ctx) => {
      const outcome = ctx.storyData?.outcome ?? "versoehnt";
      if (outcome === "versoehnt") {
        return {
          category: "taktik",
          title: "Der Burgfrieden",
          description: `Der Konflikt mit dem Trainer bei ${club(p)} ist beigelegt - du hast dich zurück ins Team gekämpft.`,
          choices: [
            {
              id: "ok",
              label: "Weitermachen",
              effects: {
                squadRoleOverride: "Rotation",
                roleProtectionSeasons: 1,
                clubRelation: 8,
                morale: 6,
                traitDeltas: { disziplin: 2 },
                logText: "hat den Konflikt mit dem Trainer beigelegt und sich zurück ins Team gekämpft.",
                logKind: "positive",
                storyline: { storylineId: "trainerzoff", label: "Zoff mit dem Trainer", stage: 3, totalStages: 3 },
              },
            },
          ],
        };
      }
      return {
        category: "taktik",
        title: "Der Bruch",
        description: `Der Konflikt mit dem Trainer bei ${club(p)} ist endgültig eskaliert - du wirst aus dem Kader verbannt, der Verein prüft bereits eine vorzeitige Vertragsauflösung.`,
        choices: [
          {
            id: "ok",
            label: "Nach vorne blicken",
            effects: {
              wantsTransfer: true,
              // Klarer Bruch statt sanftem Dämpfer: die Vereinsbeziehung wird auf
              // den absoluten Tiefpunkt gesetzt und die Kaderrolle direkt auf die
              // Ersatzbank durchgereicht - das garantiert (siehe
              // `shouldTriggerTransferPressure`), dass der Verein im nächsten
              // Transferfenster tatsächlich einen Abgang forciert, statt es bei
              // einer vagen Ankündigung zu belassen.
              clubRelation: -100,
              squadRoleOverride: "Ersatzbank",
              reputation: 2,
              morale: -6,
              traitDeltas: { fuehrung: 2 },
              logText: "eskaliert den Streit mit dem Trainer endgültig, wird aus dem Kader verbannt - der Vertrag steht vor dem Bruch.",
              logKind: "negative",
              storyline: { storylineId: "trainerzoff", label: "Zoff mit dem Trainer", stage: 3, totalStages: 3 },
            },
          },
        ],
      };
    },
  },

  // --- 5) Der Marken-Deal ----------------------------------------------------
  {
    id: "marke_1",
    category: "sponsoring",
    minAge: 19,
    maxAge: 36,
    weight: 1,
    condition: (p) =>
      p.reputation >= 20 &&
      !p.completedStorylines.includes("marke") &&
      !p.activeStorylines.some((t) => t.storylineId === "marke"),
    build: () => ({
      category: "sponsoring",
      title: "Eine Boutique-Marke fragt an",
      description: "Eine aufstrebende Modemarke meldet sich mit einer ersten kleinen Kooperationsanfrage bei dir.",
      choices: [
        {
          id: "ja",
          label: "Der kleinen Kooperation zusagen",
          effects: {
            wealth: 8000,
            traitDeltas: { medienimage: 2 },
            logText: "sagt einer kleinen Modemarken-Kooperation zu.",
            logKind: "positive",
            storyline: { storylineId: "marke", label: "Der Marken-Deal", stage: 1, totalStages: 3, nextTemplateId: "marke_2", delaySeasons: 2 },
          },
        },
        {
          id: "nein",
          label: "Dankend ablehnen, sich aufs Sportliche konzentrieren",
          effects: {
            attributes: { mentalitaet: 1 },
            logText: "lehnt die Kooperationsanfrage dankend ab und konzentriert sich aufs Sportliche.",
            logKind: "info",
            storyline: { storylineId: "marke", label: "Der Marken-Deal", stage: 1, totalStages: 3 },
          },
        },
      ],
    }),
  },
  {
    id: "marke_2",
    category: "sponsoring",
    minAge: 19,
    maxAge: 38,
    weight: 0,
    storylineOnly: true,
    build: () => ({
      category: "sponsoring",
      title: "Der Deal wächst",
      description: "Die Kooperation lief gut - jetzt bietet die Marke einen deutlich größeren Vertrag als Markenbotschafter an, der aber Zeit und Fokus kostet.",
      choices: [
        {
          id: "botschafter",
          label: "Den großen Botschaftervertrag unterschreiben",
          effects: {
            wealth: 60000,
            reputation: 6,
            fitness: -4,
            traitDeltas: { medienimage: 4 },
            logText: "unterschreibt einen großen Vertrag als Markenbotschafter.",
            logKind: "positive",
            storyline: { storylineId: "marke", label: "Der Marken-Deal", stage: 2, totalStages: 3, nextTemplateId: "marke_3", delaySeasons: 2, data: { path: "botschafter" } },
          },
        },
        {
          id: "reduzieren",
          label: "Das Engagement bewusst klein halten",
          effects: {
            wealth: 15000,
            traitDeltas: { disziplin: 2 },
            logText: "hält das Engagement für die Marke bewusst klein.",
            logKind: "info",
            storyline: { storylineId: "marke", label: "Der Marken-Deal", stage: 2, totalStages: 3, nextTemplateId: "marke_3", delaySeasons: 2, data: { path: "fokus" } },
          },
        },
      ],
    }),
  },
  {
    id: "marke_3",
    category: "sponsoring",
    minAge: 19,
    maxAge: 40,
    weight: 0,
    storylineOnly: true,
    build: (_p, ctx) => {
      const path = ctx.storyData?.path ?? "fokus";
      if (path === "botschafter") {
        return {
          category: "sponsoring",
          title: "Die eigene Kollektion",
          description: "Der Erfolg als Markenbotschafter mündet in eine eigene, nach dir benannte Produktlinie.",
          choices: [
            {
              id: "ok",
              label: "Die Kollektion launchen",
              effects: {
                wealth: 120000,
                reputation: 8,
                clubRelation: -3,
                traitDeltas: { medienimage: 3 },
                logText: "bringt eine eigene, nach ihm/ihr benannte Produktlinie auf den Markt.",
                logKind: "positive",
                storyline: { storylineId: "marke", label: "Der Marken-Deal", stage: 3, totalStages: 3 },
              },
            },
          ],
        };
      }
      return {
        category: "sponsoring",
        title: "Der Sport zuerst",
        description: "Das bewusst kleingehaltene Engagement für die Marke zahlt sich sportlich aus.",
        choices: [
          {
            id: "ok",
            label: "Weitermachen",
            effects: {
              attributes: { mentalitaet: 1 },
              clubRelation: 4,
              wealth: 20000,
              logText: "hat den sportlichen Fokus über das große Geld mit der Marke gestellt.",
              logKind: "positive",
              storyline: { storylineId: "marke", label: "Der Marken-Deal", stage: 3, totalStages: 3 },
            },
          },
        ],
      };
    },
  },

  // ---------------------------------------------------------------------
  // WEITERE FUSSBALL-REALISTISCHE EREIGNISSE - für mehr Varianz jenseits des
  // Trainingsalltags: Themen, die im echten Profifußball (Transfermarkt/
  // Presse/Spielerberater-Diskurs) immer wieder eine Rolle spielen.
  // ---------------------------------------------------------------------
  {
    id: "medien_transfergeruecht",
    category: "medien",
    minAge: 19,
    maxAge: 36,
    weight: 1.2,
    condition: (p) => p.reputation > 30,
    build: (p) => ({
      category: "medien",
      title: "Zeitungsente über einen Wechsel",
      description: `Eine Boulevardzeitung berichtet über einen angeblich fixen Wechsel weg von ${club(p)} - ohne dass ein Verein je Kontakt aufgenommen hätte.`,
      choices: [
        {
          id: "dementieren",
          label: "Klar dementieren",
          effects: { clubRelation: 4, traitDeltas: { medienimage: 1 }, logText: "hat das Wechselgerücht öffentlich klar dementiert.", logKind: "info" },
        },
        {
          id: "offenlassen",
          label: "Bewusst nichts dementieren",
          effects: { reputation: 3, clubRelation: -4, wantsTransfer: true, logText: "hat das Wechselgerücht bewusst unkommentiert stehen lassen - das Verhältnis zum Verein kühlt ab.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "medien_zitat_verdreht",
    category: "medien",
    minAge: 18,
    maxAge: 38,
    weight: 1,
    build: (p) => ({
      category: "medien",
      title: "Ein Zitat sorgt für Wirbel",
      description: `Ein aus dem Zusammenhang gerissenes Zitat von dir nach dem Spiel bei ${club(p)} verbreitet sich rasant in den sozialen Medien.`,
      choices: [
        {
          id: "klarstellen",
          label: "Öffentlich klarstellen",
          effects: { attributes: { charisma: 1 }, traitDeltas: { medienimage: 2 }, logText: "hat das verdrehte Zitat öffentlich klargestellt und Souveränität gezeigt.", logKind: "positive" },
        },
        {
          id: "ignorieren",
          label: "Die Sache aussitzen",
          effects: { morale: -2, traitDeltas: { medienimage: -1 }, logText: "hat den Wirbel um das verdrehte Zitat einfach ausgesessen.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "vertrag_beraterwechsel",
    category: "vertrag",
    minAge: 20,
    maxAge: 36,
    weight: 1,
    condition: (p) => p.reputation > 35,
    build: (_p) => ({
      category: "vertrag",
      title: "Ein neuer Berater klopft an",
      description: `Eine bekannte Spielerberater-Agentur wirbt aktiv um dich und verspricht bessere Konditionen als dein aktueller Berater.`,
      choices: [
        {
          id: "wechseln",
          label: "Berater wechseln",
          effects: { wageMultiplier: 1.08, wealth: -8000, clubRelation: -2, logText: "hat den Berater gewechselt - erste Verhandlungserfolge lassen nicht lange auf sich warten.", logKind: "positive" },
        },
        {
          id: "treu",
          label: "Dem bisherigen Berater die Treue halten",
          effects: { traitDeltas: { disziplin: 1 }, clubRelation: 1, logText: "ist dem bisherigen Berater treu geblieben.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "vertrag_bosman_poker",
    category: "vertrag",
    minAge: 25,
    maxAge: 36,
    weight: 1.3,
    condition: (p) => p.contract.yearsLeft <= 1 && p.reputation > 30,
    build: (p) => ({
      category: "vertrag",
      title: "Vertrag läuft aus - Poker um die Ablösefreiheit",
      description: `Dein Vertrag bei ${club(p)} läuft in einem Jahr aus. Ablösefrei wärst du für Top-Vereine hochinteressant - der Verein drängt aber auf eine schnelle Verlängerung.`,
      choices: [
        {
          id: "pokern",
          label: "Bis zum letzten Moment pokern",
          effects: { clubRelation: -10, reputation: 4, wantsTransfer: true, logText: "lässt den Vertrag bewusst auslaufen und pokert auf einen ablösefreien Wechsel.", logKind: "negative" },
        },
        {
          id: "verlaengern",
          label: "Frühzeitig verlängern",
          effects: { clubRelation: 10, morale: 4, logText: "hat sich früh auf eine Vertragsverlängerung eingelassen - Sicherheit vor Poker.", logKind: "positive" },
        },
      ],
    }),
  },
  {
    id: "verletzung_doppelbelastung",
    category: "verletzung",
    minAge: 20,
    maxAge: 33,
    weight: 1.3,
    condition: (p) => p.nationalTeamCaps > 0,
    build: (p) => ({
      category: "verletzung",
      title: "Doppelbelastung: Verein gegen Nationalmannschaft",
      description: `Enge Terminplanung zwischen ${club(p)} und der Nationalmannschaft lässt kaum Erholungszeit - Vereinstrainer und Nationaltrainer ziehen dich in unterschiedliche Richtungen.`,
      choices: [
        {
          id: "durchziehen",
          label: "Beide Seiten bedienen und durchziehen",
          effects: {},
          followUpChance: {
            chance: 0.55,
            success: { attributes: { mentalitaet: 1 }, reputation: 3, capsDelta: 1, logText: "hat die Doppelbelastung erstaunlich gut weggesteckt.", logKind: "positive" },
            failure: { injuryWeeksOut: 4, injuryLabel: "Überlastungsschaden", morale: -4, logText: "ist an der Doppelbelastung zwischen Verein und Nationalmannschaft körperlich zerbrochen.", logKind: "negative" },
          },
        },
        {
          id: "pause_einfordern",
          label: "Eine Pause beim Nationaltrainer einfordern",
          effects: { fitness: 6, clubRelation: 3, reputation: -2, logText: "hat beim Nationaltrainer eine Pause eingefordert - der Klub ist erleichtert.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "verletzung_reserve_restart",
    category: "verletzung",
    minAge: 18,
    maxAge: 34,
    weight: 1,
    condition: (p) => p.totalInjuryWeeks >= 10,
    build: (p) => ({
      category: "verletzung",
      title: "Neustart in der zweiten Mannschaft",
      description: `Nach der langen Verletzungspause soll ein Kurzeinsatz in der zweiten Mannschaft von ${club(p)} den Formaufbau beschleunigen.`,
      choices: [
        {
          id: "durchbeissen",
          label: "Sich durch mehrere Spiele durchbeißen",
          effects: { fitness: 6, morale: 4, attributes: { mentalitaet: 1 }, logText: "hat sich über mehrere Reservespiele zurück in Form gekämpft.", logKind: "positive" },
        },
        {
          id: "geduld",
          label: "Auf schrittweisen Formaufbau bestehen",
          effects: { fitness: 3, clubRelation: 2, logText: "hat auf einen behutsamen, schrittweisen Formaufbau bestanden.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "lifestyle_legendenspiel",
    category: "lifestyle",
    minAge: 29,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.reputation > 40,
    build: (_p) => ({
      category: "lifestyle",
      title: "Einladung zum Legenden-Wohltätigkeitsspiel",
      description: "Ein Verband lädt zu einem prestigeträchtigen Wohltätigkeits-Freundschaftsspiel mit früheren und aktuellen Stars ein.",
      choices: [
        {
          id: "mitmachen",
          label: "Teilnehmen",
          effects: {},
          followUpChance: {
            chance: 0.8,
            success: { reputation: 5, attributes: { charisma: 1 }, traitDeltas: { medienimage: 2 }, logText: "hat beim Legenden-Wohltätigkeitsspiel einen bleibenden Eindruck hinterlassen.", logKind: "positive" },
            failure: { injuryWeeksOut: 2, injuryLabel: "Zerrung im Showspiel", morale: -2, logText: "hat sich ausgerechnet im lockeren Wohltätigkeitsspiel eine Zerrung zugezogen.", logKind: "negative" },
          },
        },
        {
          id: "absagen",
          label: "Aus Vorsicht absagen",
          effects: { fitness: 2, logText: "hat die Einladung zum Legenden-Wohltätigkeitsspiel aus Vorsicht abgesagt.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "lifestyle_dopingkontrolle",
    category: "lifestyle",
    minAge: 18,
    maxAge: 40,
    weight: 1,
    build: (_p) => ({
      category: "lifestyle",
      title: "Routine-Dopingkontrolle",
      description: `Nach dem Spiel wirst du wie üblich zufällig für eine Dopingkontrolle ausgewählt - reine Routine, aber die Prozedur zieht sich.`,
      choices: [
        {
          id: "gelassen",
          label: "Gelassen bleiben",
          effects: { attributes: { mentalitaet: 1 }, logText: "hat die Dopingkontrolle gelassen über sich ergehen lassen.", logKind: "info" },
        },
        {
          id: "genervt",
          label: "Sichtlich genervt reagieren",
          effects: { morale: -1, traitDeltas: { medienimage: -1 }, logText: "hat bei der Dopingkontrolle sichtlich genervt reagiert - ein Reporter hat es mitbekommen.", logKind: "negative" },
        },
      ],
    }),
  },
  {
    id: "meilenstein_kapitaensfrage",
    category: "meilenstein",
    minAge: 24,
    maxAge: 37,
    weight: 1,
    condition: (p) => p.clubRelation > 45 && (p.traits.fuehrung > 45 || p.contract.squadRole === "Stammspieler"),
    build: (p) => ({
      category: "meilenstein",
      title: "Wer trägt die Kapitänsbinde?",
      description: `Bei ${club(p)} wird nach dem Abschied des bisherigen Kapitäns offen über die Nachfolge diskutiert - auch dein Name fällt.`,
      choices: [
        {
          id: "bewerben",
          label: "Sich offen um die Binde bewerben",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { clubRelation: 8, reputation: 5, traitDeltas: { fuehrung: 3 }, logText: "wird zum neuen Kapitän ernannt - eine große Anerkennung.", logKind: "milestone" },
            failure: { morale: -3, traitDeltas: { fuehrung: 1 }, logText: "geht bei der Kapitänswahl leer aus, bleibt aber eine wichtige Stimme in der Kabine.", logKind: "info" },
          },
        },
        {
          id: "unterstuetzen",
          label: "Einen Teamkollegen unterstützen",
          effects: { clubRelation: 5, traitDeltas: { fuehrung: 1 }, logText: "hat einen Teamkollegen für die Kapitänsbinde unterstützt statt selbst anzutreten.", logKind: "positive" },
        },
      ],
    }),
  },
  {
    id: "meilenstein_eigene_akademie",
    category: "meilenstein",
    minAge: 30,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.wealth > 400000,
    build: () => ({
      category: "meilenstein",
      title: "Die eigene Fußballschule",
      description: "Ein früherer Jugendtrainer schlägt vor, gemeinsam eine eigene Fußballschule für Nachwuchstalente zu gründen.",
      choices: [
        {
          id: "investieren",
          label: "Investieren und gründen",
          effects: { wealth: -150000, reputation: 6, attributes: { charisma: 1 }, traitDeltas: { medienimage: 2 }, educationPoints: 6, logText: "hat in die Gründung einer eigenen Fußballschule für Nachwuchstalente investiert.", logKind: "positive" },
        },
        {
          id: "verschieben",
          label: "Auf die Zeit nach der Karriere verschieben",
          effects: { logText: "verschiebt die Idee einer eigenen Fußballschule auf die Zeit nach der Karriere.", logKind: "info" },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // KARRIERE-PSYCHOLOGIE: Vereinswechsel, Trainer, Medien, Konkurrenz - wie
  // man mit den mentalen Kernsituationen einer Profikarriere umgeht. Bewusst
  // klar von verwandten bestehenden Ereignissen abgegrenzt: "vertrag_neuankunft_schwierig"
  // greift NUR direkt nach einem echten Wechsel (siehe `recentlyTransferred`) UND
  // NICHT nach einer Rückkehr vom Ausland ins Heimatland (siehe
  // `p.recentTransferWasForeignHomecoming` - dafür gibt es stattdessen das positive
  // Gegenstück "vertrag_heimkehr_ausland_glueck" direkt darunter, Bugreport:
  // "Wechsel vom Ausland ins Heimatland sollten... nicht Einfindungsschwierigkeiten
  // triggern"), "taktik_neuer_trainer_infrage" schließt sich mit der laufenden
  // "trainerzoff"-Storyline gegenseitig aus, "taktik_stammplatz_verloren" respektiert
  // eine aktive Stammplatzgarantie (kein Widerspruch zu deren Rollen-Floor).
  // ---------------------------------------------------------------------
  {
    id: "vertrag_neuankunft_schwierig",
    category: "vertrag",
    minAge: 18,
    maxAge: 38,
    weight: 1.5,
    condition: (p) => p.stage !== "jugend" && p.clubChangesCount > 0 && recentlyTransferred(p) && !p.recentTransferWasForeignHomecoming,
    build: (p) => ({
      category: "vertrag",
      title: "Ankommen beim neuen Verein",
      description: `Der Wechsel zu ${club(p)} ist vollzogen, aber du tust dich schwer, im neuen Umfeld richtig anzukommen - neue Mitspieler, neues System, neue Erwartungen.`,
      choices: [
        {
          id: "geduldig",
          label: "Geduldig unterordnen, auf der Bank Vertrauen erarbeiten",
          detail: "Langsamer Start, wenig Druck - späte, aber stabile Stammplatzetablierung.",
          effects: {
            clubRelation: 4,
            morale: -2,
            roleProtectionSeasons: 1,
            traitDeltas: { disziplin: 2, arbeitsmoral: 2 },
            logText: "hat sich beim neuen Verein zunächst geduldig einsortiert und Vertrauen erarbeitet.",
            logKind: "info",
          },
        },
        {
          id: "draengen",
          label: "Sofort beim Trainer auf Einsatzzeit drängen",
          detail: "Kurzfristig evtl. Chance, aber Reibung mit dem Trainer möglich.",
          effects: {},
          followUpChance: {
            chance: 0.45,
            success: {
              clubRelation: 2,
              morale: 4,
              attributes: { mentalitaet: 1 },
              logText: "hat beim Trainer auf Einsatzzeit gedrängt und sich so tatsächlich Chancen erspielt.",
              logKind: "positive",
            },
            failure: {
              clubRelation: -6,
              morale: -4,
              logText: "ist beim Trainer mit dem Drängen auf Einsatzzeit angeeckt - das Verhältnis bleibt unstet.",
              logKind: "negative",
            },
          },
        },
        {
          id: "mentor",
          label: "Über Nebenleute/Mentor im Kader Rückhalt aufbauen",
          detail: "Mittleres Tempo, sozial abgesichert - feste Rolle ab der Winterpause.",
          effects: {
            clubRelation: 6,
            morale: 5,
            roleProtectionSeasons: 1,
            traitDeltas: { fuehrung: 1 },
            logText: "hat sich über einen Mentor im Kader Rückhalt beim neuen Verein aufgebaut.",
            logKind: "positive",
          },
        },
      ],
    }),
  },
  // Positives Gegenstück zu "vertrag_neuankunft_schwierig" (siehe Bugreport oben):
  // nach der Rückkehr vom Ausland ins Heimatland ist das Ankommen kein Kampf,
  // sondern eine willkommene Selbstverständlichkeit - vertraute Sprache, Kultur
  // und (meist) auch der neue-alte Verein sorgen für einen runden Start, den man
  // nach der Zeit im Ausland bewusst genießt.
  {
    id: "vertrag_heimkehr_ausland_glueck",
    category: "vertrag",
    minAge: 18,
    maxAge: 38,
    weight: 1.5,
    condition: (p) => p.stage !== "jugend" && recentlyTransferred(p) && p.recentTransferWasForeignHomecoming,
    build: (p) => ({
      category: "vertrag",
      title: "Wieder daheim",
      description: `Nach der Zeit im Ausland ist die Rückkehr zu ${club(p)} geschafft - vertraute Sprache, vertraute Wege, ein Zuhause, das ${p.name} sichtlich guttut. Wie gehst du mit dem Neustart in der Heimat um?`,
      choices: [
        {
          id: "genuss",
          label: "Die Rückkehr in Ruhe genießen und ankommen lassen",
          detail: "Entspannter Neustart, spürbar bessere Stimmung von Anfang an.",
          effects: {
            clubRelation: 5,
            morale: 8,
            logText: "genießt sichtlich die Rückkehr in die Heimat nach der Zeit im Ausland.",
            logKind: "positive",
          },
        },
        {
          id: "fokus",
          label: "Die neue Sicherheit sofort in Leistung ummünzen",
          detail: "Weniger Nostalgie, dafür schneller wieder auf Betriebstemperatur.",
          effects: {
            clubRelation: 3,
            attributes: { mentalitaet: 1 },
            traitDeltas: { arbeitsmoral: 1 },
            logText: "nutzt die vertraute Heimat-Umgebung, um sofort wieder voll anzugreifen.",
            logKind: "positive",
          },
        },
      ],
    }),
  },
  {
    id: "taktik_neuer_trainer_infrage",
    category: "taktik",
    minAge: 21,
    maxAge: 35,
    weight: 1,
    condition: (p) =>
      p.contract.squadRole !== "Ausbildungsspieler" &&
      p.startingRoleGuaranteeSeasons === 0 &&
      !p.activeStorylines.some((t) => t.storylineId === "trainerzoff"),
    build: (p) => ({
      category: "taktik",
      title: "Neuer Trainer stellt dich infrage",
      description: `Ein neuer Trainer übernimmt bei ${club(p)} und stellt vor der versammelten Mannschaft offen infrage, ob du noch gesetzt bist.`,
      choices: [
        {
          id: "ruhig",
          label: "Öffentlich ruhig bleiben, im Training überzeugen",
          detail: "Risikoarm, langsamer Effekt - schrittweise Vertrauensrückgewinnung.",
          effects: {
            clubRelation: 3,
            attributes: { mentalitaet: 1 },
            traitDeltas: { disziplin: 2 },
            logText: "ist auf die Infragestellung durch den neuen Trainer ruhig geblieben und hat im Training überzeugt.",
            logKind: "info",
          },
        },
        {
          id: "gespraech",
          label: "Direktes Gespräch unter vier Augen einfordern",
          detail: "Klärend, aber Konfrontation möglich - klare Rolle, keine Grauzone mehr.",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: {
              clubRelation: 8,
              morale: 4,
              roleProtectionSeasons: 1,
              traitDeltas: { fuehrung: 2 },
              logText: "hat das direkte Gespräch mit dem neuen Trainer gesucht - eine klare, positive Rollenklärung.",
              logKind: "positive",
            },
            failure: {
              clubRelation: -8,
              morale: -4,
              squadRoleOverride: "Ergänzungsspieler",
              logText: "hat das direkte Gespräch mit dem neuen Trainer gesucht - die Rolle klärt sich, aber negativ.",
              logKind: "negative",
            },
          },
        },
        {
          id: "berater",
          label: "Berater/Agenten einschalten, Druck über Medien/Umfeld",
          detail: "Schnelle Wirkung möglich, aber Vertrauensverlust - Etikett \"schwierig\", Bankplatz-Risiko steigt.",
          effects: {
            clubRelation: -10,
            reputation: 2,
            traitDeltas: { medienimage: -4 },
            logText: "hat über den Berater Druck über die Medien aufgebaut - kurzfristig Aufmerksamkeit, aber das Vertrauen beim Trainer ist beschädigt.",
            logKind: "negative",
          },
        },
      ],
    }),
  },
  {
    id: "taktik_rote_karte_wichtig",
    category: "taktik",
    minAge: 18,
    maxAge: 38,
    weight: 1,
    build: (p) => ({
      category: "taktik",
      title: "Rot in einem wichtigen Spiel",
      description: `In einem wichtigen Spiel für ${club(p)} siehst du die Rote Karte - ein folgenschwerer Moment.`,
      choices: [
        {
          id: "annehmen",
          label: "Sperre annehmen, öffentlich Verantwortung übernehmen",
          detail: "Standardfolge: ein Spiel Ausfall, das Image bleibt intakt.",
          effects: {
            injuryWeeksOut: 1,
            injuryLabel: "Sperre nach Platzverweis",
            traitDeltas: { disziplin: 1 },
            logText: "hat nach einem Platzverweis die Sperre klaglos angenommen und öffentlich Verantwortung übernommen.",
            logKind: "info",
          },
        },
        {
          id: "einspruch",
          label: "Einspruch einlegen lassen",
          detail: "Ungewisser Ausgang - bei Erfolg kein Ausfall, bei Misserfolg zusätzlicher Imageschaden.",
          effects: {},
          followUpChance: {
            chance: 0.4,
            success: { wealth: -3000, reputation: 2, logText: "hat erfolgreich Einspruch gegen die Rote Karte eingelegt - keine Sperre.", logKind: "positive" },
            failure: {
              injuryWeeksOut: 1,
              injuryLabel: "Sperre nach Platzverweis",
              wealth: -3000,
              reputation: -3,
              traitDeltas: { medienimage: -2 },
              logText: "ist mit dem Einspruch gegen die Rote Karte gescheitert - zusätzlicher Imageschaden.",
              logKind: "negative",
            },
          },
        },
        {
          id: "nachtreten",
          label: "Emotional nachtreten (Interview, Social Media)",
          detail: "Kurzfristige Entlastung fürs eigene Ego - Verbandsstrafe droht, Ruf als Hitzkopf.",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: {
              injuryWeeksOut: 1,
              injuryLabel: "Sperre nach Platzverweis",
              morale: 3,
              traitDeltas: { medienimage: -3 },
              logText: "hat nach dem Platzverweis emotional nachgetreten - kurzfristig Luft abgelassen, der Ruf als Hitzkopf bleibt.",
              logKind: "negative",
            },
            failure: {
              injuryWeeksOut: 3,
              injuryLabel: "Verbandsstrafe nach Platzverweis",
              reputation: -5,
              traitDeltas: { medienimage: -6 },
              logText: "hat nach dem Platzverweis emotional nachgetreten - der Verband verhängt eine zusätzliche Strafe.",
              logKind: "negative",
            },
          },
        },
      ],
    }),
  },
  {
    id: "medien_fans_pfeifen",
    category: "medien",
    minAge: 18,
    maxAge: 40,
    weight: 1,
    condition: (p) => {
      const last = p.seasonHistory[p.seasonHistory.length - 1];
      return !!last && (last.avgRating < 6.2 || last.scoreTier === "Schwierige Saison" || last.scoreTier === "Durchwachsene Saison");
    },
    build: (p) => ({
      category: "medien",
      title: "Ausgepfiffen von den eigenen Fans",
      description: `Nach einer schwachen Phase pfeifen dich die eigenen Fans von ${club(p)} bei jeder Ballberührung aus.`,
      choices: [
        {
          id: "ruhig",
          label: "Ruhig bleiben, Leistung sprechen lassen",
          detail: "Langsamer Vertrauensaufbau - allmähliche Wiederannäherung.",
          effects: {
            clubRelation: 2,
            attributes: { mentalitaet: 1 },
            traitDeltas: { disziplin: 2 },
            logText: "hat auf die Pfiffe der eigenen Fans ruhig reagiert und auf die Leistung gesetzt.",
            logKind: "info",
          },
        },
        {
          id: "statement",
          label: "Öffentlich Stellung nehmen (Interview/Statement)",
          detail: "Schnelle Reaktion, aber Risiko der Eskalation - Versöhnung oder verhärtete Fronten.",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: {
              reputation: 3,
              morale: 6,
              traitDeltas: { medienimage: 3 },
              logText: "hat sich öffentlich zu den Pfiffen geäußert - die Fans reagieren versöhnlich.",
              logKind: "positive",
            },
            failure: {
              reputation: -3,
              morale: -5,
              traitDeltas: { medienimage: -4 },
              logText: "hat sich öffentlich zu den Pfiffen geäußert - die Fronten verhärten sich weiter.",
              logKind: "negative",
            },
          },
        },
        {
          id: "abschalten",
          label: "Innerlich abschalten, Rückzug ins Private",
          detail: "Schützt mental, wirkt aber distanziert - Entfremdung, Leistungsabfall möglich.",
          effects: {
            morale: 3,
            clubRelation: -3,
            attributes: { charisma: -1 },
            logText: "hat sich innerlich von den Pfiffen der Fans abgeschottet und zieht sich ins Private zurück.",
            logKind: "negative",
          },
        },
      ],
    }),
  },
  {
    id: "nationalmannschaft_erste_berufung_status",
    category: "nationalmannschaft",
    minAge: 18,
    maxAge: 34,
    weight: 1,
    unique: true,
    condition: (p) => p.nationalTeamCaps > 0,
    build: () => ({
      category: "nationalmannschaft",
      title: "Erstmals im Nationaltrikot - was jetzt?",
      description: "Die erste Berufung in die Nationalmannschaft ist Geschichte - wie gehst du mit dem neuen Status um?",
      choices: [
        {
          id: "fokus_nt",
          label: "Fokus voll auf die Nationalmannschaft legen",
          detail: "Prestige, aber Belastungssteigerung - das Verletzungsrisiko im Verein steigt.",
          effects: {},
          followUpChance: {
            chance: 0.65,
            success: {
              reputation: 6,
              fitness: -6,
              attributes: { mentalitaet: 1 },
              logText: "legt den Fokus voll auf die Nationalmannschaft - die zusätzliche Belastung zahlt sich prestigemäßig aus.",
              logKind: "positive",
            },
            failure: {
              reputation: 3,
              fitness: -6,
              injuryWeeksOut: 3,
              injuryLabel: "Überlastung durch Doppelbelastung",
              logText: "legt den Fokus voll auf die Nationalmannschaft - die Doppelbelastung fordert ihren Tribut mit einer Verletzung.",
              logKind: "negative",
            },
          },
        },
        {
          id: "zurueckhaltend",
          label: "Zurückhaltend/dankbar auftreten, Rolle im Verein priorisieren",
          detail: "Weniger medialer Druck - stabile Klubform, langsamerer Nationalmannschafts-Ausbau.",
          effects: {
            clubRelation: 4,
            morale: 3,
            traitDeltas: { disziplin: 1 },
            logText: "tritt nach der ersten Nationalmannschafts-Berufung zurückhaltend auf und priorisiert den Verein.",
            logKind: "positive",
          },
        },
        {
          id: "ansprueche",
          label: "Selbstbewusst neue Ansprüche im Verein anmelden",
          detail: "Kurzfristiger Machtgewinn möglich - Spannungen mit der Vereinsführung.",
          effects: {
            wageMultiplier: 1.1,
            clubRelation: -6,
            traitDeltas: { fuehrung: 2 },
            logText: "meldet nach der ersten Nationalmannschafts-Berufung selbstbewusst neue Ansprüche beim Verein an.",
            logKind: "negative",
          },
        },
      ],
    }),
  },
  {
    id: "taktik_stammplatz_verloren",
    category: "taktik",
    minAge: 20,
    maxAge: 35,
    weight: 1,
    condition: (p) =>
      p.contract.squadRole === "Stammspieler" &&
      p.startingRoleGuaranteeSeasons === 0 &&
      !p.activeStorylines.some((t) => t.storylineId === "rivalitaet"),
    build: (p) => ({
      category: "taktik",
      title: "Der Stammplatz ist weg",
      description: `Ein Konkurrent im eigenen Kader von ${club(p)} hat dir überraschend den Stammplatz streitig gemacht.`,
      choices: [
        {
          id: "akzeptieren",
          label: "Akzeptieren, im Training Geduld zeigen",
          detail: "Risikoarm - Chance bei der nächsten Formkrise des Konkurrenten.",
          effects: {
            morale: -2,
            roleProtectionSeasons: 1,
            traitDeltas: { disziplin: 2, arbeitsmoral: 2 },
            logText: "hat den Verlust des Stammplatzes akzeptiert und im Training geduldig weitergearbeitet.",
            logKind: "info",
          },
        },
        {
          id: "wechsel",
          label: "Wechsel im Winter forcieren",
          detail: "Schnelle Lösung, aber Vereinsverlust an Bindung - neues Umfeld, Anpassungsphase.",
          effects: {
            wantsTransfer: true,
            clubRelation: -6,
            logText: "forciert nach dem Verlust des Stammplatzes einen Wechsel im Winter.",
            logKind: "negative",
          },
        },
        {
          id: "erklaerung",
          label: "Offen um Erklärung beim Trainer bitten und Einsatz einfordern",
          detail: "Klärend, aber Konfliktrisiko - Rehabilitation oder endgültiger Bruch.",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: {
              clubRelation: 6,
              morale: 4,
              squadRoleOverride: "Rotation",
              roleProtectionSeasons: 1,
              logText: "hat den Trainer offen um eine Erklärung gebeten - die Aussprache führt zur Rehabilitation.",
              logKind: "positive",
            },
            failure: {
              clubRelation: -10,
              morale: -5,
              squadRoleOverride: "Ergänzungsspieler",
              wantsTransfer: true,
              logText: "hat den Trainer offen um eine Erklärung gebeten - die Aussprache endet im endgültigen Bruch.",
              logKind: "negative",
            },
          },
        },
      ],
    }),
  },
  {
    // Garantiertes Gegenstück zur automatischen Kaderrollen-Verschlechterung
    // (siehe `resolveClubSituation`/`decideRoleChallengeInjection` in
    // careerEngine.ts, Bugreport "wenn das Spiel mir sagt ich bekomme weniger
    // Spielzeit, kann ich aktiv nichts dagegen tun") - anders als die übrigen
    // Kaderrollen-Events hier bewusst NICHT dem Zufall des allgemeinen Pools
    // überlassen: taucht IMMER in der Saison nach einer erkannten Degradierung
    // auf, nicht nur manchmal.
    id: "taktik_kaderrolle_verteidigen",
    category: "taktik",
    minAge: 17,
    maxAge: 38,
    weight: 1.2,
    condition: (p) => p.roleChallengePending !== null,
    build: (p) => {
      const chance = roleChallengeSuccessChance(p);
      return {
        category: "taktik",
        title: "Die Kaderrolle wackelt",
        description: `Deine Rolle im Kader von ${club(
          p
        )} hat sich zuletzt spürbar verschlechtert - der Trainer traut dir gerade weniger zu. Wie reagierst du?`,
        choices: [
          {
            id: "geduldig",
            label: "Geduldig weiterarbeiten und im Training überzeugen",
            detail: "Risikoarm, aber keine unmittelbare Besserung - schützt zumindest vor weiterem Abrutschen.",
            effects: {
              morale: -2,
              roleProtectionSeasons: 1,
              traitDeltas: { disziplin: 2, arbeitsmoral: 1 },
              logText: "hat die schwächere Kaderrolle akzeptiert und im Training geduldig weitergearbeitet.",
              logKind: "info",
            },
          },
          {
            id: "wechsel",
            label: "Wechsel oder Leihe im Winter aktiv anstoßen",
            detail: "Klarer Schritt, aber Vereinsbindung leidet - neues Umfeld, neue Chance.",
            effects: {
              wantsTransfer: true,
              clubRelation: -4,
              logText: "stößt nach der schwächeren Kaderrolle aktiv einen Wechsel im Winter an.",
              logKind: "negative",
            },
          },
          {
            id: "kaempfen",
            label: "Aktiv beim Trainer um mehr Einsatzzeit kämpfen",
            detail: "Erfolgschance hängt von Auftreten, Vereinsverhältnis und zuletzt gezeigter Form ab.",
            effects: {},
            followUpChance: {
              chance,
              success: {
                clubRelation: 6,
                morale: 6,
                squadRoleOverride: p.roleChallengePending ?? undefined,
                roleProtectionSeasons: 1,
                traitDeltas: { fuehrung: 1 },
                logText: "hat sich beim Trainer für mehr Einsatzzeit starkgemacht - mit Erfolg, die alte Rolle ist zurück.",
                logKind: "positive",
              },
              failure: {
                clubRelation: -8,
                morale: -6,
                wantsTransfer: true,
                logText: "hat sich beim Trainer für mehr Einsatzzeit starkgemacht - ohne Erfolg, das Verhältnis leidet.",
                logKind: "negative",
              },
            },
          },
        ],
      };
    },
  },
  {
    id: "medien_kritik_formkrise",
    category: "medien",
    minAge: 18,
    maxAge: 40,
    weight: 1,
    condition: (p) => {
      const last = p.seasonHistory[p.seasonHistory.length - 1];
      return !!last && (last.avgRating < 6.2 || last.scoreTier === "Schwierige Saison" || last.scoreTier === "Durchwachsene Saison");
    },
    build: (p) => ({
      category: "medien",
      title: "Kritik nach einer Schwächephase",
      description: `Nach einer schwachen Serie für ${club(p)} häufen sich kritische Kommentare in den Medien.`,
      choices: [
        {
          id: "ignorieren",
          label: "Medien komplett ignorieren, nur auf Training fokussieren",
          detail: "Stabilisierend - langsame, aber solide Erholung.",
          effects: {
            attributes: { mentalitaet: 1 },
            traitDeltas: { disziplin: 2 },
            logText: "hat die Medienkritik komplett ignoriert und sich nur auf das Training konzentriert.",
            logKind: "info",
          },
        },
        {
          id: "selbstkritisch",
          label: "Selbstkritisch im Interview reagieren",
          detail: "Sympathisch, aber Angriffsfläche - der Druck von außen sinkt leicht.",
          effects: {
            reputation: -1,
            morale: 3,
            traitDeltas: { medienimage: 3 },
            logText: "hat sich in einem Interview selbstkritisch zur Formkrise geäußert.",
            logKind: "positive",
          },
        },
        {
          id: "zurueckweisen",
          label: "Medien scharf zurückweisen, Gegenangriff",
          detail: "Kurzfristig Genugtuung - Lagerbildung, erhöhter Druck bei nächstem Fehler.",
          effects: {
            morale: 4,
            reputation: -2,
            clubRelation: -2,
            traitDeltas: { medienimage: -5 },
            logText: "hat die Medienkritik scharf zurückgewiesen und den Gegenangriff gesucht.",
            logKind: "negative",
          },
        },
      ],
    }),
  },
  // ---------------------------------------------------------------------
  // PRIVATLEBEN & FAMILIE: Ereignisse jenseits von Beziehung/Heirat/Kindern -
  // Umzug, Krankheit im Umfeld, Medienrummel, Trennung, Freundeskreis,
  // Vorbildrolle. "beziehung_familie_umzug" greift wie
  // "vertrag_neuankunft_schwierig" nur direkt nach einem echten Wechsel.
  // ---------------------------------------------------------------------
  {
    id: "beziehung_familie_umzug",
    category: "beziehung",
    minAge: 20,
    maxAge: 38,
    weight: 1.3,
    condition: (p) => (p.relationshipStatus !== "single" || p.children > 0) && p.clubChangesCount > 0 && recentlyTransferred(p),
    build: (p) => ({
      category: "beziehung",
      title: "Der Umzug der Familie",
      description: `Nach dem Wechsel zu ${club(p)} gestaltet sich der Umzug der Familie in die neue Stadt schwieriger als gedacht.`,
      choices: [
        {
          id: "pendeln",
          label: "Familie vorerst am alten Wohnort lassen, selbst pendeln",
          detail: "Mentale Doppelbelastung - Konzentrationsschwankungen, Heimweh-Thematik.",
          effects: {
            morale: -5,
            attributes: { mentalitaet: -1 },
            logText: "lässt die Familie vorerst am alten Wohnort und pendelt selbst - die Doppelbelastung ist spürbar.",
            logKind: "negative",
          },
        },
        {
          id: "komplett",
          label: "Kompletten Umzug durchziehen, auch mit Reibung",
          detail: "Kurzfristiger Stress für alle - nach der Übergangsphase ein stabileres privates Umfeld.",
          effects: {
            morale: -3,
            fitness: -2,
            clubRelation: 2,
            logText: "zieht mit der ganzen Familie um - nach anfänglicher Reibung stabilisiert sich das private Umfeld.",
            logKind: "info",
          },
        },
        {
          id: "unterstuetzung",
          label: "Externe Unterstützung organisieren (Umzugsservice, Sprachcoach)",
          detail: "Kostet Geld und Aufwand - schnellere Integration der Familie, weniger Ablenkung im Alltag.",
          effects: {
            wealth: -12000,
            morale: 4,
            logText: "organisiert externe Unterstützung für den Umzug der Familie - die Integration gelingt spürbar schneller.",
            logKind: "positive",
          },
        },
      ],
    }),
  },
  {
    id: "beziehung_angehoeriger_krank",
    category: "beziehung",
    minAge: 19,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.stage !== "jugend",
    build: () => ({
      category: "beziehung",
      title: "Sorge um einen nahestehenden Menschen",
      description: "Ein enger Freund oder ein Familienmitglied wird schwer krank - die Nachricht trifft dich mitten in der Saison.",
      choices: [
        {
          id: "auszeit",
          label: "Auszeit vom Verein beantragen",
          detail: "Der Verein muss Verständnis zeigen - Formdelle durch Trainingsrückstand, aber mentale Entlastung.",
          effects: {
            fitness: -4,
            morale: 5,
            clubRelation: -1,
            logText: "hat sich wegen der Erkrankung eines nahestehenden Menschen eine Auszeit vom Verein genommen.",
            logKind: "info",
          },
        },
        {
          id: "weiter",
          label: "Weitertrainieren wie gewohnt, Gefühle kompartimentalisieren",
          detail: "Funktioniert kurzfristig - Risiko eines späteren emotionalen Einbruchs.",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: {
              attributes: { mentalitaet: 1 },
              logText: "hat trotz der Sorge um einen nahestehenden Menschen einfach weitertrainiert - es hält.",
              logKind: "info",
            },
            failure: {
              morale: -9,
              fitness: -3,
              logText: "hat die Sorge um einen nahestehenden Menschen verdrängt - der emotionale Einbruch kommt später umso härter.",
              logKind: "negative",
            },
          },
        },
        {
          id: "teilpensum",
          label: "Reduziertes Pensum mit dem Verein vereinbaren",
          detail: "Kompromiss - moderate Formschwankung, aber eine tragbare Balance.",
          effects: {
            fitness: -2,
            morale: 2,
            clubRelation: 1,
            logText: "vereinbart mit dem Verein ein reduziertes Trainingspensum, um für die Familie da zu sein.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "medien_paparazzi_privatleben",
    category: "medien",
    minAge: 20,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.reputation > 45,
    build: () => ({
      category: "medien",
      title: "Paparazzi vor der Haustür",
      description: "Das mediale Interesse an deinem Privatleben wächst spürbar - Boulevardblätter und Paparazzi lauern zunehmend.",
      choices: [
        {
          id: "abschotten",
          label: "Komplett abschotten, keine Social-Media-Präsenz",
          detail: "Schützt die Privatsphäre - weniger Ablenkung, aber der Imageaufbau leidet.",
          effects: {
            morale: 2,
            traitDeltas: { medienimage: -3 },
            logText: "schottet sich medial komplett ab, um die Privatsphäre zu schützen.",
            logKind: "info",
          },
        },
        {
          id: "einblicke",
          label: "Teilweise Einblicke gewähren, um das Narrativ zu kontrollieren",
          detail: "Zeitaufwand - positiveres öffentliches Bild möglich, aber die Grenze privat/öffentlich verschwimmt.",
          effects: {},
          followUpChance: {
            chance: 0.6,
            success: {
              reputation: 3,
              morale: -1,
              traitDeltas: { medienimage: 4 },
              logText: "gewährt bewusst teilweise Einblicke ins Privatleben - das öffentliche Bild wird spürbar positiver.",
              logKind: "positive",
            },
            failure: {
              morale: -3,
              traitDeltas: { medienimage: -2 },
              logText: "gewährt teilweise Einblicke ins Privatleben - die Grenze zwischen privat und öffentlich verschwimmt und sorgt für neue Angriffsfläche.",
              logKind: "negative",
            },
          },
        },
        {
          id: "rechtlich",
          label: "Rechtlich gegen die Berichterstattung vorgehen",
          detail: "Energie- und Zeitaufwand - kurzfristige Ruhe, aber ein angespanntes Medienverhältnis auf Dauer.",
          effects: {
            wealth: -10000,
            morale: 1,
            traitDeltas: { medienimage: -2 },
            logText: "geht rechtlich gegen die Berichterstattung über das Privatleben vor.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "beziehung_trennung_saison",
    category: "beziehung",
    minAge: 19,
    maxAge: 38,
    weight: 1,
    exclusiveGroup: "beziehung_crisis",
    condition: (p) => p.relationshipStatus === "in_beziehung",
    build: (p) => ({
      category: "beziehung",
      title: "Plötzliches Beziehungsende",
      description: `Die Beziehung mit ${p.partnerName ?? "deiner Partnerin/deinem Partner"} zerbricht mitten in der Saison.`,
      choices: [
        {
          id: "ablenkung",
          label: "Sofort wieder ins Training stürzen, Ablenkung suchen",
          detail: "Kurzfristig funktional - Leistungsschwankungen durch unverarbeitete Emotionen.",
          effects: {
            relationshipStatus: "single",
            partnerName: null,
            morale: -6,
            attributes: { mentalitaet: -1 },
            logText: "hat sich nach dem plötzlichen Beziehungsende sofort wieder ins Training gestürzt.",
            logKind: "negative",
          },
        },
        {
          id: "pause",
          label: "Bewusst Pause einlegen, mit Mentalcoach arbeiten",
          detail: "Zeitintensiv - langsamere, aber nachhaltigere Stabilisierung.",
          effects: {
            relationshipStatus: "single",
            partnerName: null,
            morale: -3,
            fitness: -3,
            traitDeltas: { disziplin: 1 },
            logText: "legt nach dem Beziehungsende bewusst eine Pause ein und arbeitet mit einem Mentalcoach an der Verarbeitung.",
            logKind: "info",
          },
        },
        {
          id: "rueckzug",
          label: "Sich ins Umfeld/Freunde zurückziehen, Verein wenig einbeziehen",
          detail: "Wenig Unterstützung von außen - unberechenbare Form, abhängig von der privaten Verarbeitung.",
          effects: {},
          followUpChance: {
            chance: 0.45,
            success: {
              relationshipStatus: "single",
              partnerName: null,
              morale: 1,
              logText: "hat sich nach dem Beziehungsende ins private Umfeld zurückgezogen - die Verarbeitung gelingt überraschend gut.",
              logKind: "info",
            },
            failure: {
              relationshipStatus: "single",
              partnerName: null,
              morale: -8,
              fitness: -2,
              logText: "hat sich nach dem Beziehungsende ins private Umfeld zurückgezogen, ohne den Verein einzubeziehen - die Form leidet spürbar.",
              logKind: "negative",
            },
          },
        },
      ],
    }),
  },
  {
    id: "beziehung_alte_freunde_belastung",
    category: "beziehung",
    minAge: 22,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.reputation > 35 && p.wealth > 50000,
    build: () => ({
      category: "beziehung",
      title: "Alte Freunde, neue Erwartungen",
      description: "Der Freundeskreis aus der Zeit vor dem Erfolg wird zunehmend zur Belastung - Neid und Bitten um Unterstützung häufen sich.",
      choices: [
        {
          id: "grenzen",
          label: "Klare Grenzen ziehen, Kontakt reduzieren",
          detail: "Schützt, aber schmerzhaft - mentale Entlastung, eventuell Einsamkeitsgefühl.",
          effects: {
            morale: 2,
            attributes: { mentalitaet: 1 },
            traitDeltas: { disziplin: 1 },
            logText: "hat klare Grenzen zum alten Freundeskreis gezogen und den Kontakt reduziert.",
            logKind: "info",
          },
        },
        {
          id: "weiterlaufen",
          label: "Alles wie gewohnt weiterlaufen lassen",
          detail: "Keine Konfrontation - schleichende Unruhe, Energieverlust durch ungelöste Konflikte.",
          effects: {
            morale: -4,
            wealth: -5000,
            logText: "lässt die Situation mit dem alten Freundeskreis einfach weiterlaufen - die schleichende Unruhe bleibt.",
            logKind: "negative",
          },
        },
        {
          id: "neuer_kreis",
          label: "Neuen, kleineren Vertrauenskreis aufbauen",
          detail: "Aktiver Umbau - stabileres Umfeld, aber eine Übergangsphase mit Unsicherheit.",
          effects: {
            morale: -1,
            clubRelation: 2,
            traitDeltas: { fuehrung: 1 },
            logText: "baut sich einen neuen, kleineren Vertrauenskreis aus Familie, Berater und wenigen engen Freunden auf.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "beziehung_angehoeriger_gesundheitsschreck",
    category: "beziehung",
    minAge: 20,
    maxAge: 40,
    weight: 1,
    condition: (p) => p.country !== p.homeCountryId,
    build: () => ({
      category: "beziehung",
      title: "Gesundheitlicher Schreck in der Heimat",
      description: "Ein Gesundheitsschreck bei einem Elternteil bzw. nahen Angehörigen in der Heimat erfordert plötzlich häufige Heimreisen.",
      choices: [
        {
          id: "kurztrips",
          label: "Regelmäßige Kurztrips in Kauf nehmen",
          detail: "Körperliche Zusatzbelastung - erhöhte Ermüdung, Trainingsrückstand.",
          effects: {
            fitness: -5,
            morale: 2,
            logText: "nimmt regelmäßige Kurztrips in die Heimat in Kauf, um bei der Familie zu sein.",
            logKind: "info",
          },
        },
        {
          id: "umzug_nahe",
          label: "Angehörige näher zu sich holen (Umzug in die Nähe)",
          detail: "Organisatorischer Aufwand - langfristige Entlastung, kurzfristige Umstellungsphase.",
          effects: {
            wealth: -20000,
            morale: -2,
            logText: "organisiert den Umzug der Angehörigen in die Nähe - aufwendig, aber langfristig entlastend.",
            logKind: "info",
          },
        },
        {
          id: "distanz",
          label: "Situation aus der Distanz per Telefon/Video begleiten",
          detail: "Weniger körperliche Belastung - mentale Belastung durch Schuldgefühle.",
          effects: {
            morale: -6,
            attributes: { mentalitaet: -1 },
            logText: "begleitet den Gesundheitsschreck der Angehörigen vor allem aus der Distanz - die Schuldgefühle nagen.",
            logKind: "negative",
          },
        },
      ],
    }),
  },
  {
    id: "beziehung_vorbild_heimat",
    category: "beziehung",
    minAge: 30,
    maxAge: 40,
    weight: 1,
    build: () => ({
      category: "beziehung",
      title: "Vorbild für die nächste Generation",
      description: "Jüngere Verwandte und Menschen aus deinem Heimatort sehen in dir zunehmend eine Vorbild- und Vaterfigur - der Erwartungsdruck wächst.",
      choices: [
        {
          id: "verantwortung",
          label: "Aktiv Verantwortung übernehmen (finanziell, mental)",
          detail: "Zeitaufwand - emotionale Erfüllung möglich, aber die Belastung kann auch größer werden als gedacht.",
          effects: {},
          followUpChance: {
            chance: 0.65,
            success: {
              wealth: -15000,
              morale: 6,
              traitDeltas: { fuehrung: 2 },
              logText: "übernimmt aktiv Verantwortung für jüngere Verwandte aus der Heimat - emotional erfüllend, die Balance gelingt.",
              logKind: "positive",
            },
            failure: {
              wealth: -15000,
              morale: -3,
              fitness: -2,
              logText: "übernimmt aktiv Verantwortung für jüngere Verwandte aus der Heimat - die Belastung im Alltag wird größer als gedacht.",
              logKind: "negative",
            },
          },
        },
        {
          id: "distanz",
          label: "Höflich Distanz halten, Erwartungen dämpfen",
          detail: "Schützt eigene Ressourcen - mögliche Kritik aus dem Umfeld, aber mentale Entlastung.",
          effects: {
            morale: 3,
            reputation: -1,
            logText: "hält höflich Distanz und dämpft die Erwartungen aus der Heimat.",
            logKind: "info",
          },
        },
        {
          id: "stiftung",
          label: "Stiftung/strukturierte Unterstützung statt individueller Hilfe",
          detail: "Einmaliger Organisationsaufwand - nachhaltige Lösung, positive Außenwirkung.",
          effects: {
            wealth: -40000,
            reputation: 5,
            traitDeltas: { medienimage: 3, fuehrung: 1 },
            logText: "baut eine strukturierte Stiftung auf, statt einzelne Bitten aus der Heimat individuell zu bedienen.",
            logKind: "positive",
          },
        },
      ],
    }),
  },

  // ---------------------------------------------------------------------
  // ENTDECKUNG, PRÄGENDE MOMENTE, ROLLENFINDUNG (Update 39)
  // ---------------------------------------------------------------------

  // --- Amateur-Entdeckung mit Sofort-Durchbruch (nur U19, sehr seltenes "Wunderkind") ---
  {
    id: "jugend_amateurentdeckung_1",
    category: "jugend",
    minAge: 15,
    maxAge: 17,
    weight: 0.6,
    // Extrem seltener alternativer Weg in den Profifußball: statt über die
    // reguläre Nachwuchsakademie (siehe `shouldOfferProDebut`/PRO_DEBUT_AGE) wird
    // ein noch unentdecktes Ausnahmetalent direkt aus dem Amateurbereich in einen
    // echten Profikader geholt - Jahre vor dem üblichen Profidebüt. Nur für echte
    // "Wunderkinder" (hohes Gesamtpotenzial) UND selbst dann nur mit kleiner
    // Zusatzchance, damit es die seltene Ausnahme bleibt, nicht die Regel.
    condition: (p) => {
      if (p.stage !== "jugend" || p.contract.squadRole !== "Ausbildungsspieler") return false;
      if (p.completedStorylines.includes("amateurentdeckung") || p.activeStorylines.some((t) => t.storylineId === "amateurentdeckung")) {
        return false;
      }
      const potAvg = (Object.values(p.potential) as number[]).reduce((a, b) => a + b, 0) / 6;
      if (potAvg < 82) return false;
      return Math.random() < 0.35;
    },
    build: (p) => ({
      category: "jugend",
      title: "Entdeckung im Amateurbereich",
      description: `Bei einem Kreisliga-Spiel deiner Freizeitmannschaft sitzt zufällig ein Scout auf der Tribüne - was er sieht, überzeugt ihn sofort. Statt über die Nachwuchsakademie bietet ${club(p)} dir direkt einen Platz im Profikader an. Kein Jugendweg, keine Bewährung in der U-Mannschaft - nur du und eine riesige Chance.`,
      choices: [
        {
          id: "annehmen",
          label: "Das Angebot sofort annehmen",
          effects: {
            earlyProDebut: true,
            reputation: 8,
            morale: 10,
            logText: "wird sensationell direkt aus dem Amateurbereich in den Profikader geholt - ohne den üblichen Weg über die Nachwuchsakademie.",
            logKind: "milestone",
            storyline: {
              storylineId: "amateurentdeckung",
              label: "Vom Bolzplatz in den Profikader",
              stage: 1,
              totalStages: 3,
              nextTemplateId: "jugend_amateurentdeckung_2",
              delaySeasons: 1,
            },
          },
        },
        {
          id: "ablehnen",
          label: "Ablehnen und den regulären Weg über die Jugend gehen",
          effects: {
            traitDeltas: { disziplin: 2 },
            logText: "lehnt das sensationelle Angebot ab und setzt lieber auf den geregelten Weg über die Jugendakademie.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "jugend_amateurentdeckung_2",
    category: "jugend",
    minAge: 15,
    maxAge: 19,
    weight: 0,
    storylineOnly: true,
    build: (p) => ({
      category: "jugend",
      title: "Zweifel an der Legitimität",
      description: `Trotz ordentlicher Leistungen wird ${p.name} in der Kabine und in den Medien immer wieder als "der Amateur, der nur Glück hatte" belächelt - selbst gute Auftritte werden klein geredet. Wie gehst du damit um?`,
      choices: [
        {
          id: "medien",
          label: "Sich der Kritik offen in Interviews stellen",
          effects: {},
          followUpChance: {
            chance: 0.55,
            success: {
              traitDeltas: { medienimage: 6, fuehrung: 2 },
              reputation: 6,
              logText: "stellt sich der Kritik offen in Interviews und dreht die öffentliche Wahrnehmung spürbar zu seinen Gunsten.",
              logKind: "positive",
              storyline: { storylineId: "amateurentdeckung", label: "Vom Bolzplatz in den Profikader", stage: 2, totalStages: 3, nextTemplateId: "jugend_amateurentdeckung_3", delaySeasons: 1, data: { outcome: "anerkannt" } },
            },
            failure: {
              morale: -5,
              traitDeltas: { medienimage: -2 },
              logText: "gerät mit offenen Interviews zur eigenen Legitimität eher noch tiefer in die Debatte hinein.",
              logKind: "negative",
              storyline: { storylineId: "amateurentdeckung", label: "Vom Bolzplatz in den Profikader", stage: 2, totalStages: 3, nextTemplateId: "jugend_amateurentdeckung_3", delaySeasons: 1, data: { outcome: "zweifel" } },
            },
          },
        },
        {
          id: "leistung",
          label: "Nur mit Leistung auf dem Platz antworten",
          effects: {
            traitDeltas: { arbeitsmoral: 4, disziplin: 2 },
            attributes: { mentalitaet: 1 },
            logText: "reagiert auf die Zweifel bewusst nicht öffentlich, sondern lässt ausschließlich Leistung auf dem Platz sprechen.",
            logKind: "positive",
            storyline: { storylineId: "amateurentdeckung", label: "Vom Bolzplatz in den Profikader", stage: 2, totalStages: 3, nextTemplateId: "jugend_amateurentdeckung_3", delaySeasons: 1, data: { outcome: "leistung" } },
          },
        },
      ],
    }),
  },
  {
    id: "jugend_amateurentdeckung_3",
    category: "jugend",
    minAge: 16,
    maxAge: 20,
    weight: 0,
    storylineOnly: true,
    build: (p, ctx) => {
      const outcome = ctx.storyData?.outcome ?? "leistung";
      const text =
        outcome === "anerkannt"
          ? `Die Zweifel an ${p.name}s Weg sind endgültig verstummt - inzwischen gilt die Entdeckungsgeschichte selbst als Teil der eigenen Legende.`
          : outcome === "zweifel"
          ? `Ganz verstummt sind die Zweifel nie - aber ${p.name} hat gelernt, mit der ewigen "Amateur"-Erzählung zu leben, statt sie zu bekämpfen.`
          : `Ohne ein einziges großes Interview hat ${p.name} die Zweifel schlicht totgespielt - Leistung statt Worte war die beste Antwort.`;
      return {
        category: "jugend",
        title: "Angekommen im Profifußball",
        description: text,
        choices: [
          {
            id: "ok",
            label: "Weitermachen",
            effects: {
              reputation: outcome === "zweifel" ? 2 : 6,
              clubRelation: 4,
              logText:
                outcome === "anerkannt"
                  ? "hat sich endgültig als vollwertiger Profi etabliert - die Amateur-Herkunft ist heute nur noch eine gute Geschichte."
                  : outcome === "zweifel"
                  ? "lebt weiter mit gelegentlichen Seitenhieben auf die ungewöhnliche Herkunft, lässt sich davon aber nicht mehr beirren."
                  : "hat die Zweifel an der eigenen Legitimität einfach durch nackte Leistung zum Schweigen gebracht.",
              logKind: "positive",
              storyline: { storylineId: "amateurentdeckung", label: "Vom Bolzplatz in den Profikader", stage: 3, totalStages: 3 },
            },
          },
        ],
      };
    },
  },

  // --- Entscheidendes Tor/Fehler in einem historischen Spiel (karriereprägend, 1-5%) ---
  {
    id: "historisches_spiel_1",
    category: "meilenstein",
    minAge: 20,
    maxAge: 37,
    weight: 3,
    unique: true,
    // Bewusst nur ein winziger Wurf pro Saison (statt hoher Weight), damit die
    // kumulierte Wahrscheinlichkeit über eine ganze Karriere im gewünschten
    // 1-5%-Bereich bleibt, statt bei ~18 möglichen Saisons fast garantiert
    // mindestens einmal zu feuern.
    condition: (p) => p.contract.squadRole !== "Ausbildungsspieler" && Math.random() < 0.0025,
    // Torhüter: statt "landet der Ball bei dir und du triffst" (unrealistisch für
    // die Position) die torwartgerechte Variante - eine letzte Parade hält das
    // Spiel offen bzw. wird zum entscheidenden Gegentor.
    build: (p) =>
      p.position === "TW"
        ? {
            category: "meilenstein",
            title: "Das Spiel, das alles verändern könnte",
            description: `Relegation, Pokalfinale oder die letzte entscheidende Aktion einer engen Meisterschaft - ${club(p)} steht vor dem größten Spiel der Saison, und in der Nachspielzeit kommt der Gegner alleine auf dich zu. Übernimmst du die Verantwortung?`,
            choices: [
              {
                id: "verantwortung",
                label: "Verantwortung übernehmen",
                effects: {},
                followUpChance: {
                  chance: 0.5,
                  success: {
                    reputation: 20,
                    morale: 15,
                    clubRelation: 10,
                    traitDeltas: { fuehrung: 6 },
                    attributes: { mentalitaet: 2 },
                    definingMoment: {
                      positive: true,
                      text: "die entscheidende Parade im größten Spiel der Karriere, die bis heute in jeder Rückschau gezeigt wird.",
                    },
                    logText: "hält die entscheidende Parade im größten Spiel der Karriere - ein Moment für immer verknüpft mit seinem/ihrem Namen.",
                    logKind: "milestone",
                  },
                  failure: {
                    morale: -12,
                    clubRelation: -6,
                    reputation: -4,
                    definingMoment: {
                      positive: false,
                      text: "das vergebene entscheidende Gegentor im größten Spiel der Karriere, das Kritiker bis heute nicht vergessen.",
                    },
                    logText: "lässt das entscheidende Gegentor im größten Spiel der Karriere zu - ein Fehler, der für immer mit seinem/ihrem Namen verknüpft bleibt.",
                    logKind: "negative",
                  },
                },
              },
              {
                id: "zurueckhalten",
                label: "Auf die Abwehr vor dir vertrauen",
                effects: {
                  clubRelation: 2,
                  logText: "überlässt im entscheidenden Moment lieber der Abwehr die Klärung.",
                  logKind: "info",
                },
              },
            ],
          }
        : {
            category: "meilenstein",
            title: "Das Spiel, das alles verändern könnte",
            description: `Relegation, Pokalfinale oder die letzte entscheidende Aktion einer engen Meisterschaft - ${club(p)} steht vor dem größten Spiel der Saison, und in der Schlussphase landet der Ball ausgerechnet bei dir. Übernimmst du die Verantwortung?`,
            choices: [
              {
                id: "verantwortung",
                label: "Verantwortung übernehmen",
                effects: {},
                followUpChance: {
                  chance: 0.5,
                  success: {
                    reputation: 20,
                    morale: 15,
                    clubRelation: 10,
                    traitDeltas: { fuehrung: 6 },
                    attributes: { mentalitaet: 2 },
                    definingMoment: {
                      positive: true,
                      text: "der entscheidende Treffer im größten Spiel der Karriere, der bis heute in jeder Rückschau gezeigt wird.",
                    },
                    logText: "erzielt den entscheidenden Treffer im größten Spiel der Karriere - ein Moment für immer verknüpft mit seinem/ihrem Namen.",
                    logKind: "milestone",
                  },
                  failure: {
                    morale: -12,
                    clubRelation: -6,
                    reputation: -4,
                    definingMoment: {
                      positive: false,
                      text: "der vergebene entscheidende Moment im größten Spiel der Karriere, den Kritiker bis heute nicht vergessen.",
                    },
                    logText: "vergibt den entscheidenden Moment im größten Spiel der Karriere - ein Fehler, der für immer mit seinem/ihrem Namen verknüpft bleibt.",
                    logKind: "negative",
                  },
                },
              },
              {
                id: "zurueckhalten",
                label: "Sich zurückhalten, einem Mitspieler überlassen",
                effects: {
                  clubRelation: 2,
                  logText: "überlässt im entscheidenden Moment lieber einem Mitspieler die Verantwortung.",
                  logKind: "info",
                },
              },
            ],
          },
  },

  // --- Edeljoker statt Stammspieler: eine dauerhafte Trainer-Präferenz ---
  {
    id: "edeljoker_1",
    category: "taktik",
    minAge: 22,
    maxAge: 34,
    weight: 0.8,
    unique: true,
    // Kein klassischer Formverlust - der Trainer nutzt den Spieler bewusst als
    // Einwechselspieler, obwohl das Leistungsniveau eigentlich für einen
    // Stammplatz reichen würde (daher die Bedingung an Rotation/Stammspieler-Nähe,
    // nicht an schwache Werte). Torhüter ausgeschlossen: ein Torwart wird nie als
    // "Einwechselspieler" gebracht (Torhüterwechsel während des laufenden Spiels
    // sind praktisch nur bei Verletzung/Roter Karte üblich, keine taktische
    // Trainer-Präferenz) - passt außerdem nicht zur binären Nummer-1/2-Kaderrolle
    // von Torhütern ohne "Rotation"-Zwischenstufe (siehe `squadRoleForOverall`).
    condition: (p) =>
      p.position !== "TW" &&
      !p.edeljokerLocked &&
      (p.contract.squadRole === "Rotation" || p.contract.squadRole === "Stammspieler") &&
      p.consecutiveBenchSeasons === 0 &&
      // Zusätzlicher Wurf, damit es über eine ganze Karriere bei ~5-10% Vorkommen
      // bleibt statt bei jeder passenden Saison eine ernsthafte Chance zu haben.
      Math.random() < 0.3,
    build: (p) => ({
      category: "taktik",
      title: "Der Trainer hat eine klare Meinung von dir",
      description: `${club(p)}s Trainer schwört auf dich - aber anders als erhofft: nicht als gesetzten Stammspieler, sondern als gezielten Einwechselspieler, der Spiele in der Schlussphase entscheidet. "Deine Wirkung von der Bank ist Gold wert", sagt er offen. Wie gehst du damit um?`,
      choices: [
        {
          id: "akzeptieren",
          label: "Die Rolle pragmatisch akzeptieren",
          effects: {
            edeljokerLocked: true,
            clubRelation: 8,
            morale: 4,
            traitDeltas: { arbeitsmoral: 2 },
            logText: "akzeptiert pragmatisch die Rolle als gezielter Einwechselspieler - der Trainer setzt fortan konsequent auf dieses Muster.",
            logKind: "positive",
          },
        },
        {
          id: "widersprechen",
          label: "Öffentlich einen Stammplatz einfordern",
          effects: {
            edeljokerLocked: true,
            clubRelation: -6,
            morale: -3,
            reputation: 2,
            logText: "fordert öffentlich einen Stammplatz ein - der Trainer bleibt trotzdem bei seinem Muster, das Verhältnis kühlt spürbar ab.",
            logKind: "negative",
          },
        },
      ],
    }),
  },

  // --- Sommermärchen-Delle: Formeinbruch nach großem Erfolg ---
  {
    id: "sommermaerchen_delle_1",
    category: "taktik",
    minAge: 19,
    maxAge: 37,
    weight: 1.5,
    condition: (p) => {
      const last = p.seasonHistory[p.seasonHistory.length - 1];
      if (!last) return false;
      const bigSuccess = last.trophies.length > 0 && last.avgRating >= 7.2;
      return bigSuccess && p.formSlumpSeasons === 0;
    },
    build: (p) => {
      const last = p.seasonHistory[p.seasonHistory.length - 1];
      return {
        category: "taktik",
        title: "Die Sommermärchen-Delle",
        description: `Nach dem Höhepunkt der letzten Saison (${last?.trophies.join(", ") ?? "Titelgewinn"}) will bei ${club(p)} einfach nicht mehr dieselbe Energie aufkommen wie vorher - die Erwartungen bleiben riesig, die eigene Motivation fühlt sich seltsam flach an.`,
        choices: [
          {
            id: "durchziehen",
            label: "Einfach weitermachen wie bisher",
            effects: {
              formSlumpSeasons: 1,
              morale: -3,
              logText: "kämpft nach dem großen Erfolg der Vorsaison mit einer spürbaren Sättigungs-/Motivationsdelle.",
              logKind: "negative",
            },
          },
          {
            id: "auszeit",
            label: "Bewusst eine mentale Auszeit einlegen",
            effects: {
              formSlumpSeasons: 1,
              fitness: 4,
              traitDeltas: { arbeitsmoral: 1 },
              logText: "legt nach dem Erfolgshöhepunkt bewusst eine mentale Auszeit ein, um die Delle möglichst kurz zu halten.",
              logKind: "info",
            },
          },
        ],
      };
    },
  },

  // ---------------------------------------------------------------------
  // EUROPAPOKAL (Champions/Europa League) - siehe europeanCup.ts. Die
  // Qualifikations-Events (moderate Wahrscheinlichkeit) feuern für jede Saison,
  // in der der Verein sich sportlich qualifiziert hat (unabhängig vom späteren
  // Turnierausgang) - die Titel-Events dagegen NUR nach einem tatsächlichen
  // Champion-Ausgang der VORSAISON.
  // ---------------------------------------------------------------------

  {
    id: "europapokal_grosse_buehne_stamm",
    category: "taktik",
    minAge: 18,
    maxAge: 39,
    weight: 2.8,
    condition: (p) => {
      const euro = lastEuropeanCup(p);
      return !!euro && p.contract.squadRole === "Stammspieler" && Math.random() < 0.4;
    },
    build: (p) => {
      const euro = lastEuropeanCup(p)!;
      return {
        category: "taktik",
        title: "Große Bühne, große Chance",
        description: `${club(p)} hat sich für die ${europeanCompetitionName(euro.competition)} qualifiziert - als gesetzter Stammspieler steigt das Interesse an dir spürbar.`,
        choices: [
          {
            id: "annehmen",
            label: "Die Bühne annehmen",
            effects: {
              morale: 6,
              reputation: 6,
              logText: `spürt vor der ${europeanCompetitionName(euro.competition)}-Saison von ${club(p)} deutlich gestiegenes Interesse.`,
              logKind: "positive",
            },
          },
        ],
      };
    },
  },
  {
    id: "europapokal_grosse_buehne_ersatz",
    category: "taktik",
    minAge: 18,
    maxAge: 39,
    weight: 2.8,
    condition: (p) => {
      const euro = lastEuropeanCup(p);
      return (
        !!euro &&
        (p.contract.squadRole === "Rotation" || p.contract.squadRole === "Ergänzungsspieler" || p.contract.squadRole === "Ersatzbank") &&
        Math.random() < 0.4
      );
    },
    build: (p) => {
      const euro = lastEuropeanCup(p)!;
      return {
        category: "taktik",
        title: "Große Bühne, große Chance",
        description: `${club(p)} hat sich für die ${europeanCompetitionName(euro.competition)} qualifiziert - das Interesse an dir bleibt allerdings verhalten, weil du kein gesetzter Stammspieler bist.`,
        choices: [
          {
            id: "hinnehmen",
            label: "Zur Kenntnis nehmen",
            effects: {
              morale: -4,
              reputation: 3,
              logText: `bleibt vor der ${europeanCompetitionName(euro.competition)}-Saison von ${club(p)} trotz gestiegener Aufmerksamkeit im Schatten der Stammelf.`,
              logKind: "info",
            },
          },
        ],
      };
    },
  },
  {
    id: "europapokal_erwartungsdruck",
    category: "taktik",
    minAge: 18,
    maxAge: 39,
    weight: 2.6,
    condition: (p) => !!lastEuropeanCup(p) && Math.random() < 0.35,
    build: (p) => ({
      category: "taktik",
      title: "Erhöhter Erwartungsdruck",
      description: `Weil ${club(p)} international spielt, erwarten Trainer und Presse in dieser Saison spürbar mehr als in einer normalen Ligawoche.`,
      choices: [
        {
          id: "hinnehmen",
          label: "Den Druck hinnehmen",
          effects: {
            morale: -4,
            fitness: -4,
            logText: "spürt durch die zusätzliche internationale Belastung deutlich erhöhten Erwartungsdruck.",
            logKind: "negative",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_scout_aufmerksamkeit",
    category: "medien",
    minAge: 18,
    maxAge: 37,
    weight: 2.4,
    condition: (p) => !!lastEuropeanCup(p) && Math.random() < 0.35,
    build: (p) => ({
      category: "medien",
      title: "Scout-Aufmerksamkeit steigt",
      description: `Aufgrund deiner internationalen Präsenz mit ${club(p)} beobachten große Vereine deine Auftritte genauer als sonst.`,
      choices: [
        {
          id: "annehmen",
          label: "Zur Kenntnis nehmen",
          effects: {
            reputation: 6,
            logText: "gerät durch die internationale Bühne stärker ins Blickfeld großer Scouting-Abteilungen.",
            logKind: "positive",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_rotationsrisiko",
    category: "taktik",
    minAge: 18,
    maxAge: 37,
    weight: 2.6,
    condition: (p) => {
      const euro = lastEuropeanCup(p);
      return !!euro && p.contract.squadRole !== "Ausbildungsspieler" && Math.random() < 0.4;
    },
    build: (p) => ({
      category: "taktik",
      title: "Rotationsrisiko",
      description: `Der Trainer von ${club(p)} stellt dich in den intensiven englischen Wochen zwischen Liga und Europapokal vor die Wahl.`,
      choices: [
        {
          id: "rotation",
          label: "Rotation akzeptieren",
          effects: {
            fitness: 5,
            morale: -3,
            logText: "akzeptiert in den intensiven internationalen Wochen bereitwillig Rotation.",
            logKind: "info",
          },
        },
        {
          id: "einsatzzeit",
          label: "Auf Einsatzzeit pochen",
          effects: {
            fitness: -5,
            clubRelation: -4,
            traitDeltas: { arbeitsmoral: 3 },
            logText: "pocht in den intensiven internationalen Wochen konsequent auf seine/ihre Einsatzzeit.",
            logKind: "info",
          },
        },
      ],
    }),
  },

  // --- Titelgewinn: Boost (nur nach einem tatsächlichen Champion-Ausgang) ---
  {
    id: "europapokal_karrierehoehepunkt_stamm",
    category: "meilenstein",
    minAge: 18,
    maxAge: 40,
    weight: 30,
    condition: (p) => {
      const euro = lastEuropeanCup(p);
      return !!euro && euro.champion && p.contract.squadRole === "Stammspieler";
    },
    build: (p) => {
      const euro = lastEuropeanCup(p)!;
      return {
        category: "meilenstein",
        title: "Karrierehöhepunkt",
        description: `Der Gewinn der ${europeanCompetitionName(euro.competition)} mit ${club(p)} gilt als einer der größten Erfolge deiner bisherigen Laufbahn - als gesetzter Stammspieler hast du ihn hautnah miterlebt.`,
        choices: [
          {
            id: "geniessen",
            label: "Den Moment genießen",
            effects: {
              reputation: 14,
              attributes: { mentalitaet: 2 },
              logText: `feiert den Gewinn der ${europeanCompetitionName(euro.competition)} als echten Karrierehöhepunkt.`,
              logKind: "milestone",
            },
          },
        ],
      };
    },
  },
  {
    id: "europapokal_karrierehoehepunkt_ersatz",
    category: "meilenstein",
    minAge: 18,
    maxAge: 40,
    weight: 30,
    condition: (p) => {
      const euro = lastEuropeanCup(p);
      return !!euro && euro.champion && p.contract.squadRole !== "Stammspieler";
    },
    build: (p) => {
      const euro = lastEuropeanCup(p)!;
      return {
        category: "meilenstein",
        title: "Karrierehöhepunkt",
        description: `Der Gewinn der ${europeanCompetitionName(euro.competition)} mit ${club(p)} gilt als einer der größten Erfolge deiner bisherigen Laufbahn - aber weil du kaum Spielzeit hattest, fällt es dir schwer, den Ruhm ganz zu genießen.`,
        choices: [
          {
            id: "geniessen",
            label: "Trotzdem mitfeiern",
            effects: {
              reputation: 10,
              morale: -3,
              logText: `feiert den Gewinn der ${europeanCompetitionName(euro.competition)} - mit gemischten Gefühlen wegen der eigenen geringen Spielzeit.`,
              logKind: "milestone",
            },
          },
        ],
      };
    },
  },
  {
    id: "europapokal_selbstvertrauen",
    category: "taktik",
    minAge: 18,
    maxAge: 40,
    weight: 10,
    condition: (p) => {
      const euro = lastEuropeanCup(p);
      return !!euro && euro.champion && Math.random() < 0.7;
    },
    build: (p) => ({
      category: "taktik",
      title: "Gestärktes Selbstvertrauen",
      description: `Der internationale Titel gibt dir spürbaren Auftrieb für die kommende Saison bei ${club(p)}.`,
      choices: [
        {
          id: "annehmen",
          label: "Mit Rückenwind weitermachen",
          effects: {
            morale: 8,
            logText: "geht mit spürbar gestärktem Selbstvertrauen in die neue Saison.",
            logKind: "positive",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_grosse_vereine_aufmerksam",
    category: "transfer",
    minAge: 19,
    maxAge: 36,
    weight: 9,
    condition: (p) => {
      const euro = lastEuropeanCup(p);
      return !!euro && euro.champion && Math.random() < 0.65;
    },
    build: (p) => {
      const euro = lastEuropeanCup(p)!;
      return {
        category: "transfer",
        title: "Große Vereine werden aufmerksam",
        description: `Nach dem Gewinn der ${europeanCompetitionName(euro.competition)} erreichen erste Anfragen von Spitzenklubs dich oder deinen Berater.`,
        choices: [
          {
            id: "anhoeren",
            label: "Angebote anhören",
            // BEWUSST kein wantsTransfer:true - das reine Anhören über den Berater ist
            // (anders als z.B. "Wechsel fordern") kein aktiv-öffentlicher Wechselwunsch,
            // sondern diskretes Sondieren. `wantsTransfer` ist im gesamten Transfersystem
            // ein starkes, eindeutiges Signal (garantiertes Angebot im nächsten Fenster
            // OHNE Cooldown, siehe `shouldTriggerTransferOpportunity`) und färbt zudem
            // die Framing-Texte künftiger Angebote als "dein öffentlich geäußerter
            // Wechselwunsch" - das wäre hier irreführend (Bugreport: Spieler bekam diesen
            // Text, ohne je einen Wechsel gefordert zu haben). Die erhöhte Bekanntheit
            // reicht bereits, um über den bestehenden "gute Form"-Pfad organisch (und
            // korrekt als solches beschriftet) mehr Angebote nach sich zu ziehen.
            effects: {
              clubRelation: -4,
              reputation: 5,
              logText: "lässt sich nach dem internationalen Titel erste Anfragen von Spitzenklubs durch den Berater vorlegen.",
              logKind: "info",
            },
          },
          {
            id: "loyalitaet",
            label: "Loyalität demonstrieren",
            effects: {
              clubRelation: 6,
              traitDeltas: { medienimage: 3 },
              logText: "weist die ersten Anfragen von Spitzenklubs zurück und demonstriert Loyalität zum Titel-Verein.",
              logKind: "positive",
            },
          },
        ],
      };
    },
  },

  // --- Titelgewinn: "Flausen im Kopf" - exklusiv, nur EINES dieser vier Events
  // kann in derselben Saison gezogen werden (siehe `exclusiveGroup` in
  // `pickSeasonTemplateIds`). "Bodenständig geblieben" ist durch das höhere
  // Gewicht das mit Abstand häufigste Ergebnis.
  {
    id: "europapokal_flausen_bodenstaendig",
    category: "taktik",
    minAge: 18,
    maxAge: 40,
    weight: 3,
    exclusiveGroup: "europapokal_flausen",
    condition: (p) => !!lastEuropeanCup(p)?.champion,
    build: (p) => ({
      category: "taktik",
      title: "Bodenständig geblieben",
      description: `Der Titel ändert nichts an deiner Einstellung bei ${club(p)} - er ist ein Ansporn, in der neuen Saison alles zu geben.`,
      choices: [
        {
          id: "weiter",
          label: "Bodenständig bleiben",
          effects: {
            logText: "bleibt nach dem internationalen Titel bemerkenswert bodenständig.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_flausen_wechselgedanken",
    category: "transfer",
    minAge: 19,
    maxAge: 38,
    weight: 1,
    exclusiveGroup: "europapokal_flausen",
    condition: (p) => !!lastEuropeanCup(p)?.champion,
    build: (p) => ({
      category: "transfer",
      title: "Wechselgedanken",
      description: `Nach dem internationalen Titel fragst du dich, ob bei ${club(p)} noch mehr für dich zu erreichen ist.`,
      choices: [
        {
          id: "fordern",
          label: "Wechsel fordern",
          effects: {
            wantsTransfer: true,
            clubRelation: -6,
            logText: "fordert nach dem internationalen Titel offen einen Wechsel.",
            logKind: "negative",
          },
        },
        {
          id: "bleiben",
          label: "Beim Verein bleiben",
          effects: {
            morale: -3,
            clubRelation: 5,
            logText: "verwirft die Wechselgedanken nach dem internationalen Titel und bleibt.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_flausen_ehrgeiz",
    category: "taktik",
    minAge: 18,
    maxAge: 40,
    weight: 1,
    exclusiveGroup: "europapokal_flausen",
    condition: (p) => !!lastEuropeanCup(p)?.champion,
    build: (p) => ({
      category: "taktik",
      title: "Nachlassender Ehrgeiz",
      description: `Du hast das Gefühl, mit dem internationalen Titel bei ${club(p)} alles erreicht zu haben. Wieso dich noch quälen?`,
      choices: [
        {
          id: "hinnehmen",
          label: "Den Gedanken zulassen",
          effects: {
            traitDeltas: { arbeitsmoral: -5 },
            logText: "lässt nach dem internationalen Titel spürbar im Ehrgeiz nach.",
            logKind: "negative",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_flausen_gehalt",
    category: "vertrag",
    minAge: 19,
    maxAge: 38,
    weight: 1,
    exclusiveGroup: "europapokal_flausen",
    condition: (p) => !!lastEuropeanCup(p)?.champion && p.contract.yearsLeft >= 1,
    build: (p) => ({
      category: "vertrag",
      title: "Gehaltsforderungen",
      description: `Als frischgebackener internationaler Titelträger fühlst du dich bei ${club(p)} nicht mehr angemessen bezahlt.`,
      choices: [
        {
          id: "fordern",
          label: "Erhöhung fordern",
          effects: {
            wageMultiplier: 1.15,
            clubRelation: -3,
            logText: "fordert nach dem internationalen Titel selbstbewusst eine Gehaltserhöhung.",
            logKind: "positive",
          },
        },
        {
          id: "schweigen",
          label: "Schweigen",
          effects: {
            morale: -4,
            logText: "schluckt nach dem internationalen Titel den Ärger über das ausbleibende bessere Gehalt herunter.",
            logKind: "negative",
          },
        },
      ],
    }),
  },

  // --- Weitere Europapokal-Events ---
  {
    id: "europapokal_rolle_trotz_wenig_einsatz",
    category: "taktik",
    minAge: 19,
    maxAge: 38,
    // War weight:1 mit zusätzlichem 50%-Würfel - die Vorbedingung (Titel als
    // Rotationsspieler) ist schon selten genug, das Gate hat es zusätzlich fast
    // unmöglich gemacht. Gate entfernt, Gewicht leicht erhöht.
    weight: 1.5,
    condition: (p) => {
      const euro = lastEuropeanCup(p);
      return !!euro && euro.champion && p.contract.squadRole !== "Stammspieler";
    },
    build: (p) => ({
      category: "taktik",
      title: "Rolle im Erfolg trotz wenig Einsatzzeit",
      description: `Auch als Rotationsspieler bist du Teil des internationalen Titels von ${club(p)} - aber was folgt daraus?`,
      choices: [
        {
          id: "kaempfen",
          label: "Um mehr Einsatzzeit kämpfen",
          effects: {
            traitDeltas: { arbeitsmoral: 3 },
            clubRelation: 4,
            logText: "kämpft nach dem Titelgewinn trotz geringer Einsatzzeit entschlossen um mehr Spielanteile.",
            logKind: "positive",
          },
        },
        {
          id: "absprung",
          label: "Titel als Absprungpunkt nutzen",
          effects: {
            wantsTransfer: true,
            logText: "will den internationalen Titel als Absprungpunkt für mehr Spielzeit anderswo nutzen.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_kultstatus",
    category: "meilenstein",
    minAge: 18,
    maxAge: 39,
    weight: 0.6,
    condition: (p) => !!lastEuropeanCup(p) && Math.random() < 0.12,
    build: (p) => ({
      category: "meilenstein",
      title: "Kult-Status durch entscheidende Aktion",
      description: `Du hast im letzten Drittel eines internationalen Spiels von ${club(p)} entscheidend zum Siegtor beigetragen - herzlichen Glückwunsch, du gehörst immer mehr zu den Vereinslegenden.`,
      choices: [
        {
          id: "annehmen",
          label: "Den Moment feiern",
          effects: {
            reputation: 9,
            morale: 7,
            logText: "trägt international entscheidend zu einem Siegtor bei und nähert sich dem Kult-Status bei seinem/ihrem Verein.",
            logKind: "positive",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_nationaltrainer_aufmerksam",
    category: "nationalmannschaft",
    minAge: 18,
    maxAge: 35,
    weight: 2.2,
    condition: (p) => !!lastEuropeanCup(p) && Math.random() < 0.3,
    build: () => ({
      category: "nationalmannschaft",
      title: "Nationaltrainer wird aufmerksam",
      description: "Deine internationalen Auftritte bleiben auch beim Nationaltrainer nicht unbemerkt.",
      choices: [
        {
          id: "annehmen",
          label: "Zur Kenntnis nehmen",
          effects: {
            reputation: 5,
            logText: "gerät durch starke internationale Auftritte stärker ins Blickfeld des Nationaltrainers.",
            logKind: "positive",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_sponsoren_ansturm",
    category: "sponsoring",
    minAge: 19,
    maxAge: 38,
    weight: 2.2,
    condition: (p) => !!lastEuropeanCup(p) && Math.random() < 0.35,
    build: (p) => ({
      category: "sponsoring",
      title: "Sponsoren-Anfragen häufen sich",
      description: `Durch die internationale Bühne mit ${club(p)} melden sich Werbepartner, die vorher nie angefragt haben.`,
      choices: [
        {
          id: "annehmen",
          label: "Deal annehmen",
          effects: {
            wealth: 35000,
            fitness: -2,
            logText: "nimmt nach der internationalen Bühne ein neues Sponsoren-Angebot an.",
            logKind: "positive",
          },
        },
        {
          id: "ablehnen",
          label: "Ablehnen",
          effects: {
            logText: "lehnt die neuen Sponsoren-Anfragen nach der internationalen Bühne ab.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    id: "europapokal_medien_doku",
    category: "medien",
    minAge: 19,
    maxAge: 40,
    // War weight:1 mit zusätzlichem 40%-Würfel in der condition - die Vorbedingung
    // (Europapokal-Titel in der jüngsten Saison) ist schon selten genug, das zusätzliche
    // Gate hat das Event in der Praxis fast nie durchgelassen. Gate entfernt, Gewicht erhöht.
    weight: 2,
    condition: (p) => !!lastEuropeanCup(p)?.champion,
    build: (p) => {
      const euro = lastEuropeanCup(p)!;
      return {
        category: "medien",
        title: "Medien-Doku-Anfrage",
        description: `Ein Sender will dich für ein Porträt über den Gewinn der ${europeanCompetitionName(euro.competition)} mit ${club(p)} gewinnen.`,
        choices: [
          {
            id: "mitmachen",
            label: "Mitmachen",
            effects: {
              traitDeltas: { medienimage: 5 },
              reputation: 6,
              fitness: -2,
              wealth: 15000,
              logText: "wirkt bei einer Medien-Doku über den internationalen Titel mit.",
              logKind: "positive",
            },
          },
          {
            id: "ablehnen",
            label: "Ablehnen",
            effects: {
              reputation: -3,
              traitDeltas: { medienimage: -3 },
              logText: "lehnt die Medien-Doku-Anfrage über den internationalen Titel ab.",
              logKind: "negative",
            },
          },
        ],
      };
    },
  },

  // ---------------------------------------------------------------------
  // NATIONALER POKAL (siehe nationalCup.ts): das eigentliche Feier-Event wird
  // NICHT hier als Template definiert, sondern direkt als `GameEvent`-Literal in
  // `buildNationalCupWinEvent` (careerEngine.ts) gebaut - siehe dort für den
  // Grund (`NATIONAL_CUP_WIN_TEMPLATE_ID` oben), warum es überhaupt erzwungen
  // statt über die normale Gewichtungs-Auswahl gezogen wird.
  // ---------------------------------------------------------------------
  // "HEIMKEHRER" (siehe HOMECOMING_TEMPLATE_ID/`detectClubHomecoming` in types.ts):
  // eine echte Rückkehr zu einem Verein, an dem der Spieler in frühen Jahren
  // (18-25) schon einmal mehr als 2 Saisons gespielt hat. Wie beim Außenseiter-
  // Pokalsieg oben `storylineOnly: true` - App.tsx `handleChoice` erzwingt dieses
  // Event direkt als nächstes Ereignis nach dem Wechsel-Feedback, wenn
  // `applyClubOfferChoice` eine Heimkehr erkannt hat. Die eigentliche "Jahre
  // später"-Zahl wird hier über dieselbe `detectClubHomecoming`-Funktion wie bei
  // der Erkennung selbst neu berechnet (liest nur `seasonHistory`, das sich seit
  // dem Wechsel noch nicht verändert hat) statt sie über einen Seitenkanal zu
  // transportieren.
  // ---------------------------------------------------------------------
  {
    id: HOMECOMING_TEMPLATE_ID,
    category: "meilenstein",
    minAge: 25,
    maxAge: 40,
    weight: 0,
    storylineOnly: true,
    build: (p) => {
      // `currentClubStrength` explizit mitgeben: `p.club` ist zum Aufrufzeitpunkt in
      // App.tsx/applyClubOfferChoice bereits der NEUE (alte) Verein, hier beim Bauen
      // des Events also exakt das, was wir wollen (siehe `detectClubHomecoming`-
      // Doc-Kommentar in types.ts).
      const info = detectClubHomecoming(p, p.club.clubId, p.club.strength);
      const years = info?.yearsAway ?? 0;
      const yearsLabel = years === 1 ? "ein Jahr später" : `${years} Jahre später`;
      // Beschreibung nach narrativer Stärke gestaffelt (ADD-ON-Vorgabe Abschnitt 3:
      // "nicht jede Rückkehr muss automatisch ein Karrierehighlight sein") - `normal`
      // bleibt schlicht, `sehr stark` bekommt die volle "damals/heute"-Erzählung mit
      // echten Zahlen aus `HomecomingInfo`.
      const description = !info
        ? `${club(p)} - ${p.name} ist nach einiger Zeit wieder zurück. Wie gehst du mit der Rückkehr um?`
        : info.strengthTier === "normal"
        ? `${club(p)} - ${p.name} kehrt ${yearsLabel} zurück, nachdem die Wege sich für eine Weile getrennt hatten. Wie gehst du mit der Rückkehr um?`
        : info.strengthTier === "stark"
        ? `${club(p)} - vertraute Straßen, ein vertrautes Stadion. Zwischen ${info.firstSpellStartAge} und ${info.firstSpellEndAge} hat ${p.name} hier ${info.firstSpellSeasons} Saisons verbracht, jetzt - ${yearsLabel} - ist die Rückkehr geschafft. Wie gehst du damit um?`
        : `${club(p)} - Gesichter, die sich noch an die frühen Jahre erinnern. Zwischen ${info.firstSpellStartAge} und ${info.firstSpellEndAge} hat ${p.name} hier ${info.firstSpellSeasons} prägende Saisons verbracht. Jetzt, ${yearsLabel} und als deutlich erfahrenerer Spieler, ist ${p.name} wieder da, wo alles einmal begann. Wie gehst du mit diesem Moment um?`;
      return {
        category: "meilenstein",
        title: `Heimkehr, ${yearsLabel}`,
        description,
        choices: [
          {
            id: "genuss",
            label: "Die Vertrautheit genießen und offen auf alte Bekannte zugehen",
            detail: "Warmer Empfang, spürbarer Rückhalt von Anfang an.",
            effects: {
              clubRelation: 6,
              morale: 8,
              traitDeltas: { medienimage: 1 },
              logText: "genießt sichtlich die Rückkehr an eine vertraute Wirkungsstätte.",
              logKind: "positive",
            },
          },
          {
            id: "fokus",
            label: "Trotz aller Nostalgie sofort voll auf die Leistung konzentrieren",
            detail: "Weniger Sentimentalität, dafür schneller wieder im Rhythmus.",
            effects: {
              clubRelation: 3,
              attributes: { mentalitaet: 1 },
              traitDeltas: { arbeitsmoral: 2 },
              logText: "nutzt die Rückkehr, um sich sofort voll auf die sportliche Leistung zu konzentrieren.",
              logKind: "positive",
            },
          },
          {
            id: "botschafter",
            label: "Als erfahrenes Gesicht bewusst eine Vorbildrolle für den Nachwuchs übernehmen",
            detail: "Weniger im Rampenlicht, dafür Einfluss auf die junge Generation im Kader.",
            effects: {
              reputation: 5,
              clubRelation: 4,
              traitDeltas: { fuehrung: 2 },
              logText: "übernimmt nach der Rückkehr direkt eine Vorbildrolle für die jüngeren Spieler im Kader.",
              logKind: "positive",
            },
          },
        ],
      };
    },
  },

  // ---------------------------------------------------------------------
  // SOMMERPAUSE (siehe VACATION_TEMPLATE_ID) - kommt, WENN sie feuert, immer als
  // letztes Ereignis einer Saison (siehe App.tsx `handleStartSeason`, das die ID
  // explizit ans Ende der Saison-Queue anhängt statt sie über die normale
  // Gewichtungs-Auswahl zu ziehen - deshalb hier `weight: 0` + `storylineOnly:
  // true`, dieselbe Konvention wie bei den Leihjahr-Entscheidungen oben). OB sie
  // überhaupt feuert, entscheidet `shouldTriggerVacationEvent` (feste
  // Wahrscheinlichkeit/Saison, NICHT jede Sommerpause - reiht sich damit in die
  // Häufigkeit der übrigen Karriere-Events ein, siehe dortiger Kommentar),
  // frühestens ab Alter 20. Trotzdem noch häufig genug für spürbare Text-Varianz
  // (Titel/Beschreibung UND Reiseziel), damit sich nicht jede Sommerpause einer
  // Karriere wortgleich anfühlt.
  // ---------------------------------------------------------------------
  {
    id: VACATION_TEMPLATE_ID,
    category: "lifestyle",
    minAge: 20,
    maxAge: 40,
    weight: 0,
    storylineOnly: true,
    build: (p, ctx) => {
      const variant = pickVariant(ctx, [
        {
          title: "Wohin geht's in den Urlaub?",
          description:
            "Die Saison ist geschafft - kurz vor der Sommerpause stellt sich die immer gleiche Frage: Wie und wo verbringst du die freien Wochen, bevor die Vorbereitung auf die neue Saison beginnt?",
        },
        {
          title: "Die Sommerpause steht an",
          description:
            "Nach einer langen Saison ist Zeit für eine Pause. Wohin geht es dieses Jahr - und wie sehr lässt du dabei den Fußball hinter dir?",
        },
        {
          title: "Planung für die Sommerpause",
          description:
            "Kurz vor dem letzten Spieltag macht sich schon Vorfreude auf die Sommerpause breit. Die Frage ist nur: Erholung pur oder lieber schon der Blick Richtung neue Saison?",
        },
        {
          title: "Die Koffer für den Sommer",
          description:
            "Bald ist Saisonende - Zeit, sich Gedanken über die Sommerpause zu machen. Ganz weit weg, ein Kompromiss oder lieber gar nicht wirklich Pause?",
        },
      ]);

      const choices: EventChoice[] = [];

      // Nur wählbar, wenn genug Geld dafür da ist - keine Kreditaufnahme für den Urlaub.
      if (p.wealth >= 100000) {
        // Bewusst mit getrennter Bewegungs- ("Ab ...") und Lage-Formulierung
        // ("... verbracht") je Reiseziel - "Ab auf die Malediven" / "auf den
        // Malediven verbracht" statt grammatikalisch falschem "Ab nach die
        // Malediven".
        const destination = pickVariant(ctx, [
          { to: "auf die Malediven", at: "auf den Malediven" },
          { to: "nach Dubai", at: "in Dubai" },
          { to: "in die Karibik", at: "in der Karibik" },
          { to: "auf die Seychellen", at: "auf den Seychellen" },
          { to: "nach Bora Bora", at: "auf Bora Bora" },
        ]);
        choices.push({
          id: "luxus",
          label: "Luxus-Fernreise antreten",
          detail: `Ab ${destination.to} - Erholung auf höchstem Niveau, aber teuer und weit weg vom Trainingsplatz.`,
          effects: {
            morale: rInt(ctx, 12, 18),
            reputation: rInt(ctx, 5, 9),
            wealth: -100000,
            fitness: -rInt(ctx, 4, 7),
            attributes: { physis: -1 },
            traitDeltas: { arbeitsmoral: -2 },
            logText: `hat die Sommerpause ${destination.at} verbracht.`,
            logKind: "info",
          },
        });
      }

      const europaDestination = pickVariant(ctx, ["Spanien", "Italien", "Griechenland", "Portugal", "Kroatien"]);
      choices.push(
        {
          id: "europa",
          label: "Wochen in Europa verbringen",
          detail: `Ein entspannter Sommer in ${europaDestination} - Sonne, neue Eindrücke, ohne das ganz große Budget.`,
          effects: {
            morale: rInt(ctx, 6, 10),
            attributes: { charisma: 1 },
            wealth: -40000,
            logText: `hat die Sommerpause in ${europaDestination} verbracht.`,
            logKind: "info",
          },
        },
        {
          id: "training",
          label: "Zuhause bleiben und gezielt trainieren",
          detail: "Statt Fernweh lieber Extra-Trainingseinheiten und Nähe zum Verein - die neue Saison schon im Blick.",
          effects: {
            morale: rInt(ctx, 2, 4),
            fitness: rInt(ctx, 4, 7),
            traitDeltas: { arbeitsmoral: 2, disziplin: 2 },
            clubRelation: rInt(ctx, 4, 7),
            logText: "hat die Sommerpause für zusätzliches Training beim Verein genutzt.",
            logKind: "info",
          },
        }
      );

      return { category: "lifestyle", title: variant.title, description: variant.description, choices };
    },
  },

  // ---------------------------------------------------------------------
  // NARRATIVES LEIHJAHR (siehe loanStory.ts) - drei Entscheidungen einer
  // laufenden Leihe. `storylineOnly: true` wie bei Storyline-Fortsetzungen:
  // werden NIE zufällig über `pickSeasonTemplateIds`/`eligibleTemplates`
  // gezogen, sondern ausschließlich explizit eingespielt (siehe App.tsx
  // `handleChoice`, das die Leihe als exklusiven Event-State direkt in
  // `pendingEventIds` einreiht, sobald ein Leihangebot angenommen wird).
  // Die `effects: {}` je Entscheidung sind bewusste Platzhalter: die
  // eigentliche Auflösung (Würfel + Momentum + Ausgang) übernimmt
  // `applyLoanDecisionChoice` in careerEngine.ts über `loanStory.ts`,
  // NICHT die generische `applyChoice` - App.tsx erkennt diese Templates
  // an ihrer ID und routet entsprechend um.
  // ---------------------------------------------------------------------
  ...LOAN_DECISIONS.map((decision): EventTemplate => ({
    id: decision.templateId,
    category: "leihe",
    minAge: 15,
    maxAge: 40,
    weight: 0,
    storylineOnly: true,
    build: (p) => ({
      category: "leihe",
      title: decision.title,
      description: decision.description(p.loanNarrative?.loanClubName ?? p.club.name),
      choices: decision.choices.map(
        (c): EventChoice => ({ id: c.id, label: c.label, detail: c.detail, effects: {} })
      ),
    }),
  })),

  // ---------------------------------------------------------------------
  // CAREER NARRATIVE & DECISION IMPACT (siehe careerEngine.ts
  // `computeCareerNarrativeState`/`detectCareerPhenotype`) - ein kleiner, bewusst
  // eng umrissener Pool rein REFLEKTIVER Ereignisse, die an die neu getrackten
  // Signale andocken (Transferentscheidungs-Protokoll, Potential-Ceiling,
  // Nationalmannschafts-Snub). Ausdrücklich NICHT selbsterfüllend: keines dieser
  // Ereignisse verändert Länderspiel-Berufungen, Kaderrolle oder Attribute
  // spürbar - sie kommentieren/verarbeiten einen bereits eingetretenen Zustand,
  // erzwingen ihn nicht. Laufen wie jedes andere Template über die normale
  // gewichtete Zufallsauswahl (`pickSeasonTemplateIds`) - rein probabilistisch,
  // nie garantiert.
  // ---------------------------------------------------------------------
  {
    id: "narrative_berufungsfrust",
    category: "nationalmannschaft",
    minAge: 24,
    maxAge: 34,
    weight: 1.5,
    unique: true,
    // Elite-Niveau, gutes Ansehen, aber bislang nie berufen - siehe Diagnose Teil E:
    // bei diesem Spielerprofil ist das laut 1500-Karrieren-Backtest KEINE Frage von
    // Leistung/Einsatzzeit, sondern reines Berufungs-Losglück über viele unabhängige
    // Saison-Ziehungen (siehe `nationalTeamCallUpChance`) - das Event verändert diese
    // Chance bewusst NICHT, sondern verarbeitet nur den Frust darüber.
    condition: (p) => {
      if (p.nationalTeamCaps > 0) return false;
      if (p.reputation < 55) return false;
      const overall = overallRatingFromAttributes(p.attributes, p.position);
      return overall >= 75;
    },
    // Wächst mit der Kandidatur-Serie (siehe `Player.nationalTeamCandidacySeasons`) -
    // je länger der Snub andauert, desto präsenter wird der Frust darüber.
    dynamicWeight: (p) => 1 + clamp(p.nationalTeamCandidacySeasons * 0.3, 0, 3),
    build: (p) => ({
      category: "nationalmannschaft",
      title: "Nie berufen",
      description: `Trotz starker Form bei ${club(p)} und mittlerweile ordentlichem Ansehen - eine Einladung zur Nationalmannschaft ist bislang ausgeblieben. Andere, objektiv nicht bessere Spieler wurden längst berufen.`,
      choices: [
        {
          id: "motiviert",
          label: "Es als zusätzlichen Ansporn nehmen",
          detail: "Fokus auf das, was du beeinflussen kannst - deine Leistung beim Verein.",
          effects: {
            traitDeltas: { arbeitsmoral: 3 },
            morale: 3,
            logText: "nimmt die ausbleibende Nationalmannschafts-Berufung als zusätzlichen Ansporn.",
            logKind: "info",
          },
        },
        {
          id: "groll",
          label: "Öffentlich Unverständnis äußern",
          detail: "Erleichtert kurzfristig, sorgt aber für Gesprächsstoff - nicht nur positiven.",
          effects: {
            traitDeltas: { medienimage: -3 },
            morale: 2,
            logText: "äußert öffentlich Unverständnis über die ausbleibende Nationalmannschafts-Berufung.",
            logKind: "negative",
          },
        },
      ],
    }),
  },
  {
    id: "narrative_kaltes_wasser",
    category: "transfer",
    minAge: 17,
    maxAge: 37,
    weight: 1.5,
    // Kürzlich (letzte abgeschlossene Saison) ein spürbar größerer/riskanterer
    // Wechsel (siehe `Player.transferDecisions`), aber (noch) kein gesicherter
    // Platz beim neuen Verein - der "beweisen musst du dich noch"-Moment.
    condition: (p) => {
      const last = p.transferDecisions[p.transferDecisions.length - 1];
      if (!last) return false;
      const recentEnough = p.seasonHistory.length - last.seasonHistoryIndex <= 1;
      if (!recentEnough) return false;
      if (last.type !== "UPWARD_MOVE" && last.type !== "PRESTIGE_RISK_MOVE") return false;
      return p.contract.squadRole === "Rotation" || p.contract.squadRole === "Ergänzungsspieler" || p.contract.squadRole === "Ersatzbank";
    },
    // Deutlich wahrscheinlicher, wenn der laufende `activeNarrativeThread` (siehe
    // "TECHNISCHE VERANKERUNG" Abschnitt 7/12) den Wechsel bereits als STRUGGLE
    // einordnet - dann passt das Event nicht nur formal, sondern zum tatsächlichen
    // bisherigen Verlauf.
    dynamicWeight: (p) => (p.activeNarrativeThread?.stage === "STRUGGLE" ? 3 : 1),
    build: (p) => ({
      category: "transfer",
      title: "Der Sprung ins kalte Wasser",
      description: `Der Wechsel zu ${club(p)} war ein mutiger Schritt nach oben - jetzt heißt es, sich gegen eine stärkere Konkurrenz erst noch durchzusetzen, statt automatisch gesetzt zu sein.`,
      choices: [
        {
          id: "geduldig",
          label: "Geduldig auf die Chance hinarbeiten",
          detail: "Kein schneller Durchbruch, aber solide Basis für den langen Weg.",
          effects: {
            traitDeltas: { disziplin: 2, arbeitsmoral: 2 },
            clubRelation: 3,
            logText: "arbeitet nach dem Wechsel geduldig auf seine/ihre Chance hin.",
            logKind: "info",
          },
        },
        {
          id: "ungeduldig",
          label: "Offen mehr Einsatzzeit einfordern",
          detail: "Kann Druck erzeugen - beim Trainer kommt das nicht immer gut an.",
          effects: {
            clubRelation: -4,
            traitDeltas: { fuehrung: 2 },
            logText: "fordert nach dem Wechsel offen mehr Einsatzzeit ein.",
            logKind: "negative",
          },
        },
      ],
    }),
  },
  {
    // Positives Pendant zu "narrative_kaltes_wasser" (siehe "CAREER NARRATIVE ...
    // TECHNISCHE VERANKERUNG" Abschnitt 5/17/18) - würdigt, wenn eine riskante/
    // ambitionierte Entscheidung sich tatsächlich ausgezahlt hat: entweder mitten
    // im Wiederaufbau nach einer schwierigen Anpassungsphase (`REBUILD`) oder kurz
    // nach einem abgeschlossenen Durchbruch (`Player.narrativeHistory`).
    id: "narrative_platz_gefunden",
    category: "transfer",
    minAge: 17,
    maxAge: 37,
    weight: 1.5,
    unique: true,
    condition: (p) => {
      if (p.activeNarrativeThread?.stage === "REBUILD") return true;
      const lastHistory = p.narrativeHistory[p.narrativeHistory.length - 1];
      if (lastHistory?.type === "BIG_MOVE_BREAKTHROUGH" && p.seasonHistory.length - lastHistory.season <= 1) return true;
      const last = p.transferDecisions[p.transferDecisions.length - 1];
      if (!last) return false;
      const recentEnough = p.seasonHistory.length - last.seasonHistoryIndex <= 2;
      if (!recentEnough) return false;
      if (last.type !== "DOWNWARD_MOVE" && last.type !== "PLAYING_TIME_MOVE") return false;
      return p.contract.squadRole === "Stammspieler";
    },
    dynamicWeight: (p) => (p.activeNarrativeThread?.stage === "REBUILD" ? 3 : 1),
    build: (p) => ({
      category: "transfer",
      title: "Du hast deinen Platz gefunden",
      description: `Was zunächst wie ein Risiko wirkte, zahlt sich bei ${club(p)} jetzt spürbar aus - Einsatzzeit und Leistungen entwickeln sich klar in die richtige Richtung.`,
      choices: [
        {
          id: "bestaetigen",
          label: "Die neue Rolle bestätigen",
          detail: "Konstanz statt Selbstzufriedenheit - weiter dranbleiben.",
          effects: {
            morale: 5,
            clubRelation: 4,
            traitDeltas: { arbeitsmoral: 1 },
            logText: "bestätigt die neue Rolle mit weiteren starken Auftritten.",
            logKind: "positive",
          },
        },
        {
          id: "genuss",
          label: "Den Moment genießen",
          detail: "Ein kurzer Moment des Durchatmens nach der harten Phase davor.",
          effects: {
            morale: 8,
            logText: "genießt sichtlich, dass sich die Entscheidung ausgezahlt hat.",
            logKind: "positive",
          },
        },
      ],
    }),
  },
  {
    id: "narrative_spaete_reife",
    category: "meilenstein",
    minAge: 27,
    maxAge: 36,
    weight: 1,
    unique: true,
    // Klarer Leistungs-Turnaround: die letzten beiden Saisons spürbar besser als der
    // Karriereschnitt davor, UND dieser Schnitt lag klar unter Liga-Durchschnitt -
    // derselbe strikte Maßstab wie `detectCareerPhenotype`s "LATE_BLOOMER" (kein
    // reiner später OVR-Peak, siehe dortiger Kommentar zum "falsch-positiven Typ D").
    condition: (p) => {
      if (p.seasonHistory.length < 5) return false;
      const recent = p.seasonHistory.slice(-2);
      const earlier = p.seasonHistory.slice(0, -2);
      if (recent.length < 2 || earlier.length < 3) return false;
      const recentAvg = recent.reduce((a, s) => a + s.performanceScore, 0) / recent.length;
      const earlierAvg = earlier.reduce((a, s) => a + s.performanceScore, 0) / earlier.length;
      return earlierAvg < 46 && recentAvg > earlierAvg + 12;
    },
    build: (p) => ({
      category: "meilenstein",
      title: "Späte Reife",
      description: `Über weite Strecken der Karriere war ${p.name} bestenfalls Durchschnitt - in den letzten Spielzeiten bei ${club(p)} ist plötzlich eine ganz andere Konstanz zu erkennen.`,
      choices: [
        {
          id: "geniessen",
          label: "Den späten Aufschwung bewusst genießen",
          detail: "Ein ruhiger, zufriedener Blick auf die eigene Entwicklung.",
          effects: {
            morale: 6,
            traitDeltas: { medienimage: 2 },
            logText: "genießt sichtlich den späten sportlichen Aufschwung.",
            logKind: "positive",
          },
        },
        {
          id: "weitermachen",
          label: "Direkt weiter nach vorne blicken",
          detail: "Kein Innehalten - der Blick geht sofort auf das nächste Ziel.",
          effects: {
            traitDeltas: { arbeitsmoral: 2 },
            logText: "blickt nach dem späten Aufschwung ohne Umschweife direkt aufs nächste Ziel.",
            logKind: "info",
          },
        },
      ],
    }),
  },
  {
    // Der eigentliche, EXPLIZITE Ceiling-Break-Auslöser (siehe "CAREER NARRATIVE ...
    // TECHNISCHE VERANKERUNG" Abschnitt 20/24) - bewusst eng gefasst und zusätzlich
    // über einen expliziten Zufallswurf in der Condition seltener gemacht (unabhängig
    // von der Gewichtung im Eventpool): mindestens ein Attribut liegt bereits nah am
    // eigenen Potential (die "Decke" ist spürbar erreicht), UND die letzte Saison war
    // außergewöhnlich (`performanceScore`), UND die Zuverlässigkeit ist überdurch-
    // schnittlich (`productionReliability`) - beides NUR lesend verwendet, keine
    // Änderung an deren Formeln. Auf max. 2 Breaks pro Karriere begrenzt (siehe
    // `Player.ceilingBreaks`), damit es ein seltener Ausnahmemoment bleibt, kein
    // wiederholbarer Trick.
    id: "ceiling_break_moment",
    category: "meilenstein",
    minAge: 17,
    maxAge: 33,
    weight: 1,
    // Schwellen bewusst so kalibriert, dass der Break selten, aber über eine ganze
    // Karriere hinweg tatsächlich ERLEBBAR bleibt (siehe Backtest: Ziel ~3-6% der
    // Karrieren, nicht 1-in-mehreren-Tausend) - ein erster, deutlich strengerer
    // Entwurf (Ø-Note 75+, Reliability 1.05+, Zufallswurf 12%) hätte laut Backtest
    // faktisch nie ausgelöst.
    condition: (p) => {
      if (p.ceilingBreaks.length >= 2) return false;
      const lastStats = p.seasonHistory[p.seasonHistory.length - 1];
      if (!lastStats || lastStats.performanceScore < 68) return false;
      if (p.productionReliability < 1.0) return false;
      const nearCeiling = (Object.keys(p.attributes) as (keyof typeof p.attributes)[]).some(
        (key) => p.potential[key] - p.attributes[key] <= 4 && p.potential[key] - p.attributes[key] >= 0
      );
      if (!nearCeiling) return false;
      return Math.random() < 0.4;
    },
    build: (p, ctx) => {
      // Das Attribut, das dem eigenen Potential aktuell am nächsten ist, bricht durch -
      // bei mehreren gleich nahen wird zufällig unter ihnen gewählt.
      const keys = Object.keys(p.attributes) as (keyof typeof p.attributes)[];
      const candidates = keys.filter((key) => p.potential[key] - p.attributes[key] <= 4 && p.potential[key] - p.attributes[key] >= 0);
      const breakKey = pickVariant(ctx, candidates.length > 0 ? candidates : keys);
      const amount = rInt(ctx, 2, 4);
      return {
        category: "meilenstein",
        title: "Über das erwartete Limit hinaus",
        description: `${club(p)} und selbst neutrale Beobachter sind sich einig: In dieser Form spielt ${p.name} inzwischen über dem, was Scouts und Trainer für das Maximum gehalten hatten. Ein echter Ausreißer-Moment - nutzt du ihn, oder bleibst du auf Nummer sicher?`,
        choices: [
          {
            id: "nutzen",
            label: "Den Moment voll ausreizen",
            detail: "Riskanter, aber die Chance auf einen echten Sprung über die eigenen Grenzen hinaus.",
            effects: {
              ceilingBreak: { [breakKey]: amount },
              fitness: -6,
              morale: 6,
              logText: `hat einen außergewöhnlichen Moment voll ausgereizt und die eigenen Grenzen tatsächlich verschoben.`,
              logKind: "milestone",
            },
          },
          {
            id: "sicher",
            label: "Auf Nummer sicher gehen",
            detail: "Kein Risiko - dafür bleibt die eigene Obergrenze unverändert.",
            effects: {
              clubRelation: 3,
              traitDeltas: { disziplin: 2 },
              logText: "bleibt trotz eines außergewöhnlichen Moments lieber auf Nummer sicher.",
              logKind: "info",
            },
          },
        ],
      };
    },
  },
  {
    id: "narrative_grenzen_gesprengt",
    category: "meilenstein",
    minAge: 16,
    maxAge: 40,
    weight: 1,
    unique: true,
    // Reine REAKTION auf einen bereits erfolgten expliziten Ceiling Break (siehe
    // "ceiling_break_moment" oben, `Player.ceilingBreaks`) - anders als vorher KEIN
    // Vergleich mehr gegen den rohen Attribut-vs-Potential-Zustand (der ist seit
    // `applyEffects`s Potential-Deckelung ohnehin nur noch nach einem echten
    // Ceiling Break möglich).
    condition: (p) => p.ceilingBreaks.length > 0,
    build: (p) => ({
      category: "meilenstein",
      title: "Über das erwartete Limit hinaus",
      description: `Trainer und Scouts staunen: In einzelnen Bereichen zeigt ${p.name} inzwischen mehr, als selbst die optimistischsten Einschätzungen aus der Jugend für möglich gehalten hätten.`,
      choices: [
        {
          id: "bescheiden",
          label: "Bescheiden bleiben",
          detail: "Kein großes Aufheben - einfach weiterarbeiten.",
          effects: {
            traitDeltas: { disziplin: 2 },
            clubRelation: 2,
            logText: "reagiert bescheiden darauf, die eigenen Erwartungen übertroffen zu haben.",
            logKind: "positive",
          },
        },
        {
          id: "stolz",
          label: "Offen stolz darauf sein",
          detail: "Ein Statement-Moment - mediales Echo inklusive.",
          effects: {
            reputation: 3,
            traitDeltas: { medienimage: 2 },
            logText: "zeigt sich offen stolz darauf, die eigenen Erwartungen übertroffen zu haben.",
            logKind: "positive",
          },
        },
      ],
    }),
  },
];

export function getTemplateById(id: string): EventTemplate | undefined {
  return EVENT_TEMPLATES.find((t) => t.id === id);
}

/** Kategorien, die aktive Spielteilnahme/körperliches Training voraussetzen -
 * während einer laufenden Verletzung inhaltlich unmöglich (siehe `eligibleTemplates`). */
const REQUIRES_FITNESS_CATEGORIES = new Set(["taktik", "training", "nationalmannschaft"]);

/** Einzelne Templates außerhalb der oben genannten Kategorien, die trotzdem
 * aktives Spielgeschehen oder frisch absolvierte Spiele voraussetzen (z.B.
 * "Kritik an den letzten Leistungen" oder "Spieler des Monats") - während
 * einer Verletzungspause ebenso unpassend wie ein Matchmoment. */
const REQUIRES_FITNESS_TEMPLATE_IDS = new Set([
  "lifestyle_legendenspiel",
  "vorbereitungstour",
  "lifestyle_dopingkontrolle",
  "auswaertsreise_chaos",
  "medien_kritik",
  "spieler_des_monats",
  "torwart_patzer",
  "verletzung_risiko",
  "unglueckliches_zusammenprall",
  "comeback_1",
  "verletzung_doppelbelastung",
  "verletzung_reserve_restart",
]);

export function eligibleTemplates(
  player: Player,
  usedTemplateIds: Set<string>
): EventTemplate[] {
  const injured = !!player.injury && player.injury.weeksOut > 0;
  return EVENT_TEMPLATES.filter((t) => {
    // Fortsetzungs-Stufen einer Storyline werden nie zufällig gezogen, sondern
    // ausschließlich fällig eingespielt (siehe `dueStorylineTemplateIds`).
    if (t.storylineOnly) return false;
    if (player.age < t.minAge || player.age > t.maxAge) return false;
    if (t.unique && usedTemplateIds.has(t.id)) return false;
    // Wer verletzt ist, kann keine Matchszenen erleben, kein Zusatztraining
    // absolvieren, wird nicht für die Nationalmannschaft berufen und kann sich
    // auch keine NEUE Verletzung zuziehen - die Ereignis-Auswahl soll das
    // während der Ausfallzeit widerspiegeln (Reha statt Spielgeschehen),
    // nicht so tun, als sei nichts gewesen.
    if (injured && REQUIRES_FITNESS_CATEGORIES.has(t.category)) return false;
    if (injured && REQUIRES_FITNESS_TEMPLATE_IDS.has(t.id)) return false;
    if (t.condition && !t.condition(player)) return false;
    return true;
  });
}

export function clampAttributes(p: Player) {
  for (const key of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) {
    p.attributes[key] = clamp(p.attributes[key], 1, 99);
  }
}
