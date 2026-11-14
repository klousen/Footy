// Leistungsdaten von Understat (kostenlos, JSON, deckt die Bundesliga ab).
//   GET https://understat.com/getLeagueData/Bundesliga/{saisonstartjahr}
// Liefert pro Spieler u. a. games, time (Minuten), goals, assists, xG, xA, team_title.
// Genutzt als Zusatzsignal: wer viel spielt und hohe xG+xA pro 90 hat, punktet
// voraussichtlich weiter; wer kaum Minuten bekommt, verliert eher an Wert.

import { namesMatch } from "./comanalytics";

export interface UnderstatPlayer {
  name: string;
  team: string;
  games: number;
  minutes: number;
  xgPer90: number;
  xaPer90: number;
  minutesShare: number; // Anteil gespielter Minuten an möglichen Minuten (0..1)
}

export function currentSeason(d = new Date()): number {
  // Saison startet im Juli/August
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

type Raw = { player_name: string; team_title: string; games: string; time: string; xG: string; xA: string };

export function parseUnderstat(raw: { players?: Raw[]; teams?: Record<string, { history?: unknown[] }> }): UnderstatPlayer[] {
  const teamGames = new Map<string, number>();
  for (const t of Object.values(raw.teams || {}) as { title?: string; history?: unknown[] }[]) {
    if (t.title) teamGames.set(t.title, (t.history || []).length);
  }
  const maxGames = Math.max(1, ...teamGames.values());
  return (raw.players || []).map((p) => {
    const minutes = Number(p.time) || 0;
    const per90 = minutes > 0 ? 90 / minutes : 0;
    const team = String(p.team_title || "").split(",").pop()!.trim();
    const possible = (teamGames.get(team) || maxGames) * 90;
    return {
      name: p.player_name,
      team,
      games: Number(p.games) || 0,
      minutes,
      xgPer90: (Number(p.xG) || 0) * per90,
      xaPer90: (Number(p.xA) || 0) * per90,
      minutesShare: possible ? Math.min(1, minutes / possible) : 0,
    };
  });
}

export async function fetchUnderstat(season = currentSeason()): Promise<UnderstatPlayer[]> {
  const res = await fetch(`https://understat.com/getLeagueData/Bundesliga/${season}`, {
    headers: { "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Understat ${res.status}`);
  return parseUnderstat(await res.json());
}

const normClub = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|sv|vfl|vfb|tsg|sc|1\.|fsv|borussia|bayer|rb|eintracht|1899|04|05|09|1846|1848|1910)\b/g, "")
    .replace(/[^a-z]/g, "");

function clubsMatch(a: string, b: string) {
  const A = normClub(a);
  const B = normClub(b);
  return !!A && !!B && (A.includes(B) || B.includes(A) || A.slice(0, 5) === B.slice(0, 5));
}

export function matchUnderstat(name: string, club: string, list: UnderstatPlayer[]): UnderstatPlayer | undefined {
  const byName = list.filter((u) => namesMatch(name, u.name));
  if (byName.length === 1) return byName[0];
  return byName.find((u) => clubsMatch(club, u.team));
}
