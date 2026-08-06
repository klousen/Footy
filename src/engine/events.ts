import type { EventTemplate, Player } from "./types";
import { clamp, FEMALE_FIRST_NAMES, FIRST_NAMES, LAST_NAMES } from "./data";

// Hilfsfunktion für lesbaren Vereinsnamen im Text
const club = (p: Player) => p.club.name;

// Gemischter Namenspool für Partner:innen - unabhängig vom Geschlecht des
// Spielers, damit nicht ausschließlich männliche Partnernamen vorkommen.
const PARTNER_NAME_POOL = [...FIRST_NAMES, ...FEMALE_FIRST_NAMES];

// Hilfsfunktion: zufälliger Vorname für neue Beziehungen
function randomPartnerName(rng: () => number): string {
  return PARTNER_NAME_POOL[Math.floor(rng() * PARTNER_NAME_POOL.length)];
}

// Hilfsfunktion: zufällige Ganzzahl in [min, max] - für variablen Effekt-Impact
// (dieselbe Entscheidung soll sich nicht jedes Mal exakt gleich anfühlen).
function rInt(ctx: { rng: () => number }, min: number, max: number): number {
  return min + Math.floor(ctx.rng() * (max - min + 1));
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

export const EVENT_TEMPLATES: EventTemplate[] = [
  // ---------------------------------------------------------------------
  // JUGEND (14-17)
  // ---------------------------------------------------------------------
  {
    id: "jugend_schule",
    category: "jugend",
    minAge: 14,
    maxAge: 16,
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
    minAge: 14,
    maxAge: 15,
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
    maxAge: 16,
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
      return {
        category: "training",
        title: "Zusätzliche Trainingseinheit",
        description: "Der Athletiktrainer bietet eine freiwillige Extraschicht am Abend an.",
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
    build: (_p, ctx) => {
      const gain = rInt(ctx, 1, 3);
      const cost = rInt(ctx, 1, 3);
      return {
        category: "training",
        title: "Individueller Trainingsschwerpunkt",
        description: "Der Trainerstab lässt dich einen Schwerpunkt für die kommenden Wochen wählen.",
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
    id: "lifestyle_party",
    category: "lifestyle",
    minAge: 17,
    maxAge: 36,
    weight: 2,
    build: () => ({
      category: "lifestyle",
      title: "Einladung zur Release-Party",
      description: "Ein Bekannter lädt dich zu einer großen Party ein - genau vor einem wichtigen Trainingsblock.",
      choices: [
        {
          id: "hingehen",
          label: "Hingehen und feiern",
          effects: { morale: 8, reputation: 2, fitness: -8, traitDeltas: { disziplin: -4 }, logText: "hat ausgelassen gefeiert.", logKind: "info" },
        },
        {
          id: "absagen",
          label: "Absagen und früh schlafen",
          effects: { fitness: 5, clubRelation: 1, traitDeltas: { disziplin: 2, arbeitsmoral: 1 }, logText: "hat auf die Party verzichtet und sich ausgeruht.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "lifestyle_ernaehrung",
    category: "lifestyle",
    minAge: 16,
    maxAge: 38,
    weight: 2,
    build: () => ({
      category: "lifestyle",
      title: "Ernährungsberatung",
      description: "Der Vereinsarzt schlägt eine strikte Ernährungsumstellung vor.",
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
    }),
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
    build: (p) => ({
      category: "medien",
      title: "Pressekonferenz",
      description: `Nach einer wichtigen Partie will die Presse wissen, wie du die Lage bei ${club(p)} einschätzt.`,
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
    }),
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
    build: () => ({
      category: "sponsoring",
      title: "Angebot eines Schuhherstellers",
      description: "Ein Sportartikelhersteller bietet dir einen Ausrüstervertrag an - inklusive Werbeterminen neben dem Training.",
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
    }),
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
    // braucht schon eine wirklich außergewöhnliche Saison (Ø-Note 8+), um trotzdem
    // aufzufallen. Reine Liga-2-Routine reicht nicht für eine Nominierung.
    condition: (p) => {
      if (p.reputation <= 40) return false;
      if (p.club.tier === 1) return true;
      const last = p.seasonHistory[p.seasonHistory.length - 1];
      return !!last && last.avgRating >= 8;
    },
    build: (p, ctx) => {
      const isDebut = p.nationalTeamCaps === 0;
      const attackWeight = { TW: 0, IV: 0.1, AV: 0.2, ZM: 0.35, FS: 0.6, ST: 0.75 }[p.position];
      const goalsDelta = ctx.rng() < attackWeight ? rInt(ctx, 1, 2) : 0;
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
              chance: 0.6,
              success: {
                reputation: 14,
                fitness: -6,
                morale: 8,
                capsDelta: 3,
                goalsDelta,
                attributes: { mentalitaet: 1, physis: 1 },
                traitDeltas: { fuehrung: 1 },
                logText:
                  (isDebut
                    ? "hat sein/ihr Debüt für die Nationalmannschaft gegeben und überzeugt."
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
    condition: (p) => p.nationalTeamCaps >= 15 && p.traits.fuehrung >= 65,
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
    condition: (p) => p.contract.yearsLeft <= 1,
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
          effects: { clubRelation: 6, morale: 4, wantsTransfer: false, logText: "hat verlängert mit Fokus auf eine klare Rolle im Team.", logKind: "milestone" },
        },
        {
          id: "ablehnen",
          label: "Nicht verlängern, offen für Wechsel",
          effects: { clubRelation: -6, reputation: 2, wantsTransfer: true, logText: "hat eine Vertragsverlängerung abgelehnt und ist wechselbereit.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "transfer_angebot",
    category: "transfer",
    minAge: 17,
    maxAge: 38,
    weight: 2,
    condition: (p) => p.reputation > 25,
    build: (p) => ({
      category: "transfer",
      title: "Transferangebot eines anderen Vereins",
      description: `Ein anderer Verein interessiert sich für dich und würde dich gerne von ${club(p)} loseisen.`,
      choices: [
        {
          id: "wechselwunsch",
          label: "Wechselwunsch äußern",
          effects: { clubRelation: -8, reputation: 3, wantsTransfer: true, logText: "hat öffentlich einen Wechselwunsch geäußert.", logKind: "negative" },
        },
        {
          id: "loyal",
          label: "Dem Verein die Treue halten",
          effects: { clubRelation: 8, morale: 3, wantsTransfer: false, logText: "hat sich öffentlich zum aktuellen Verein bekannt.", logKind: "positive" },
        },
      ],
    }),
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
          effects: { attributes: { mentalitaet: 1 }, clubRelation: 2, morale: 2, wantsTransfer: true, logText: "ist offen für eine Leihe und signalisiert dem Verein Wechselbereitschaft.", logKind: "info" },
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
    id: "beziehungskonflikt",
    category: "beziehung",
    minAge: 18,
    maxAge: 36,
    weight: 2,
    condition: (p) => p.relationshipStatus === "in_beziehung" || p.relationshipStatus === "verlobt" || p.relationshipStatus === "verheiratet",
    build: (p) => ({
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
              logText: "hat sich getrennt - die Beziehung ist an der Belastung durch die Karriere zerbrochen.",
              logKind: "negative",
            },
          },
        },
        {
          id: "trennen",
          label: "Die Beziehung beenden",
          effects: { relationshipStatus: "single", partnerName: null, morale: -6, logText: "hat die Beziehung beendet, um sich auf die Karriere zu konzentrieren.", logKind: "negative" },
        },
      ],
    }),
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
    condition: (p) =>
      (p.relationshipStatus === "verheiratet" || p.relationshipStatus === "verlobt") &&
      p.age >= minMarriageAge(p.education) + 2,
    build: (p) => ({
      category: "beziehung",
      title: "Nachwuchs",
      description: `${p.partnerName ?? "Deine Partnerin/dein Partner"} und du werdet Eltern!`,
      choices: [
        {
          id: "elternzeit",
          label: "Die ersten Wochen bewusst auskosten",
          effects: { morale: 15, fitness: -5, childrenDelta: 1, logText: "ist Elternteil geworden und hat sich bewusst Zeit für die Familie genommen.", logKind: "milestone" },
        },
        {
          id: "training",
          label: "Schnell zurück ins Training",
          effects: { morale: 6, attributes: { physis: 1 }, childrenDelta: 1, logText: "ist Elternteil geworden, war aber schon nach kurzer Zeit zurück im Training.", logKind: "milestone" },
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
    build: (p) => ({
      category: "meilenstein",
      title: "Neuer Trainer",
      description: `Bei ${club(p)} übernimmt ein neuer Cheftrainer und stellt Kader sowie eingespielte Automatismen infrage.`,
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
    }),
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
    build: (_p, ctx) => ({
      category: "training",
      title: "Standardsituationen üben",
      description: "Nach dem regulären Training bleibt Zeit für zusätzliches Freistoß- und Eckballtraining.",
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
            failure: { morale: -4, clubRelation: -2, logText: "hat das peinliche Pokal-Aus gegen einen Außenseiter miterlebt.", logKind: "negative" },
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
    build: () => ({
      category: "verletzung",
      title: "Unglücklicher Zusammenprall",
      description: "Bei einem harmlos wirkenden Zweikampf prallst du unglücklich mit einem Gegenspieler zusammen.",
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
    }),
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
    condition: (p) => p.traits.disziplin <= 25,
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
    condition: (p) => p.traits.medienimage <= 25,
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
      title: "Vertrag läuft aus - Bosman-Poker",
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
