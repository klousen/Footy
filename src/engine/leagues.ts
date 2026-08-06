// Liga-Datenbank für die Top 10 UEFA-Länder (nach Länderkoeffizient), Saison 2026/27.
//
// Es werden ausschließlich Städte-/Stadtteilnamen verwendet (keine Vereinsnamen/
// -logos), um keine echten Vereinsmarken zu verwenden. Die Zuordnung "welche Stadt
// spielt in welcher Liga" basiert auf einer Recherche der Kader für die Saison
// 2026/27 (Auf-/Absteiger etc.), ist bei kleineren zweiten Ligen aber eine
// bestmögliche Annäherung und kein Echtzeit-Datenfeed.
//
// Spielen mehrere Vereine aus derselben Stadt in einer Liga, wird nach Möglichkeit
// der echte Stadtteil/das echte Vereinsgebiet verwendet (z.B. "London-Fulham" statt
// nur "London"), analog zu z.B. "Rom-Testaccio" vs. "Rom-Flaminio". In den seltenen
// Fällen, in denen sich zwei Vereine buchstäblich dasselbe Stadion teilen und keine
// unterscheidbare Gegend existiert (Inter/Milan im San Siro, Club Brugge/Cercle
// Brugge im Jan Breydel), wird ersatzweise nummeriert ("Mailand I"/"Mailand II").
// disambiguateCities() greift nur noch als Sicherheitsnetz für unvorhergesehene
// Dopplungen.
//
// Die Reihenfolge der Städte je Liga bildet grob die erwartete Kaderstärke ab
// (stärkere/bekanntere Vereine zuerst) und dient als Ausgangspunkt für die
// Stärkewerte im Spiel.

export type CountryId =
  | "england"
  | "italy"
  | "spain"
  | "germany"
  | "france"
  | "portugal"
  | "belgium"
  | "netherlands"
  | "turkey"
  | "poland";

export interface CountryDef {
  id: CountryId;
  name: string;
  flag: string;
  tier1Name: string;
  tier2Name: string;
  /** Anzahl Vereine, die je Saison zwischen Liga 1 und Liga 2 den Platz tauschen. */
  swapCount: number;
  /** Rang (1 = höchstes Ansehen) nach der echten UEFA-Team-Koeffizienten-Rangliste der
   * Saison 2026/27 (siehe `leaguePrestigeRank` in careerEngine.ts) - bestimmt das
   * Liga-Ansehen fürs Gehalt/Vereins-Prestige, unabhängig von der Reihenfolge dieser
   * Liste (die weiter die Anzeige-Reihenfolge auf dem Länder-Auswahlbildschirm
   * bestimmt). Hergeleitet aus der Summe der TK-Max-Werte aller Vereine einer Nation
   * in den Top 200 der UEFA-Team-Koeffizienten (Stand 04.08.2026, vom Nutzer bereitgestellt)
   * - der reale Näherungswert dafür, wie stark eine Nation über die gesamte
   * Vereinsbreite (nicht nur den Spitzenverein) im europäischen Vergleich dasteht:
   * England (Summe ca. 821) klar vorn, dann Spanien (ca. 629), Italien (ca. 610),
   * Deutschland (ca. 594) im engen Mittelfeld, Frankreich (ca. 425) als fünfte
   * Großliga, Portugal (ca. 338) klar dahinter, Belgien/Niederlande (ca. 251, nahezu
   * gleichauf) als nächste Ebene, Türkei (ca. 179) und Polen (ca. 149) am unteren
   * Ende dieser Zehnerauswahl.
   */
  uefaRank: number;
  tier1Cities: string[];
  tier2Cities: string[];
}

export const COUNTRIES: CountryDef[] = [
  {
    id: "england",
    name: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    tier1Name: "Premier League",
    tier2Name: "Championship",
    swapCount: 3,
    uefaRank: 1,
    tier1Cities: [
      "London-Islington", "Manchester-Eastlands", "Liverpool-Anfield", "London-Brentford",
      "Manchester-Old Trafford", "Liverpool-Bramley-Moore", "London-Chelsea", "Newcastle",
      "London-Selhurst", "Brighton", "London-Tottenham", "Nottingham", "Birmingham",
      "Leeds", "Bournemouth", "Coventry", "Sunderland", "Hull", "Ipswich", "London-Fulham",
    ],
    tier2Cities: [
      "Sheffield", "Middlesbrough", "West Bromwich", "Southampton", "Norwich",
      "Wolverhampton", "Burnley", "London-Millwall", "Stoke-on-Trent", "Swansea",
      "Preston", "Bristol", "Derby", "Birmingham", "Blackburn", "Watford",
      "Portsmouth", "London-Shepherds Bush", "Cardiff", "Bolton", "Lincoln",
      "London-Stratford", "Wrexham", "London-Charlton",
    ],
  },
  {
    id: "italy",
    name: "Italien",
    flag: "🇮🇹",
    tier1Name: "Serie A",
    tier2Name: "Serie B",
    swapCount: 3,
    uefaRank: 3,
    tier1Cities: [
      "Neapel", "Mailand I", "Turin-Continassa", "Mailand II", "Bergamo", "Rom-Testaccio",
      "Rom-Flaminio", "Florenz", "Bologna", "Turin-Filadelfia", "Udine", "Genua", "Como",
      "Cagliari", "Parma", "Lecce", "Sassuolo", "Venedig", "Frosinone", "Monza",
    ],
    tier2Cities: [
      "Pisa", "Verona", "Cremona", "Vicenza", "Arezzo", "Benevento", "Genua",
      "Palermo", "Bari", "Modena", "Cesena", "Cittadella", "Catanzaro",
      "Reggio Emilia", "Carrara", "Castellammare di Stabia", "La Spezia",
      "Salerno", "Mantua", "Bozen",
    ],
  },
  {
    id: "spain",
    name: "Spanien",
    flag: "🇪🇸",
    tier1Name: "La Liga",
    tier2Name: "Segunda División",
    swapCount: 3,
    uefaRank: 2,
    tier1Cities: [
      "Madrid-Chamartín", "Barcelona-Les Corts", "Madrid-Metropolitano", "Bilbao",
      "Villarreal", "Sevilla-Heliópolis", "Vigo", "San Sebastián", "Sevilla-Nervión",
      "Valencia-Mestalla", "Getafe", "Pamplona", "Madrid-Vallecas", "Vitoria-Gasteiz",
      "Barcelona-Cornellà", "Elche", "Valencia-Algirós", "Santander", "A Coruña", "Málaga",
    ],
    tier2Cities: [
      "Oviedo", "Girona", "Palma", "Teneriffa", "Elda", "León", "Andorra",
      "Almería", "Cádiz", "Gijón", "Zaragoza", "Huesca", "Albacete", "Burgos",
      "Córdoba", "Castellón", "Eibar", "Leganés", "Las Palmas", "Valladolid",
      "Miranda de Ebro", "Ceuta",
    ],
  },
  {
    id: "germany",
    name: "Deutschland",
    flag: "🇩🇪",
    tier1Name: "Bundesliga",
    tier2Name: "2. Bundesliga",
    swapCount: 2,
    uefaRank: 4,
    tier1Cities: [
      "München", "Leverkusen", "Leipzig", "Dortmund", "Frankfurt", "Stuttgart",
      "Freiburg", "Bremen", "Mönchengladbach", "Berlin", "Mainz", "Hoffenheim",
      "Augsburg", "Köln", "Hamburg", "Elversberg", "Gelsenkirchen", "Paderborn",
    ],
    tier2Cities: [
      "Heidenheim", "Hamburg", "Wolfsburg", "Berlin", "Bielefeld", "Bochum",
      "Braunschweig", "Cottbus", "Darmstadt", "Dresden", "Fürth", "Hannover",
      "Karlsruhe", "Nürnberg", "Ulm", "Münster", "Düsseldorf", "Magdeburg",
    ],
  },
  {
    id: "france",
    name: "Frankreich",
    flag: "🇫🇷",
    tier1Name: "Ligue 1",
    tier2Name: "Ligue 2",
    swapCount: 2,
    uefaRank: 5,
    tier1Cities: [
      "Paris-Auteuil", "Marseille", "Monaco", "Lyon", "Lille", "Nizza", "Lens",
      "Rennes", "Straßburg", "Toulouse", "Paris-Charléty", "Angers", "Auxerre",
      "Brest", "Le Havre", "Le Mans", "Lorient", "Troyes",
    ],
    tier2Cities: [
      "Metz", "Nantes", "Annecy", "Boulogne-sur-Mer", "Clermont-Ferrand",
      "Dijon", "Dünkirchen", "Grenoble", "Guingamp", "Laval", "Saint-Étienne",
      "Reims", "Montpellier", "Rodez", "Saint-Ouen", "Pau", "Amiens", "Bastia",
    ],
  },
  {
    id: "portugal",
    name: "Portugal",
    flag: "🇵🇹",
    tier1Name: "Primeira Liga",
    tier2Name: "Liga Portugal 2",
    swapCount: 2,
    uefaRank: 6,
    tier1Cities: [
      "Porto", "Lissabon-Benfica", "Lissabon-Alvalade", "Braga", "Guimarães",
      "Famalicão", "Lissabon-Casal Vistoso", "Amadora", "Vila do Conde",
      "Moreira de Cónegos", "Arouca", "Funchal-Choupana", "Estoril", "Barcelos",
      "Alverca", "Faro", "Funchal-Barreiros", "Viseu",
    ],
    tier2Cities: [
      "Tondela", "Felgueiras", "Amarante", "Coimbra", "Santa Maria da Feira",
      "Matosinhos", "Mafra", "Torres Vedras", "Vizela", "Penafiel", "Porto",
      "Seixal", "Alcochete", "Chaves",
    ],
  },
  {
    id: "belgium",
    name: "Belgien",
    flag: "🇧🇪",
    tier1Name: "Pro League",
    tier2Name: "Challenger Pro League",
    swapCount: 2,
    uefaRank: 7,
    tier1Cities: [
      "Brügge-Sint-Andries", "Brüssel-Anderlecht", "Genk", "Antwerpen", "Gent",
      "Lüttich", "Brüssel-Forest", "Charleroi", "Brügge-Sint-Michiels", "Mechelen",
      "Löwen", "Westerlo", "Sint-Truiden", "Beveren", "Kortrijk", "Lommel",
      "Zulte", "La Louvière",
    ],
    tier2Cities: [
      "Antwerpen", "Virton", "Hasselt", "Brüssel", "Lier", "Deinze",
      "Lüttich", "Boussu", "Charleroi", "Knokke-Heist", "Dessel", "Seraing",
    ],
  },
  {
    id: "netherlands",
    name: "Niederlande",
    flag: "🇳🇱",
    tier1Name: "Eredivisie",
    tier2Name: "Eerste Divisie",
    swapCount: 3,
    uefaRank: 8,
    tier1Cities: [
      "Amsterdam", "Eindhoven", "Rotterdam-Feijenoord", "Alkmaar", "Enschede", "Utrecht",
      "Deventer", "Rotterdam-Spangen", "Nijmegen", "Sittard", "Zwolle", "Heerenveen",
      "Groningen", "Rotterdam-Kralingen", "IJmuiden", "Den Haag", "Leeuwarden",
      "Tilburg",
    ],
    tier2Cities: [
      "Volendam", "Breda", "Almelo", "Dordrecht", "Amsterdam", "Emmen",
      "Kerkrade", "Oss", "Arnhem", "Waalwijk", "Venlo", "Eindhoven-Meerhoven",
      "Alkmaar", "Almere", "Doetinchem", "Helmond", "Maastricht", "Den Bosch",
      "Eindhoven-Woensel", "Utrecht",
    ],
  },
  {
    id: "turkey",
    name: "Türkei",
    flag: "🇹🇷",
    tier1Name: "Süper Lig",
    tier2Name: "TFF 1. Lig",
    swapCount: 3,
    uefaRank: 9,
    tier1Cities: [
      "Istanbul-Seyrantepe", "Istanbul-Kadıköy", "Istanbul-Beşiktaş", "Trabzon",
      "Istanbul-Başakşehir", "Konya", "Sivas", "Istanbul-Kasımpaşa", "Alanya",
      "Gaziantep", "Rize", "Samsun", "Izmir", "Istanbul-Eyüp", "Ankara", "Erzurum",
      "Diyarbakır", "Çorum",
    ],
    tier2Cities: [
      "Antalya", "Kayseri", "Istanbul-Karagümrük", "Bursa", "Batman", "Mardin", "Muğla",
      "Bolu", "Ankara-Eryaman", "Manisa", "Istanbul-Pendik", "Iğdır", "Bandırma",
      "Ankara-Keçiören", "Istanbul-Esenler", "Şanlıurfa", "Adana", "Izmir",
    ],
  },
  {
    id: "poland",
    name: "Polen",
    flag: "🇵🇱",
    tier1Name: "Ekstraklasa",
    tier2Name: "I liga",
    swapCount: 3,
    uefaRank: 10,
    tier1Cities: [
      "Posen", "Tschenstochau", "Warschau", "Białystok", "Stettin",
      "Breslau", "Gliwice", "Krakau", "Lodz", "Zabrze", "Lubin", "Radom",
      "Kielce", "Niepołomice", "Mielec", "Lublin", "Kattowitz", "Głogów",
    ],
    tier2Cities: [
      "Danzig", "Gdynia", "Nieciecza", "Skierniewice", "Posen", "Warschau",
      "Oppeln", "Tychy", "Legnica", "Bielsko-Biała", "Krakau", "Chojnice",
      "Pruszków", "Lodz", "Rzeszów-Baranówka", "Kołobrzeg", "Rzeszów-Staroniwa", "Łęczna",
    ],
  },
];

export function getCountry(id: CountryId): CountryDef {
  const c = COUNTRIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unbekanntes Land: ${id}`);
  return c;
}

/**
 * Sicherheitsnetz: hängt bei (unerwartet) mehrfach vorkommenden Namen römische
 * Ziffern an, damit es in der Liga-Ansicht nie zwei identische Einträge gibt.
 * Bei den oben gepflegten Daten sollte das im Regelfall nicht mehr greifen, da
 * echte Stadtteilnamen bereits eindeutig sind.
 */
export function disambiguateCities(cities: string[]): string[] {
  const counts = new Map<string, number>();
  for (const c of cities) counts.set(c, (counts.get(c) ?? 0) + 1);
  const seen = new Map<string, number>();
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
  return cities.map((c) => {
    const total = counts.get(c) ?? 1;
    if (total <= 1) return c;
    const idx = seen.get(c) ?? 0;
    seen.set(c, idx + 1);
    return `${c} ${roman[idx] ?? idx + 1}`;
  });
}
