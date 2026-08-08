// Sharepic für das Karriereende: eine Canvas-2D-Zeichenroutine, die eine
// kompakte FUT-artige "Sammelkarte" mit den Karriere-Highlights erzeugt -
// gedacht zum Herunterladen/Teilen in sozialen Medien. Bewusst als reine
// Funktion gehalten (kein DOM außer dem übergebenen Canvas), damit sie
// unabhängig von React testbar bleibt.
//
// Layout v2 (siehe footy-karriere-mockup.html ".card-v2"/".cv2-*"): deutlich
// kompakter als die ursprüngliche Version - Rating+Identität nebeneinander
// statt gestapelt, dichte 6er-Statreihe, eigene Trophäen-Kategorie-Reihe mit
// Icons statt einer reinen Gesamtzahl, ein Karrierehöhepunkt-Satz.

import type { Achievement, Player, SeasonStats } from "./types";
import { POSITION_LABEL } from "./types";
import { COUNTRIES } from "./leagues";
import { overallRating } from "./careerEngine";
import { overallTier } from "./labels";

/** Aufschlüsselung der Titel-Gesamtzahl nach den fünf in der Sharepic-Trophäenreihe
 * gezeigten Kategorien - reine Anzeige-Aggregation aus den bestehenden Daten
 * (`Player.careerTotals.trophies`/`SeasonStats.promoted`), das Titel-Tracking-
 * Datenmodell selbst bleibt unverändert. Die oben in der Statreihe gezeigte
 * Gesamt-"Titel"-Zahl ist bewusst die Summe dieser fünf Werte (statt der rohen
 * `trophies.length`, die auch individuelle Auszeichnungen wie "Spieler der
 * Saison" mitzählt) - siehe `buildShareCardData`. */
export interface TrophyBreakdown {
  meister: number;
  pokal: number;
  euroCup: number;
  cl: number;
  aufstieg: number;
}

/** Der "Karrierehöhepunkt"-Satz, aufgeteilt in einen normalen und einen
 * hervorgehobenen (fett/gold) Teil, damit die Zeichenroutine beide Teile
 * unterschiedlich einfärben kann. */
export interface CareerHighlight {
  bold: string;
  rest: string;
}

function computeTrophyBreakdown(player: Player): TrophyBreakdown {
  const t = player.careerTotals.trophies;
  return {
    meister: t.filter((x) => x === "Meisterschale" || x === "Zweitliga-Meisterschaft").length,
    pokal: t.filter((x) => x === "Landespokal").length,
    euroCup: t.filter((x) => x === "Europa Cup").length,
    cl: t.filter((x) => x === "Champions Cup").length,
    aufstieg: player.seasonHistory.filter((s) => s.promoted).length,
  };
}

/** Extrahiert die erste vierstellige Jahreszahl aus einem Saison-Label
 * ("Saison 2031/32" -> "2031") - kein eigenes Jahres-Feld in `SeasonStats`
 * nötig, das Label enthält es bereits. */
function seasonYear(seasonLabel: string): string {
  return seasonLabel.match(/\d{4}/)?.[0] ?? "";
}

/** Bestimmt das "bedeutendste Ereignis" der Karriere für die Highlight-Zeile:
 * internationaler Titel > nationale Meisterschaft > Pokal > sonstige (positive)
 * Achievements, bei Gleichstand innerhalb einer Stufe das neueste zuerst. Reine
 * Priorisierungs-Regel für die Anzeige - das Legacy-/Achievement-System selbst
 * bleibt unverändert. */
function computeCareerHighlight(player: Player, achievements: Achievement[]): CareerHighlight | null {
  const history = player.seasonHistory;
  const findSeason = (has: (s: SeasonStats) => boolean) => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (has(history[i])) return history[i];
    }
    return null;
  };

  const europeanSeason = findSeason((s) => s.trophies.includes("Champions Cup") || s.trophies.includes("Europa Cup"));
  if (europeanSeason) {
    const competition = europeanSeason.trophies.includes("Champions Cup") ? "Champions-Cup-Sieger" : "Europa-Cup-Sieger";
    return { bold: competition, rest: ` mit ${europeanSeason.club} (${seasonYear(europeanSeason.seasonLabel)})` };
  }

  const championSeason = findSeason((s) => s.trophies.includes("Meisterschale") || s.trophies.includes("Zweitliga-Meisterschaft"));
  if (championSeason) {
    const label = championSeason.trophies.includes("Meisterschale") ? "Meister" : "Zweitliga-Meister";
    return { bold: label, rest: ` mit ${championSeason.club} (${seasonYear(championSeason.seasonLabel)})` };
  }

  const cupSeason = findSeason((s) => s.trophies.includes("Landespokal"));
  if (cupSeason) {
    return { bold: "Pokalsieger", rest: ` mit ${cupSeason.club} (${seasonYear(cupSeason.seasonLabel)})` };
  }

  const bestAchievement = achievements.find((a) => a.positive);
  if (bestAchievement) return { bold: bestAchievement.label, rest: "" };

  return null;
}

export interface ShareCardData {
  name: string;
  positionLabel: string;
  flag: string;
  countryName: string;
  finalClub: string;
  ageRange: string;
  /** Karriere-Bestwert (höchste je erreichte Gesamtstärke) - das ist die Zahl, die groß im Badge steht. */
  overall: number;
  tierLabel: string;
  tierClassName: string;
  legacyTier: string;
  legacyScore: number;
  matches: number;
  isGoalkeeper: boolean;
  goals: number;
  assists: number;
  /** NUR relevant für `isGoalkeeper`, sonst 0. */
  cleanSheets: number;
  /** NUR relevant für `isGoalkeeper`, sonst 0 - Spiele-gewichteter Karriere-Durchschnitt. */
  savePercentage: number;
  /** Summe der fünf Trophäen-Kategorien (siehe `TrophyBreakdown`) - bewusst NICHT
   * `careerTotals.trophies.length`, siehe dort. */
  trophies: number;
  trophyBreakdown: TrophyBreakdown;
  highlight: CareerHighlight | null;
  caps: number;
  achievementLabels: string[];
}

export function buildShareCardData(
  player: Player,
  legacyScore: number | undefined,
  legacyTier: string | undefined,
  achievements: Achievement[] | undefined
): ShareCardData {
  // Heimatland statt aktuellem/letztem Verein-Land: die Nationalität eines Spielers
  // ändert sich nicht durch Vereinswechsel - im Sharepic soll immer die Flagge des
  // Landes stehen, in dem der Spieler geboren wurde.
  const country = COUNTRIES.find((c) => c.id === player.homeCountryId);
  // Karriere-Bestwert statt aktuellem Wert: nach Alterung/Abbau am Karriereende wäre die
  // aktuelle Gesamtstärke oft niedriger als der tatsächliche Karriere-Höhepunkt - das
  // Sharepic soll aber genau diesen Höhepunkt feiern.
  const overall = Math.max(overallRating(player), ...player.seasonHistory.map((s) => s.overallRating));
  const tier = overallTier(overall);
  const topAchievements = (achievements ?? []).filter((a) => a.positive).slice(0, 4);
  const isGoalkeeper = player.position === "TW";
  // Karriere-Paradenquote als Spiele-gewichteter Durchschnitt (siehe dieselbe
  // Berechnung in CareerEnd.tsx) - kein eigenes Career-Totals-Feld, da sich ein
  // Prozentwert nicht sinnvoll über Saisons aufsummieren lässt.
  const gkSeasons = player.seasonHistory.filter((s) => s.matches > 0);
  const savePercentage =
    gkSeasons.length > 0
      ? Math.round(gkSeasons.reduce((s, h) => s + h.savePercentage * h.matches, 0) / gkSeasons.reduce((s, h) => s + h.matches, 0))
      : 0;
  const trophyBreakdown = computeTrophyBreakdown(player);
  return {
    name: player.name,
    positionLabel: POSITION_LABEL[player.position],
    flag: country?.flag ?? "🏳️",
    countryName: country?.name ?? player.club.country,
    finalClub: player.club.name,
    ageRange: `${player.birthAge}-${player.age}`,
    overall,
    tierLabel: tier.label,
    tierClassName: tier.className,
    legacyTier: legacyTier ?? "",
    legacyScore: legacyScore ?? 0,
    matches: player.careerTotals.matches,
    isGoalkeeper,
    goals: player.careerTotals.goals,
    assists: player.careerTotals.assists,
    cleanSheets: player.careerTotals.cleanSheets,
    savePercentage,
    trophies: trophyBreakdown.meister + trophyBreakdown.pokal + trophyBreakdown.euroCup + trophyBreakdown.cl + trophyBreakdown.aufstieg,
    trophyBreakdown,
    highlight: computeCareerHighlight(player, achievements ?? []),
    caps: player.nationalTeamCaps,
    achievementLabels: topAchievements.map((a) => a.label),
  };
}

// Farben aus dem "Matchday Dossier"-Design-System (design-tokens.md) - Gold statt
// bunter Edelmetall-/Fantasie-Töne für die oberen Stufen, damit das Sharepic
// dieselbe Tannengrün+Gold-Sprache wie der Rest der App spricht. Bronze/Silber
// behalten ihre naheliegenden Metallfarben als einzige Ausnahme (klar lesbare
// Stufenmetapher), alles andere bleibt innerhalb der Kern-Palette.
const CHALK = "#e8e4d8";
const CHALK_DIM = "#9fb3a8";

const TIER_STYLE: Record<string, { bgFrom: string; bgTo: string; accent: string; accentSoft: string }> = {
  amateur: { bgFrom: "#16241d", bgTo: "#0b1b14", accent: CHALK_DIM, accentSoft: "rgba(159,179,168,0.14)" },
  bronze: { bgFrom: "#2f2013", bgTo: "#0b1b14", accent: "#cd7f32", accentSoft: "rgba(205,127,50,0.18)" },
  silver: { bgFrom: "#1c2b23", bgTo: "#0b1b14", accent: "#c9d3cb", accentSoft: "rgba(201,211,203,0.16)" },
  gold: { bgFrom: "#2a2210", bgTo: "#0b1b14", accent: "#e6c158", accentSoft: "rgba(230,193,88,0.2)" },
  elite: { bgFrom: "#2e2311", bgTo: "#0b1b14", accent: "#f6e3ad", accentSoft: "rgba(246,227,173,0.22)" },
  icon: { bgFrom: "#332812", bgTo: "#050f0a", accent: "#f6e3ad", accentSoft: "rgba(246,227,173,0.28)" },
};

// Deutlich kompakteres Seitenverhältnis als die ursprüngliche 4:5-Version -
// nahe an der quadratischen "echten Sammelkarte" aus dem card-v2-Mockup
// (~390:395), statt eines langen Screens mit viel Weißraum am Ende.
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1010;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Schrumpft die Schriftgröße, bis der Text in `maxWidth` passt (oder `minSize`
 * erreicht ist) - reicht bei normal langen Namen/Texten. */
function fitTextSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number, minSize: number, weight = "700"): number {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

/** Härterer Fallback für Extremfälle, in denen selbst `minSize` noch überläuft
 * (siehe Bugreport "FOOTCA wurde zu FOOTCA bzw. Alter riss ab") - schneidet
 * zeichenweise und hängt "…" an, statt den Text einfach über den Rand laufen
 * zu lassen. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** Zeichnet eine Reihe SVG-Pfaddaten (aus dem Mockup 1:1 übernommen, viewBox
 * 0 0 24 24) zentriert bei (cx, cy) in Kantenlänge `size` - Skalierung über
 * `ctx.scale`, damit `strokeWidth` (in Mockup-Einheiten) proportional zur
 * Icongröße bleibt, exakt wie SVG `stroke-width` relativ zur `viewBox`. */
function drawIconPaths(ctx: CanvasRenderingContext2D, paths: string[], cx: number, cy: number, size: number, strokeWidth: number, color: string) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const d of paths) {
    ctx.stroke(new Path2D(d));
  }
  ctx.restore();
}

/** Ring-Icon (Euro Cup) besteht aus einem gestrichelten... nein, einem
 * gestrichenen Kreis + sechs gefüllten Punkten - beides über native
 * `ctx.arc`-Aufrufe statt Path2D, da hier reine Kreise genügen. */
function drawRingIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(12 * s, 12 * s, 8.5 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  const dots: [number, number][] = [
    [12, 4.3],
    [18.2, 8.2],
    [18.2, 15.8],
    [12, 19.7],
    [5.8, 15.8],
    [5.8, 8.2],
  ];
  for (const [dx, dy] of dots) {
    ctx.beginPath();
    ctx.arc(dx * s, dy * s, 1 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const TROPHY_ICON_PATHS: Record<"meister" | "pokal" | "cl" | "aufstieg", { paths: string[]; strokeWidth: number }> = {
  meister: {
    paths: ["M12 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z", "M12 8.5l1.1 2.3 2.5.4-1.8 1.8.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.8 2.5-.4z"],
    strokeWidth: 1.4,
  },
  pokal: {
    paths: ["M7 3h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V3z", "M7 4H4v2a4 4 0 0 0 4 4M17 4h3v2a4 4 0 0 1-4 4", "M12 12v3M9 19h6M9 19l.5-2h5l.5 2"],
    strokeWidth: 1.4,
  },
  cl: {
    paths: [
      "M9 3h6v5a3 3 0 0 1-3 3 3 3 0 0 1-3-3V3z",
      "M9 4.5H5.5a2 2 0 0 0-2 2v.5a3.5 3.5 0 0 0 3.5 3.5H9M15 4.5h3.5a2 2 0 0 1 2 2v.5a3.5 3.5 0 0 1-3.5 3.5H15",
      "M12 11v3.5M9.5 19h5M9.5 19l.4-2h4.2l.4 2",
    ],
    strokeWidth: 1.3,
  },
  aufstieg: {
    paths: ["M12 20V6", "M6.5 11.5L12 5l5.5 6.5"],
    strokeWidth: 1.6,
  },
};

interface RichWord {
  text: string;
  bold: boolean;
}

/** Zentrierter, ggf. mehrzeiliger Fließtext mit teils fett/goldenen Wörtern
 * (für die Karrierehöhepunkt-Zeile: "Karrierehöhepunkt: **X** mit Y (Jahr)").
 * Bricht bei Bedarf zeilenweise um wie ein normaler Fließtext, behält dabei
 * pro Wort seine Farbe/Gewichtung - der hervorgehobene Teil selbst wird nie
 * mitten im Wort umgebrochen. Gibt die Anzahl gezeichneter Zeilen zurück. */
function drawRichCenteredText(
  ctx: CanvasRenderingContext2D,
  words: RichWord[],
  centerX: number,
  startY: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
  normalColor: string,
  boldColor: string
): number {
  const normalFont = `500 ${size}px "Segoe UI", system-ui, sans-serif`;
  const boldFont = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
  const spaceWidth = (() => {
    ctx.font = normalFont;
    return ctx.measureText(" ").width;
  })();

  const lines: RichWord[][] = [];
  let current: RichWord[] = [];
  let currentWidth = 0;
  for (const word of words) {
    ctx.font = word.bold ? boldFont : normalFont;
    const w = ctx.measureText(word.text).width;
    const extra = current.length > 0 ? spaceWidth + w : w;
    if (currentWidth + extra > maxWidth && current.length > 0) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(word);
    currentWidth += current.length > 1 ? spaceWidth + w : w;
  }
  if (current.length > 0) lines.push(current);

  ctx.textAlign = "left";
  let y = startY;
  for (const line of lines) {
    const widths = line.map((w) => {
      ctx.font = w.bold ? boldFont : normalFont;
      return ctx.measureText(w.text).width;
    });
    const totalWidth = widths.reduce((s, w) => s + w, 0) + spaceWidth * (line.length - 1);
    let x = centerX - totalWidth / 2;
    for (let i = 0; i < line.length; i++) {
      ctx.font = line[i].bold ? boldFont : normalFont;
      ctx.fillStyle = line[i].bold ? boldColor : normalColor;
      ctx.fillText(line[i].text, x, y);
      x += widths[i] + spaceWidth;
    }
    y += lineHeight;
  }
  ctx.textAlign = "center";
  return lines.length;
}

/** Zeichnet die komplette Sharepic-Karte auf den übergebenen Canvas. */
export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = SHARE_CARD_WIDTH;
  const H = SHARE_CARD_HEIGHT;
  canvas.width = W;
  canvas.height = H;
  const style = TIER_STYLE[data.tierClassName] ?? TIER_STYLE.amateur;
  const PAD = 44;
  const contentW = W - PAD * 2;

  // Hintergrund
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, style.bgFrom);
  bg.addColorStop(0.55, "#0b1b14");
  bg.addColorStop(1, "#05100b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Dezenter Glanz-Kreis oben
  const glow = ctx.createRadialGradient(W / 2, 220, 40, W / 2, 220, 420);
  glow.addColorStop(0, style.accentSoft);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Rahmen
  ctx.strokeStyle = "rgba(201,162,39,0.45)";
  ctx.lineWidth = 3;
  roundRect(ctx, 12, 12, W - 24, H - 24, 16);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Branding-Kopfzeile
  ctx.fillStyle = CHALK_DIM;
  ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("⚽ FOOTCA", W / 2, 68);

  // ---- Kopf-Zeile: Rating-Box + Identität nebeneinander ----
  const topRowY = 106;
  const ratingSize = 204;
  const ratingX = PAD;
  const identityX = PAD + ratingSize + 36;
  const identityW = W - PAD - identityX;

  const ratingGrad = ctx.createLinearGradient(ratingX, topRowY, ratingX, topRowY + ratingSize);
  ratingGrad.addColorStop(0, style.accentSoft);
  ratingGrad.addColorStop(1, "rgba(11,27,20,0.6)");
  ctx.fillStyle = ratingGrad;
  roundRect(ctx, ratingX, topRowY, ratingSize, ratingSize, 12);
  ctx.fill();
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 3;
  roundRect(ctx, ratingX, topRowY, ratingSize, ratingSize, 12);
  ctx.stroke();

  ctx.fillStyle = style.accent;
  ctx.font = '800 96px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(String(data.overall), ratingX + ratingSize / 2, topRowY + 122);
  ctx.font = '700 24px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = CHALK;
  ctx.fillText(data.tierLabel.toUpperCase(), ratingX + ratingSize / 2, topRowY + 162);

  ctx.textAlign = "left";
  let idY = topRowY + 58;
  const nameSize = fitTextSize(ctx, data.name.toUpperCase(), identityW, 62, 32, "800");
  ctx.font = `800 ${nameSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = CHALK;
  ctx.fillText(ellipsize(ctx, data.name.toUpperCase(), identityW), identityX, idY);

  idY += 46;
  const metaLine = `${data.positionLabel} · ${data.flag} ${data.countryName} · ${data.ageRange} Jahre`;
  const metaSize = fitTextSize(ctx, metaLine, identityW, 27, 17, "500");
  ctx.font = `500 ${metaSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = CHALK_DIM;
  ctx.fillText(ellipsize(ctx, metaLine, identityW), identityX, idY);

  idY += 38;
  const clubLine = `Letzter Verein: ${data.finalClub}`;
  const clubSize = fitTextSize(ctx, clubLine, identityW, 23, 16, "500");
  ctx.font = `500 ${clubSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = CHALK_DIM;
  ctx.globalAlpha = 0.85;
  ctx.fillText(ellipsize(ctx, clubLine, identityW), identityX, idY);
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";

  let cursorY = topRowY + ratingSize + 40;

  // ---- Auszeichnungs-Badge ----
  const badgeH = 62;
  ctx.fillStyle = style.accentSoft;
  roundRect(ctx, PAD, cursorY, contentW, badgeH, 6);
  ctx.fill();
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 2;
  roundRect(ctx, PAD, cursorY, contentW, badgeH, 6);
  ctx.stroke();
  ctx.fillStyle = style.accent;
  const badgeTextSize = fitTextSize(ctx, data.legacyTier.toUpperCase(), contentW - 60, 30, 18, "800");
  ctx.font = `800 ${badgeTextSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(ellipsize(ctx, data.legacyTier.toUpperCase(), contentW - 60), W / 2, cursorY + badgeH / 2 + badgeTextSize * 0.35);
  cursorY += badgeH + 32;

  // ---- Dichte 6er-Statreihe ----
  const stats: [string, string][] = data.isGoalkeeper
    ? [
        [String(data.matches), "Sp."],
        [String(data.cleanSheets), "Weiße Westen"],
        [`${data.savePercentage}%`, "Bälle"],
        [String(data.trophies), "Titel"],
        [String(data.caps), "Länd."],
        [String(data.legacyScore), "Legacy"],
      ]
    : [
        [String(data.matches), "Sp."],
        [String(data.goals), "Tore"],
        [String(data.assists), "Vorl."],
        [String(data.trophies), "Titel"],
        [String(data.caps), "Länd."],
        [String(data.legacyScore), "Legacy"],
      ];
  const statRowH = 96;
  ctx.strokeStyle = "rgba(42,74,60,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, cursorY);
  ctx.lineTo(W - PAD, cursorY);
  ctx.moveTo(PAD, cursorY + statRowH);
  ctx.lineTo(W - PAD, cursorY + statRowH);
  ctx.stroke();
  const statColW = contentW / stats.length;
  for (let i = 0; i < stats.length; i++) {
    const cx = PAD + statColW * i + statColW / 2;
    ctx.fillStyle = CHALK;
    ctx.font = '700 38px "JetBrains Mono", monospace';
    ctx.fillText(stats[i][0], cx, cursorY + 50);
    ctx.fillStyle = CHALK_DIM;
    const labelSize = fitTextSize(ctx, stats[i][1], statColW - 6, 17, 12, "500");
    ctx.font = `500 ${labelSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(ellipsize(ctx, stats[i][1], statColW - 6), cx, cursorY + 76);
  }
  cursorY += statRowH + 28;

  // ---- Trophäen-Kategorie-Reihe (Meister/Pokal/Euro Cup/CL/Aufstieg) ----
  ctx.strokeStyle = "rgba(42,74,60,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, cursorY);
  ctx.lineTo(W - PAD, cursorY);
  ctx.stroke();
  cursorY += 30;
  const trophyItems: { key: "meister" | "pokal" | "euroCup" | "cl" | "aufstieg"; label: string; count: number }[] = [
    { key: "meister", label: "Meister", count: data.trophyBreakdown.meister },
    { key: "pokal", label: "Pokal", count: data.trophyBreakdown.pokal },
    { key: "euroCup", label: "Euro Cup", count: data.trophyBreakdown.euroCup },
    { key: "cl", label: "CL", count: data.trophyBreakdown.cl },
    { key: "aufstieg", label: "Aufstieg", count: data.trophyBreakdown.aufstieg },
  ];
  const trophyColW = contentW / trophyItems.length;
  const iconSize = 48;
  const iconCy = cursorY + iconSize / 2;
  for (let i = 0; i < trophyItems.length; i++) {
    const item = trophyItems[i];
    const cx = PAD + trophyColW * i + trophyColW / 2;
    if (item.key === "euroCup") {
      drawRingIcon(ctx, cx, iconCy, iconSize, style.accent);
    } else {
      const icon = TROPHY_ICON_PATHS[item.key];
      drawIconPaths(ctx, icon.paths, cx, iconCy, iconSize, icon.strokeWidth, style.accent);
    }
    ctx.fillStyle = style.accent;
    ctx.font = '700 32px "JetBrains Mono", monospace';
    ctx.fillText(`${item.count}×`, cx, cursorY + iconSize + 38);
    ctx.fillStyle = CHALK_DIM;
    const labelSize = fitTextSize(ctx, item.label, trophyColW - 6, 17, 11, "500");
    ctx.font = `500 ${labelSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(ellipsize(ctx, item.label, trophyColW - 6), cx, cursorY + iconSize + 62);
  }
  cursorY += iconSize + 82;

  // ---- Karrierehöhepunkt ----
  if (data.highlight) {
    const words: RichWord[] = [
      { text: "Karrierehöhepunkt:", bold: false },
      ...data.highlight.bold.split(" ").map((w) => ({ text: w, bold: true })),
      ...data.highlight.rest.trim().split(" ").filter(Boolean).map((w) => ({ text: w, bold: false })),
    ];
    const lines = drawRichCenteredText(ctx, words, W / 2, cursorY + 24, contentW - 40, 27, 36, CHALK_DIM, style.accent);
    cursorY += 24 + lines * 36 + 10;
  }

  // ---- Achievement-Chips ----
  if (data.achievementLabels.length > 0) {
    const chipPadding = 22;
    const chipGap = 14;
    const chipH = 50;
    ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
    const chipWidths = data.achievementLabels.map((l) => ctx.measureText(l).width + chipPadding * 2);
    const maxRowWidth = contentW;
    const lines: { labels: string[]; widths: number[] }[] = [];
    let curLabels: string[] = [];
    let curWidths: number[] = [];
    let curWidth = 0;
    for (let i = 0; i < data.achievementLabels.length; i++) {
      const w = chipWidths[i];
      if (curWidth + w + (curLabels.length > 0 ? chipGap : 0) > maxRowWidth && curLabels.length > 0) {
        lines.push({ labels: curLabels, widths: curWidths });
        curLabels = [];
        curWidths = [];
        curWidth = 0;
      }
      curLabels.push(data.achievementLabels[i]);
      curWidths.push(w);
      curWidth += w + (curLabels.length > 1 ? chipGap : 0);
    }
    if (curLabels.length > 0) lines.push({ labels: curLabels, widths: curWidths });

    let rowY = cursorY;
    for (const line of lines) {
      const totalW = line.widths.reduce((s, w) => s + w, 0) + chipGap * (line.widths.length - 1);
      let x = (W - totalW) / 2;
      for (let i = 0; i < line.labels.length; i++) {
        const w = line.widths[i];
        ctx.fillStyle = "rgba(19,39,32,1)";
        roundRect(ctx, x, rowY, w, chipH, chipH / 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(42,74,60,0.9)";
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, rowY, w, chipH, chipH / 2);
        ctx.stroke();
        ctx.fillStyle = CHALK;
        ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(line.labels[i], x + w / 2, rowY + chipH / 2 + 8);
        x += w + chipGap;
      }
      rowY += chipH + 14;
    }
  }

  // Footer
  ctx.fillStyle = "rgba(159,179,168,0.7)";
  ctx.font = '500 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("Erstellt mit Footca", W / 2, H - 30);
}

/** Kurzer Beschreibungstext zum Mitkopieren beim Teilen (Caption für Social Media). */
export function buildShareCaption(data: ShareCardData): string {
  const achievementsPart = data.achievementLabels.length > 0 ? ` 🏅 ${data.achievementLabels.join(", ")}.` : "";
  const productionPart = data.isGoalkeeper
    ? `${data.cleanSheets} weiße Westen, ${data.savePercentage}% gehaltene Bälle`
    : `${data.goals} Tore, ${data.assists} Vorlagen`;
  const highlightPart = data.highlight ? ` Karrierehöhepunkt: ${data.highlight.bold}${data.highlight.rest}.` : "";
  return `⚽ Meine Fußball-Karriere als ${data.name}: ${data.legacyTier} mit ${data.overall} Gesamtstärke (Karriere-Bestwert)! ${data.matches} Spiele, ${productionPart}, ${data.trophies} Titel.${highlightPart}${achievementsPart} Gespielt mit Footca.`;
}
