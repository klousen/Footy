// Sharepic für das Karriereende: eine Canvas-2D-Zeichenroutine, die eine
// FUT-artige "Spielerkarte" mit den Karriere-Highlights erzeugt - gedacht zum
// Herunterladen/Teilen in sozialen Medien. Bewusst als reine Funktion gehalten
// (kein DOM außer dem übergebenen Canvas), damit sie unabhängig von React
// testbar bleibt.

import type { Achievement, Player } from "./types";
import { POSITION_LABEL } from "./types";
import { COUNTRIES } from "./leagues";
import { overallRating } from "./careerEngine";
import { overallTier } from "./labels";

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
  trophies: number;
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
    trophies: player.careerTotals.trophies.length,
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

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number, minSize: number, weight = "700"): number {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
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

  // Hintergrund
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, style.bgFrom);
  bg.addColorStop(0.55, "#0b1b14");
  bg.addColorStop(1, "#05100b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Dezenter Glanz-Kreis hinter dem Badge
  const glow = ctx.createRadialGradient(W / 2, 300, 40, W / 2, 300, 420);
  glow.addColorStop(0, style.accentSoft);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Rahmen - Gold statt neutralem Weißton, kantiger (kleinerer Radius) statt
  // stark abgerundet, passend zum 4px-Radius-Grundsatz des Design-Systems.
  ctx.strokeStyle = "rgba(201,162,39,0.45)";
  ctx.lineWidth = 3;
  roundRect(ctx, 12, 12, W - 24, H - 24, 16);
  ctx.stroke();

  // Branding oben
  ctx.textAlign = "center";
  ctx.fillStyle = CHALK_DIM;
  ctx.font = '600 26px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("⚽ FOOTCA", W / 2, 74);

  // OVR-Badge
  const badgeY = 130;
  const badgeH = 210;
  const badgeW = 320;
  const badgeX = (W - badgeW) / 2;
  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
  badgeGrad.addColorStop(0, style.accentSoft);
  badgeGrad.addColorStop(1, "rgba(11,27,20,0.6)");
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.fill();
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 3;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.stroke();

  ctx.fillStyle = CHALK_DIM;
  ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = "alphabetic";
  ctx.fillText("KARRIERE-BESTWERT", W / 2, badgeY + 34);
  ctx.fillStyle = style.accent;
  ctx.font = '800 108px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(String(data.overall), W / 2, badgeY + 140);
  ctx.font = '700 32px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = CHALK;
  ctx.fillText(data.tierLabel.toUpperCase(), W / 2, badgeY + 180);

  // Name
  let cursorY = badgeY + badgeH + 90;
  ctx.fillStyle = CHALK;
  const nameSize = fitText(ctx, data.name, W - 120, 68, 38, "800");
  ctx.font = `800 ${nameSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(data.name, W / 2, cursorY);

  // Position / Land / Verein - über fitText schrumpfen statt fest 30px, sonst
  // läuft eine lange Kombination (z.B. "Zentrales Mittelfeld · Niederlande ·
  // 14-38 Jahre") rechts über den Canvas-Rand hinaus (siehe Bugreport: Zeile
  // war im Sharepic abgeschnitten).
  cursorY += 48;
  const metaLine = `${data.positionLabel} · ${data.flag} ${data.countryName} · ${data.ageRange} Jahre`;
  const metaSize = fitText(ctx, metaLine, W - 120, 30, 18, "500");
  ctx.font = `500 ${metaSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = CHALK_DIM;
  ctx.fillText(metaLine, W / 2, cursorY);
  cursorY += 42;
  ctx.font = '500 26px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = CHALK_DIM;
  ctx.fillText(`Letzter Verein: ${data.finalClub}`, W / 2, cursorY);

  // Legacy-Tier-Banner
  cursorY += 60;
  const bannerH = 74;
  const bannerY = cursorY;
  ctx.fillStyle = style.accentSoft;
  roundRect(ctx, 80, bannerY, W - 160, bannerH, 6);
  ctx.fill();
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 2;
  roundRect(ctx, 80, bannerY, W - 160, bannerH, 6);
  ctx.stroke();
  ctx.fillStyle = style.accent;
  const tierSize = fitText(ctx, data.legacyTier.toUpperCase(), W - 220, 36, 22, "800");
  ctx.font = `800 ${tierSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(data.legacyTier.toUpperCase(), W / 2, bannerY + bannerH / 2 + tierSize * 0.35);

  // Stat-Grid
  cursorY = bannerY + bannerH + 60;
  const stats: [string, string][] = data.isGoalkeeper
    ? [
        [String(data.matches), "Spiele"],
        [String(data.cleanSheets), "Weiße Westen"],
        [`${data.savePercentage}%`, "Gehaltene Bälle"],
        [String(data.trophies), "Titel"],
        [String(data.caps), "Länderspiele"],
        [String(data.legacyScore), "Legacy-Score"],
      ]
    : [
        [String(data.matches), "Spiele"],
        [String(data.goals), "Tore"],
        [String(data.assists), "Vorlagen"],
        [String(data.trophies), "Titel"],
        [String(data.caps), "Länderspiele"],
        [String(data.legacyScore), "Legacy-Score"],
      ];
  const cols = 3;
  const rows = 2;
  const gridW = W - 160;
  const cellW = gridW / cols;
  const cellH = 130;
  const gridX = 80;
  for (let i = 0; i < stats.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = gridX + cellW * col + cellW / 2;
    const cy = cursorY + row * cellH;
    ctx.fillStyle = CHALK;
    ctx.font = '800 54px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(stats[i][0], cx, cy + 50);
    ctx.fillStyle = CHALK_DIM;
    ctx.font = '500 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(stats[i][1], cx, cy + 84);
  }

  // Trennlinie
  cursorY += rows * cellH + 20;
  ctx.strokeStyle = "rgba(42,74,60,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, cursorY);
  ctx.lineTo(W - 80, cursorY);
  ctx.stroke();

  // Erfolge
  cursorY += 50;
  ctx.fillStyle = CHALK_DIM;
  ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("ERFOLGE", W / 2, cursorY);
  cursorY += 20;

  if (data.achievementLabels.length > 0) {
    const chipPadding = 26;
    const chipGap = 16;
    const chipH = 56;
    ctx.font = '600 26px "Segoe UI", system-ui, sans-serif';
    const chipWidths = data.achievementLabels.map((l) => ctx.measureText(l).width + chipPadding * 2);
    // Auf mehrere Zeilen umbrechen, wenn die Chips nicht in eine Reihe passen
    const maxRowWidth = W - 160;
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

    let rowY = cursorY + 20;
    for (const line of lines) {
      const totalW = line.widths.reduce((s, w) => s + w, 0) + chipGap * (line.widths.length - 1);
      let x = (W - totalW) / 2;
      for (let i = 0; i < line.labels.length; i++) {
        const w = line.widths[i];
        ctx.fillStyle = style.accentSoft;
        roundRect(ctx, x, rowY, w, chipH, chipH / 2);
        ctx.fill();
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, rowY, w, chipH, chipH / 2);
        ctx.stroke();
        ctx.fillStyle = CHALK;
        ctx.font = '600 26px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(line.labels[i], x + w / 2, rowY + chipH / 2 + 9);
        x += w + chipGap;
      }
      rowY += chipH + 16;
    }
  }

  // Footer / Pitch-Motiv
  const footerY = H - 70;
  ctx.strokeStyle = "rgba(201,162,39,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, footerY, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(80, footerY);
  ctx.lineTo(W - 80, footerY);
  ctx.stroke();
  ctx.fillStyle = "rgba(159,179,168,0.7)";
  ctx.font = '500 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("Erstellt mit Footca", W / 2, H - 26);
}

/** Kurzer Beschreibungstext zum Mitkopieren beim Teilen (Caption für Social Media). */
export function buildShareCaption(data: ShareCardData): string {
  const achievementsPart = data.achievementLabels.length > 0 ? ` 🏅 ${data.achievementLabels.join(", ")}.` : "";
  const productionPart = data.isGoalkeeper
    ? `${data.cleanSheets} weiße Westen, ${data.savePercentage}% gehaltene Bälle`
    : `${data.goals} Tore, ${data.assists} Vorlagen`;
  return `⚽ Meine Fußball-Karriere als ${data.name}: ${data.legacyTier} mit ${data.overall} Gesamtstärke (Karriere-Bestwert)! ${data.matches} Spiele, ${productionPart}, ${data.trophies} Titel.${achievementsPart} Gespielt mit Footca.`;
}
