import type { EventTemplate, Player } from "./types";
import { clamp, FIRST_NAMES } from "./data";

// Hilfsfunktion für lesbaren Vereinsnamen im Text
const club = (p: Player) => p.club.name;

// Hilfsfunktion: zufälliger Vorname für neue Beziehungen
function randomPartnerName(rng: () => number): string {
  return FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
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
          effects: { attributes: { mentalitaet: 1, charisma: 1 }, clubRelation: 2, logText: "hat als Streitschlichter überzeugt.", logKind: "positive" },
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
    build: () => ({
      category: "training",
      title: "Zusätzliche Trainingseinheit",
      description: "Der Athletiktrainer bietet eine freiwillige Extraschicht am Abend an.",
      choices: [
        {
          id: "ja",
          label: "Teilnehmen",
          effects: { attributes: { physis: 1 }, fitness: -5, logText: "hat eine Extraschicht im Training absolviert.", logKind: "info" },
        },
        {
          id: "nein",
          label: "Lieber regenerieren",
          effects: { fitness: 5, logText: "hat sich für Regeneration entschieden.", logKind: "info" },
        },
      ],
    }),
  },
  {
    id: "training_technikfokus",
    category: "training",
    minAge: 15,
    maxAge: 34,
    weight: 3,
    build: () => ({
      category: "training",
      title: "Individueller Trainingsschwerpunkt",
      description: "Der Trainerstab lässt dich einen Schwerpunkt für die kommenden Wochen wählen.",
      choices: [
        {
          id: "technik",
          label: "Technik verfeinern",
          effects: { attributes: { technik: 2 }, fitness: -2, logText: "hat gezielt an der Technik gefeilt.", logKind: "info" },
        },
        {
          id: "tempo",
          label: "Schnelligkeit trainieren",
          effects: { attributes: { tempo: 2 }, fitness: -2, logText: "hat an der Schnelligkeit gearbeitet.", logKind: "info" },
        },
        {
          id: "mental",
          label: "Mentaltraining mit dem Sportpsychologen",
          effects: { attributes: { mentalitaet: 2 }, morale: 2, logText: "hat mentale Stärke aufgebaut.", logKind: "info" },
        },
      ],
    }),
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
          effects: { morale: 8, reputation: 2, fitness: -8, logText: "hat ausgelassen gefeiert.", logKind: "info" },
        },
        {
          id: "absagen",
          label: "Absagen und früh schlafen",
          effects: { fitness: 5, clubRelation: 1, logText: "hat auf die Party verzichtet und sich ausgeruht.", logKind: "info" },
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
          effects: { attributes: { physis: 1 }, fitness: 4, morale: -1, logText: "hat die Ernährung konsequent umgestellt.", logKind: "info" },
        },
        {
          id: "nein",
          label: "Beim Altbewährten bleiben",
          effects: { morale: 1, logText: "ist bei den gewohnten Essgewohnheiten geblieben.", logKind: "info" },
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
          effects: { attributes: { charisma: 1 }, clubRelation: 1, logText: "hat sich diplomatisch gegenüber der Presse geäußert.", logKind: "info" },
        },
        {
          id: "provokant",
          label: "Provokant Klartext reden",
          effects: { reputation: 5, clubRelation: -3, logText: "hat mit provokanten Aussagen für Schlagzeilen gesorgt.", logKind: "negative" },
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
          effects: { reputation: 6, morale: -2, logText: "hat einer Homestory zugestimmt.", logKind: "info" },
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
          effects: { reputation: 3, morale: -3, logText: "hat auf öffentliche Kritik gekontert.", logKind: "negative" },
        },
        {
          id: "ignorieren",
          label: "Ignorieren und auf dem Platz antworten",
          effects: { attributes: { mentalitaet: 1 }, logText: "hat Kritik ignoriert und auf dem Platz geantwortet.", logKind: "info" },
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

  // ---------------------------------------------------------------------
  // TAKTIK / SPIELMOMENTE
  // ---------------------------------------------------------------------
  {
    id: "taktik_elfmeter",
    category: "taktik",
    minAge: 17,
    maxAge: 40,
    weight: 2,
    condition: (p) => p.attributes.mentalitaet > 20,
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
          effects: { attributes: { mentalitaet: 2, charisma: 1 }, reputation: 6, clubRelation: 4, logText: "wurde zum Mannschaftskapitän ernannt.", logKind: "milestone" },
        },
        {
          id: "ablehnen",
          label: "Höflich ablehnen",
          effects: { morale: 2, logText: "hat die Kapitänsbinde vorerst abgelehnt.", logKind: "info" },
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
    maxAge: 37,
    weight: 2,
    condition: (p) => p.reputation > 40,
    build: () => ({
      category: "nationalmannschaft",
      title: "Einladung zur Nationalmannschaft",
      description: "Der Nationaltrainer beruft dich erstmals für ein Länderspiel-Camp - eine große Ehre, aber auch zusätzliche Belastung.",
      choices: [
        {
          id: "folgen",
          label: "Der Einladung folgen",
          effects: { reputation: 8, fitness: -6, morale: 6, logText: "wurde in die Nationalmannschaft berufen.", logKind: "milestone" },
        },
        {
          id: "absagen",
          label: "Wegen Belastung absagen",
          effects: { fitness: 4, reputation: -3, logText: "hat eine Nationalmannschaftseinladung wegen Belastung abgesagt.", logKind: "info" },
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
          effects: { wealth: 0, clubRelation: 2, wantsTransfer: false, logText: "hat den Vertrag mit Fokus auf ein hohes Gehalt verlängert.", logKind: "milestone" },
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
    minAge: 16,
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
    weight: 1,
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
    minAge: 21,
    maxAge: 36,
    weight: 1,
    condition: (p) => p.relationshipStatus === "in_beziehung",
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
    minAge: 22,
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
    minAge: 23,
    maxAge: 39,
    weight: 1,
    condition: (p) => p.relationshipStatus === "verheiratet" || p.relationshipStatus === "verlobt",
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
          effects: { attributes: { mentalitaet: 1, charisma: 1 }, clubRelation: 5, fitness: -2, logText: "hat sich als Mentor für die jungen Spieler im Kader engagiert.", logKind: "positive" },
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
          effects: { reputation: 6, morale: 8, logText: "wurde von den Fans zum Publikumsliebling gewählt.", logKind: "positive" },
        },
      ],
    }),
  },
  {
    id: "erbschaft",
    category: "lifestyle",
    minAge: 18,
    maxAge: 40,
    weight: 1,
    build: () => ({
      category: "lifestyle",
      title: "Unerwartetes Erbe",
      description: "Ein entfernter Verwandter hinterlässt dir ein kleines Vermögen.",
      choices: [
        {
          id: "annehmen",
          label: "Erbe annehmen",
          effects: { wealth: 25000, logText: "hat unerwartet eine Erbschaft gemacht.", logKind: "positive" },
        },
      ],
    }),
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
          effects: { wealth: -8000, reputation: 3, logText: "ist rechtlich gegen eine Boulevard-Geschichte vorgegangen.", logKind: "info" },
        },
        {
          id: "kontern",
          label: "Selbstironisch in den sozialen Medien kontern",
          effects: {},
          followUpChance: {
            chance: 0.5,
            success: { reputation: 6, morale: 3, logText: "hat eine Boulevard-Schlagzeile mit Humor gekontert und Sympathien gesammelt.", logKind: "positive" },
            failure: { reputation: -5, logText: "ist mit einem missglückten Konter zur Schlagzeile selbst zum Gespött geworden.", logKind: "negative" },
          },
        },
        {
          id: "ignorieren",
          label: "Ignorieren",
          effects: { reputation: -2, logText: "hat eine Boulevard-Schlagzeile einfach ignoriert.", logKind: "negative" },
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
    build: () => ({
      category: "lifestyle",
      title: "Schreckmoment im Straßenverkehr",
      description: "Auf dem Weg zum Training kommt dir ein Auto gefährlich nah - ein Unfall wird nur knapp vermieden.",
      choices: [
        {
          id: "weiter",
          label: "Durchatmen und weiterfahren",
          effects: {},
          followUpChance: {
            chance: 0.75,
            success: { morale: -1, logText: "kam mit dem Schrecken davon.", logKind: "info" },
            failure: { injuryWeeksOut: 4, injuryLabel: "Schleudertrauma", morale: -5, logText: "hat bei einem doch nicht ganz vermiedenen Unfall eine Verletzung davongetragen.", logKind: "negative" },
          },
        },
      ],
    }),
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
];

export function eligibleTemplates(
  player: Player,
  usedTemplateIds: Set<string>
): EventTemplate[] {
  return EVENT_TEMPLATES.filter((t) => {
    if (player.age < t.minAge || player.age > t.maxAge) return false;
    if (t.unique && usedTemplateIds.has(t.id)) return false;
    if (t.condition && !t.condition(player)) return false;
    return true;
  });
}

export function clampAttributes(p: Player) {
  for (const key of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) {
    p.attributes[key] = clamp(p.attributes[key], 1, 99);
  }
}
