import type { Club, LeagueTier, Position } from "./types";

// Fiktive Welt, um keine echten Vereine/Ligen/Spieler zu verwenden.

export const FIRST_NAMES = [
  "Jonas", "Luca", "Finn", "Elias", "Noah", "Milo", "Tim", "David", "Kevin",
  "Marco", "Jamal", "Aaron", "Yusuf", "Leon", "Niklas", "Bastian", "Omar",
  "Rafael", "Mateo", "Kwame", "Diego", "Sven", "Ibrahim", "Nico", "Tomás",
];

export const LAST_NAMES = [
  "Berger", "Winkler", "Kessler", "Vogt", "Brandt", "Sommer", "Hartmann",
  "Reiter", "Kessling", "Adeyemi", "Rossi", "Fischer", "Novak", "Petrov",
  "Alves", "Kovač", "Lindgren", "Costa", "Weiss", "Dubois", "Nkomo", "Aydın",
];

export const LEAGUE_COUNTRIES = ["Fantasia", "Ostmark", "Rivalonien", "Nordhalla"];

export const CLUB_PREFIXES = [
  "FC", "SC", "SV", "Real", "Atlético", "Borussia", "Dynamo", "Racing", "Inter", "Union",
];

export const CLUB_NAMES = [
  "Nordstern", "Kohlenfeld", "Alcazar", "Rosso", "Talburg", "Weidenau", "Silberbach",
  "Havenport", "Rotenfels", "Sonnbrück", "Vasenheim", "Kaltenau", "Gronstadt",
  "Marburgo", "Eisenau", "Falkenrode", "Rheinstetten", "Bergstadt", "Windgard",
  "Lindenau", "Schwarzwald City", "Hochfeld", "Steinbrücken", "Sandheim",
];

export function generateClubName(rng: () => number): string {
  const prefix = CLUB_PREFIXES[Math.floor(rng() * CLUB_PREFIXES.length)];
  const name = CLUB_NAMES[Math.floor(rng() * CLUB_NAMES.length)];
  return `${prefix} ${name}`;
}

export function tierLabel(tier: LeagueTier): string {
  return ["", "1. Liga", "2. Liga", "3. Liga", "Amateurliga"][tier];
}

export function generateClub(tier: LeagueTier, rng: () => number, isNationalTeam = false): Club {
  const strengthBase = { 1: 78, 2: 60, 3: 45, 4: 30 }[tier];
  const strength = clamp(strengthBase + Math.round((rng() - 0.5) * 16), 15, 95);
  return {
    name: isNationalTeam ? "Fantasia Nationalelf" : generateClubName(rng),
    country: LEAGUE_COUNTRIES[Math.floor(rng() * LEAGUE_COUNTRIES.length)],
    tier,
    strength,
    isNationalTeam,
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const POSITION_OPTIONS: { value: Position; label: string; hint: string }[] = [
  { value: "TW", label: "Torwart", hint: "Reflexe, Ruhe, Stellungsspiel" },
  { value: "IV", label: "Innenverteidiger", hint: "Zweikampfstärke, Robustheit" },
  { value: "AV", label: "Außenverteidiger", hint: "Tempo, Zweikampf, Ausdauer" },
  { value: "ZM", label: "Zentrales Mittelfeld", hint: "Technik, Spielübersicht" },
  { value: "FS", label: "Flügelspieler", hint: "Tempo, Dribbling" },
  { value: "ST", label: "Stürmer", hint: "Abschluss, Tempo" },
];
