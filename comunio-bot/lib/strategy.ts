// Entscheidungslogik. Reine Funktionen, damit sie testbar sind.
//
// Signale je Spieler (alle als erwartete Marktwertänderung pro Tag in %):
//   1. com-analytics-Prognose für morgen (stärkstes Signal)
//   2. eigener Trend aus den täglichen Snapshots (sonst: 7-Tage-Änderung von com-analytics)
//   3. Punkte am letzten Spieltag (gute Punkte ziehen den Marktwert in den Folgetagen meist hoch)
//   4. Understat: Einsatzzeit und xG+xA pro 90 im Vergleich zur Position
// Dazu die Empfehlung von com-analytics als Zu- oder Abschlag.
//
// Ziel ist der Kontostand: Kaufen, wenn der erwartete Wert nach HORIZON_DAYS das Gebot
// deutlich übersteigt; Verkaufen, wenn ein Wertverlust erwartet wird. Harte Regeln:
// nie mehr bieten als (Kontostand - offene Gebote - Reserve), Kadergröße und
// Mindestbesetzung je Position einhalten, keine Verletzten kaufen.

import type { StrategyConfig } from "./config";
import type { CaData, Player, Recommendation } from "./types";
import type { UnderstatPlayer } from "./understat";

export interface Signals {
  dailyPct: number; // erwartete Änderung pro Tag in %
  horizonPct: number; // erwartete Änderung über den Horizont in %
  reasons: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
export const fmtMio = (v: number) =>
  `${(v / 1_000_000).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio`;

// history: Marktwerte der letzten Tage, älteste zuerst
// Richtwerte xG+xA pro 90 je Position (Bundesliga-Durchschnitt Stammspieler, grob)
const XGXA_BASE: Record<string, number> = { striker: 0.5, midfielder: 0.25, defender: 0.08 };

export const horizonFor = (cfg: StrategyConfig) => Math.max(cfg.horizonDays, cfg.sellLockDays);

export function computeSignals(
  p: Player,
  ca: CaData | undefined,
  history: number[],
  cfg: StrategyConfig,
  us?: UnderstatPlayer,
): Signals {
  const reasons: string[] = [];
  let caPct: number | null = null;
  if (ca?.prognose && p.marketValue) {
    caPct = pct(ca.prognose, p.marketValue);
    reasons.push(`com-analytics: Prognose morgen ${fmtMio(ca.prognose)} (${caPct >= 0 ? "+" : ""}${caPct.toFixed(1)} %)`);
  }

  let momentum: number | null = null;
  const h = [...history, p.marketValue].filter((x) => x > 0);
  if (h.length >= 3) {
    const recent = h.slice(-4);
    momentum = pct(recent[recent.length - 1], recent[0]) / (recent.length - 1);
    reasons.push(`Trend letzte ${recent.length - 1} Tage: ${momentum >= 0 ? "+" : ""}${momentum.toFixed(1)} %/Tag`);
  } else if (ca?.change7dPct !== null && ca?.change7dPct !== undefined) {
    momentum = ca.change7dPct / 7;
    reasons.push(`7-Tage-Trend: ${ca.change7dPct >= 0 ? "+" : ""}${ca.change7dPct.toFixed(1)} %`);
  }

  let pointsPct = 0;
  if (p.lastPoints !== null) {
    // ca. -1 % bis +1,5 % pro Tag je nach Punkten (0 Punkte = leicht negativ, 10+ = deutlich positiv)
    pointsPct = clamp((p.lastPoints - 3) * 0.15, -1, 1.5);
    reasons.push(`${p.lastPoints} Punkte am letzten Spieltag`);
  }

  let usPct: number | null = null;
  if (us && us.minutes >= 180) {
    usPct = 0;
    if (us.minutesShare < 0.4) usPct -= 0.6;
    else if (us.minutesShare > 0.8) usPct += 0.2;
    const baseXg = XGXA_BASE[p.position];
    if (baseXg) {
      const v = us.xgPer90 + us.xaPer90;
      usPct += clamp(((v - baseXg) / baseXg) * 0.4, -0.4, 0.8);
    }
    reasons.push(
      `Understat: ${Math.round(us.minutesShare * 100)} % Einsatzzeit, xG+xA/90 ${(us.xgPer90 + us.xaPer90).toFixed(2)}`,
    );
  }

  // Gewichtung; fehlende Signale werden durch die anderen ersetzt
  const parts: [number | null, number][] = [
    [caPct, 0.55],
    [momentum, 0.2],
    [p.lastPoints !== null ? pointsPct : null, 0.1],
    [usPct, 0.15],
  ];
  const wSum = parts.reduce((s, [v, w]) => s + (v === null ? 0 : w), 0);
  let dailyPct = wSum ? parts.reduce((s, [v, w]) => s + (v === null ? 0 : v * w), 0) / wSum : 0;

  // Momentum klingt ab: Tag 1 voll, danach halb
  let horizonPct = dailyPct + dailyPct * 0.5 * (horizonFor(cfg) - 1);

  const emp = (ca?.empfehlung || "").toLowerCase();
  if (emp.startsWith("kauf")) {
    horizonPct += 1;
    reasons.push("com-analytics empfiehlt: Kaufen");
  } else if (emp.startsWith("verkauf")) {
    horizonPct -= 1.5;
    reasons.push("com-analytics empfiehlt: Verkaufen");
  } else if (emp) {
    reasons.push(`com-analytics empfiehlt: ${ca!.empfehlung}`);
  }

  if (p.status !== "ACTIVE") {
    horizonPct -= 3;
    dailyPct -= 1;
    reasons.push(`Status: ${p.status}${p.statusInfo ? ` (${p.statusInfo})` : ""}`);
  }

  return { dailyPct, horizonPct, reasons };
}

export interface StrategyInput {
  squad: Player[];
  market: Player[];
  ca: Map<string, CaData>;
  understat: Map<string, UnderstatPlayer>;
  history: Map<string, number[]>;
  credit: number;
  pendingPurchases: number;
  pendingBidPlayerIds: string[];
  cfg: StrategyConfig;
  now?: Date;
}

export interface StrategyOutput {
  buys: Recommendation[];
  sells: Recommendation[];
  available: number;
  warnings: string[];
}

function rid(type: string, playerId: string, now: Date) {
  return `${now.toISOString().slice(0, 10)}-${type}-${playerId}`;
}

export function decide(input: StrategyInput): StrategyOutput {
  const { squad, market, ca, history, cfg, understat } = input;
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + cfg.recTtlHours * 3600_000).toISOString();
  const warnings: string[] = [];
  let available = input.credit - input.pendingPurchases - cfg.cashReserve;

  const base = (p: Player, s: Signals) => ({
    playerId: p.id,
    playerName: p.name,
    club: p.club,
    position: p.position,
    marketValue: p.marketValue,
    expectedPct: Math.round(s.horizonPct * 10) / 10,
    reasons: s.reasons,
    caPrognose: ca.get(p.id)?.prognose ?? null,
    caEmpfehlung: ca.get(p.id)?.empfehlung ?? null,
    lastPoints: p.lastPoints,
    createdAt: now.toISOString(),
    expiresAt,
    status: "PENDING" as const,
  });

  // ---------- Verkäufe ----------
  const posCount: Record<string, number> = {};
  for (const p of squad) posCount[p.position] = (posCount[p.position] || 0) + 1;

  // Ligaregel: gekaufte Spieler sind SELL_LOCK_DAYS Tage gesperrt
  const lockedUntil = (p: Player) =>
    p.acquiredAt ? new Date(Date.parse(p.acquiredAt) + cfg.sellLockDays * 86400_000) : null;
  const locked = squad.filter((p) => {
    const u = lockedUntil(p);
    return u !== null && u > now;
  });
  for (const p of locked) {
    warnings.push(`${p.name} ist bis ${lockedUntil(p)!.toLocaleDateString("de-DE")} gesperrt (Kauf-Sperre)`);
  }
  const lockedIds = new Set(locked.map((p) => p.id));

  const sellCands = squad
    .filter((p) => !p.onMarket && !lockedIds.has(p.id))
    .map((p) => ({ p, s: computeSignals(p, ca.get(p.id), history.get(p.id) || [], cfg, understat.get(p.id)) }))
    .sort((a, b) => a.s.horizonPct - b.s.horizonPct);

  const sells: Recommendation[] = [];
  const mustRaise = available < 0 ? -available : 0;
  if (mustRaise > 0) warnings.push(`Kontostand nach offenen Geboten negativ: es fehlen ${fmtMio(mustRaise)}`);
  let raised = 0;

  for (const { p, s } of sellCands) {
    if (sells.length >= cfg.maxSellRecs) break;
    const forced = raised < mustRaise;
    if (!forced && s.horizonPct > cfg.sellThresholdPct) continue;
    const min = cfg.minPerPosition[p.position] ?? 0;
    if ((posCount[p.position] || 0) - 1 < min) continue;
    posCount[p.position]--;
    const price = Math.round((p.marketValue * (1 + cfg.sellMarkupPct / 100)) / 10_000) * 10_000;
    const reasons = [...s.reasons];
    if (p.purchasePrice) {
      const g = price - p.purchasePrice;
      reasons.push(`Ggü. Kaufpreis ${fmtMio(p.purchasePrice)}: ${g >= 0 ? "+" : ""}${fmtMio(g)}`);
    }
    if (forced && s.horizonPct > cfg.sellThresholdPct) reasons.push("Verkauf nötig, um den Kontostand auszugleichen");
    sells.push({
      ...base(p, s),
      id: rid("SELL", p.id, now),
      type: "SELL",
      price,
      expectedProfit: Math.round(-p.marketValue * (s.horizonPct / 100)),
      reasons,
    });
    raised += price;
  }

  // Geplante Verkäufe zählen nicht als verfügbares Geld (Verkauf ist nicht sofort).
  // ---------- Käufe ----------
  const ownIds = new Set(squad.map((p) => p.id));
  const pendingIds = new Set(input.pendingBidPlayerIds);
  let squadSlots = cfg.maxSquad - squad.length - pendingIds.size + sells.length;

  const buyCands = market
    .filter((p) => !ownIds.has(p.id) && !pendingIds.has(p.id) && p.status === "ACTIVE" && p.marketValue > 0)
    .map((p) => {
      const s = computeSignals(p, ca.get(p.id), history.get(p.id) || [], cfg, understat.get(p.id));
      const ask = Math.max(p.askPrice ?? p.marketValue, p.marketValue);
      // Je stärker das Signal, desto mehr Aufschlag ist vertretbar (Konkurrenz um gute Spieler)
      const premium = clamp(cfg.bidPremiumPct + Math.max(0, s.horizonPct - cfg.minExpectedGainPct) * 0.3, 0, cfg.maxBidPremiumPct);
      const bid = Math.ceil((ask * (1 + premium / 100)) / 10_000) * 10_000;
      const expectedValue = p.marketValue * (1 + s.horizonPct / 100);
      const profit = expectedValue - bid;
      return { p, s, bid, profit, roi: (profit / bid) * 100, premium };
    })
    .filter((c) => c.roi >= cfg.minExpectedGainPct && !(c.p.id && (ca.get(c.p.id)?.empfehlung || "").toLowerCase().startsWith("verkauf")))
    .sort((a, b) => b.profit - a.profit);

  const buys: Recommendation[] = [];
  let budget = Math.max(0, available);
  for (const c of buyCands) {
    if (buys.length >= cfg.maxBuyRecs || squadSlots <= 0) break;
    if (c.bid > budget) continue;
    budget -= c.bid;
    squadSlots--;
    buys.push({
      ...base(c.p, c.s),
      id: rid("BUY", c.p.id, now),
      type: "BUY",
      price: c.bid,
      expectedProfit: Math.round(c.profit),
      reasons: [
        ...c.s.reasons,
        `Angebot ${fmtMio(c.p.askPrice ?? c.p.marketValue)} von ${c.p.owner || "?"}, Gebot +${c.premium.toFixed(1)} %`,
        `Nach dem Kauf ${cfg.sellLockDays} Tage gesperrt, Prognose daher über ${horizonFor(cfg)} Tage`,
      ],
    });
  }
  if (!buyCands.length) warnings.push("Kein Spieler auf dem Transfermarkt erfüllt die Kaufkriterien");

  return { buys, sells, available, warnings };
}
