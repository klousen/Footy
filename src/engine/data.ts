import type { Position } from "./types";

export const FIRST_NAMES = [
  "Jonas", "Luca", "Finn", "Elias", "Noah", "Milo", "Tim", "David", "Kevin",
  "Marco", "Jamal", "Aaron", "Yusuf", "Leon", "Niklas", "Bastian", "Omar",
  "Rafael", "Mateo", "Kwame", "Diego", "Sven", "Ibrahim", "Nico", "Tomás",
];

// Für Partner:innen und andere Nebenfiguren - unabhängig vom Geschlecht des
// eigenen Spielers wird bewusst aus einem gemischten Namenspool gezogen
// (siehe `randomPartnerName`), statt nur männlich klingende Namen zu ziehen.
export const FEMALE_FIRST_NAMES = [
  "Mia", "Lena", "Sofia", "Emma", "Lea", "Amira", "Nora", "Elif", "Jana",
  "Carla", "Zoe", "Isabel", "Fatima", "Klara", "Valentina", "Anja", "Sara",
  "Ines", "Priya", "Aylin", "Camila", "Meike", "Layla", "Nika", "Marisol",
];

export const LAST_NAMES = [
  "Berger", "Winkler", "Kessler", "Vogt", "Brandt", "Sommer", "Hartmann",
  "Reiter", "Kessling", "Adeyemi", "Rossi", "Fischer", "Novak", "Petrov",
  "Alves", "Kovač", "Lindgren", "Costa", "Weiss", "Dubois", "Nkomo", "Aydın",
];

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
