import type { Position } from "./types";

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
