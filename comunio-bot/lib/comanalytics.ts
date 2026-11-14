// Liest die öffentlichen Spielerprofile auf com-analytics.de/player/{id}.
// Dort stehen serverseitig: Marktwert, Prognose (nächster Tag), Empfehlung, Änderung (7 Tage).
// Die Übersichtstabellen werden per JavaScript nachgeladen und eignen sich daher nicht.
// Höflich bleiben: nur Kader + Transfermarkt abrufen, wenige parallele Anfragen.

import * as cheerio from "cheerio";
import type { CaData } from "./types";

const BASE = "https://com-analytics.de";

export function parseGermanInt(s: string | undefined | null): number | null {
  if (!s) return null;
  const neg = /^[\s]*[-−]/.test(s);
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  return (neg ? -1 : 1) * Number(digits);
}

function parseGermanFloat(s: string | undefined | null): number | null {
  if (!s) return null;
  const clean = s.replace(/[−]/g, "-").replace(/\./g, "").replace(",", ".").replace(/[^\d.+-]/g, "");
  const x = parseFloat(clean);
  return Number.isFinite(x) ? x : null;
}

const MONEY = String.raw`[-−+]?\d{1,3}(?:\.\d{3})+`;

// Sucht ein Label-Element und nimmt den Text des nächsten Wertelements (dt/dd, th/td, Geschwister).
function labelValue($: cheerio.CheerioAPI, label: RegExp): string | null {
  let found: string | null = null;
  $("dt, th, td, span, div, strong, b, label, p").each((_, el) => {
    if (found) return;
    const own = $(el).clone().children().remove().end().text().replace(/\s+/g, " ").trim();
    if (!label.test(own) || own.length > 40) return;
    const next = $(el).next();
    const t = next.text().replace(/\s+/g, " ").trim();
    if (t) found = t;
  });
  return found;
}

export function parseCaProfile(html: string, caId: string): CaData {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ");

  const name =
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    $("title").text().replace(/com-analytics\.de\s*-?\s*/i, "").trim();

  const pick = (label: RegExp, rx: RegExp): string | null => {
    const lv = labelValue($, label);
    if (lv) {
      const m = lv.match(rx);
      if (m) return m[1] ?? m[0];
    }
    const m = text.match(new RegExp(label.source.replace(/^\^/, "") + String.raw`\s*\d?\s*:?\s*` + rx.source, "i"));
    return m ? (m[1] ?? null) : null;
  };

  const marketValue = parseGermanInt(pick(/^Marktwert/, new RegExp(`(${MONEY})`)));
  const prognose = parseGermanInt(pick(/^Prognose/, new RegExp(`(${MONEY})`)));
  const empfehlungRaw = pick(/^Empfehlung/, /([A-Za-zÄÖÜäöü]+)/);
  const empfehlung = empfehlungRaw ? empfehlungRaw[0].toUpperCase() + empfehlungRaw.slice(1).toLowerCase() : null;

  const ch = text.match(/Änderung \(7 Tage\)\s*:?\s*[-−+]?[\d.]+\s*\/\s*([-−+]?[\d,]+)\s*%/);
  const change7dPct = ch ? parseGermanFloat(ch[1]) : null;

  return { caId, name, marketValue, prognose, empfehlung, change7dPct, fetchedAt: new Date().toISOString() };
}

export async function fetchCaProfile(caId: string): Promise<CaData | null> {
  const res = await fetch(`${BASE}/player/${caId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; private-comunio-helper)", Accept: "text/html" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return parseCaProfile(await res.text(), caId);
}

// Namensabgleich: com-analytics nutzt Kurzformen wie "M. Vušković".
export function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z\s.-]/g, "")
      .trim();
  const last = (s: string) => norm(s).split(/[\s.]+/).filter(Boolean).pop() || "";
  const A = norm(a);
  const B = norm(b);
  return !!A && !!B && (A === B || last(a) === last(b) || A.includes(last(b)) || B.includes(last(a)));
}

// Holt Daten für eine Liste von Spielern. Annahme: com-analytics nutzt die Comunio-IDs.
// Passt der Name nicht, wird der Spieler als "unmapped" gemeldet (Override per CA_ID_OVERRIDES).
export async function fetchCaForPlayers(
  players: { id: string; name: string }[],
  overrides: Record<string, string>,
  concurrency = 4,
): Promise<{ data: Map<string, CaData>; unmapped: string[] }> {
  const data = new Map<string, CaData>();
  const unmapped: string[] = [];
  const queue = [...players];
  async function worker() {
    while (queue.length) {
      const p = queue.shift()!;
      const caId = overrides[p.id] || p.id;
      try {
        const d = await fetchCaProfile(caId);
        if (d && (overrides[p.id] || namesMatch(p.name, d.name)) && (d.prognose || d.empfehlung)) data.set(p.id, d);
        else unmapped.push(`${p.name} (${p.id})`);
      } catch {
        unmapped.push(`${p.name} (${p.id})`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { data, unmapped };
}
