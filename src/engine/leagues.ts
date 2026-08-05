// Liga-Datenbank für die Top 10 UEFA-Länder (nach Länderkoeffizient), Saison 2026/27.
//
// Es werden ausschließlich Städtenamen verwendet (keine Vereinsnamen/-logos), um
// keine echten Vereinsmarken zu verwenden. Die Zuordnung "welche Stadt spielt in
// welcher Liga" basiert auf einer Recherche der Kader für die Saison 2026/27
// (Auf-/Absteiger etc.), ist bei kleineren zweiten Ligen aber eine bestmögliche
// Annäherung und kein Echtzeit-Datenfeed. Spielt in einer Liga mehr als ein
// Verein aus derselben Stadt, wird das per angehängter römischer Ziffer
// unterschieden (z.B. "Madrid I" / "Madrid II").
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
    tier1Cities: [
      "London", "Manchester", "Liverpool", "London", "Manchester", "Liverpool",
      "London", "Newcastle", "London", "Brighton", "London", "Nottingham",
      "Birmingham", "Leeds", "Bournemouth", "Coventry", "Sunderland", "Hull",
      "Ipswich", "Fulham",
    ],
    tier2Cities: [
      "Sheffield", "Middlesbrough", "West Bromwich", "Southampton", "Norwich",
      "Wolverhampton", "Burnley", "London", "Stoke-on-Trent", "Swansea",
      "Preston", "Bristol", "Derby", "Birmingham", "Blackburn", "Watford",
      "Portsmouth", "London", "Cardiff", "Bolton", "Lincoln", "London",
      "Wrexham", "London",
    ],
  },
  {
    id: "italy",
    name: "Italien",
    flag: "🇮🇹",
    tier1Name: "Serie A",
    tier2Name: "Serie B",
    swapCount: 3,
    tier1Cities: [
      "Neapel", "Mailand", "Turin", "Mailand", "Bergamo", "Rom", "Rom",
      "Florenz", "Bologna", "Turin", "Udine", "Genua", "Como", "Cagliari",
      "Parma", "Lecce", "Sassuolo", "Venedig", "Frosinone", "Monza",
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
    tier1Cities: [
      "Madrid", "Barcelona", "Madrid", "Bilbao", "Villarreal", "Sevilla",
      "Vigo", "San Sebastián", "Sevilla", "Valencia", "Getafe", "Pamplona",
      "Madrid", "Vitoria-Gasteiz", "Barcelona", "Elche", "Valencia",
      "Santander", "A Coruña", "Málaga",
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
    tier1Cities: [
      "Paris", "Marseille", "Monaco", "Lyon", "Lille", "Nizza", "Lens",
      "Rennes", "Straßburg", "Toulouse", "Paris", "Angers", "Auxerre",
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
    tier1Cities: [
      "Porto", "Lissabon", "Lissabon", "Braga", "Guimarães", "Famalicão",
      "Lissabon", "Amadora", "Vila do Conde", "Moreira de Cónegos", "Arouca",
      "Funchal", "Estoril", "Barcelos", "Alverca", "Faro", "Funchal", "Viseu",
    ],
    tier2Cities: [
      "Tondela", "Felgueiras", "Amarante", "Coimbra", "Santa Maria da Feira",
      "Matosinhos", "Mafra", "Torres Vedras", "Vizela", "Penafiel", "Porto",
      "Lissabon", "Lissabon", "Chaves",
    ],
  },
  {
    id: "belgium",
    name: "Belgien",
    flag: "🇧🇪",
    tier1Name: "Pro League",
    tier2Name: "Challenger Pro League",
    swapCount: 2,
    tier1Cities: [
      "Brügge", "Brüssel", "Genk", "Antwerpen", "Gent", "Lüttich", "Brüssel",
      "Charleroi", "Brügge", "Mechelen", "Löwen", "Westerlo", "Sint-Truiden",
      "Beveren", "Kortrijk", "Lommel", "Zulte", "La Louvière",
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
    tier1Cities: [
      "Amsterdam", "Eindhoven", "Rotterdam", "Alkmaar", "Enschede", "Utrecht",
      "Deventer", "Rotterdam", "Nijmegen", "Sittard", "Zwolle", "Heerenveen",
      "Groningen", "Rotterdam", "IJmuiden", "Den Haag", "Leeuwarden",
      "Tilburg",
    ],
    tier2Cities: [
      "Volendam", "Breda", "Almelo", "Dordrecht", "Amsterdam", "Emmen",
      "Kerkrade", "Oss", "Arnhem", "Waalwijk", "Venlo", "Eindhoven",
      "Alkmaar", "Almere", "Doetinchem", "Helmond", "Maastricht", "Den Bosch",
      "Eindhoven", "Utrecht",
    ],
  },
  {
    id: "turkey",
    name: "Türkei",
    flag: "🇹🇷",
    tier1Name: "Süper Lig",
    tier2Name: "TFF 1. Lig",
    swapCount: 3,
    tier1Cities: [
      "Istanbul", "Istanbul", "Istanbul", "Trabzon", "Istanbul", "Konya",
      "Sivas", "Istanbul", "Alanya", "Gaziantep", "Rize", "Samsun", "Izmir",
      "Istanbul", "Ankara", "Erzurum", "Diyarbakır", "Çorum",
    ],
    tier2Cities: [
      "Antalya", "Kayseri", "Istanbul", "Bursa", "Batman", "Mardin", "Muğla",
      "Bolu", "Ankara", "Manisa", "Istanbul", "Iğdır", "Bandırma", "Ankara",
      "Istanbul", "Şanlıurfa", "Adana", "Izmir",
    ],
  },
  {
    id: "poland",
    name: "Polen",
    flag: "🇵🇱",
    tier1Name: "Ekstraklasa",
    tier2Name: "I liga",
    swapCount: 3,
    tier1Cities: [
      "Posen", "Tschenstochau", "Warschau", "Białystok", "Stettin",
      "Breslau", "Gliwice", "Krakau", "Lodz", "Zabrze", "Lubin", "Radom",
      "Kielce", "Niepołomice", "Mielec", "Lublin", "Kattowitz", "Głogów",
    ],
    tier2Cities: [
      "Danzig", "Gdynia", "Nieciecza", "Skierniewice", "Posen", "Warschau",
      "Oppeln", "Tychy", "Legnica", "Bielsko-Biała", "Krakau", "Chojnice",
      "Pruszków", "Lodz", "Rzeszów", "Kołobrzeg", "Rzeszów", "Łęczna",
    ],
  },
];

export function getCountry(id: CountryId): CountryDef {
  const c = COUNTRIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unbekanntes Land: ${id}`);
  return c;
}

/** Hängt bei mehrfach vorkommenden Städtenamen römische Ziffern an (Reihenfolge bleibt erhalten). */
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
