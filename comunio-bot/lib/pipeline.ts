// Täglicher Lauf: Daten holen, bewerten, Empfehlungen speichern und pushen.

import { config } from "./config";
import { fetchCaForPlayers } from "./comanalytics";
import { ComunioClient, parseCredit, parseMarket, parseSquad, pendingPurchaseTotal } from "./comunio";
import { push, pushRecommendation } from "./ntfy";
import * as store from "./store";
import { computeSignals, decide, fmtMio } from "./strategy";
import type { RunSummary } from "./types";
import { fetchUnderstat, matchUnderstat, type UnderstatPlayer } from "./understat";

export interface SquadRow {
  id: string;
  name: string;
  club: string;
  position: string;
  marketValue: number;
  purchasePrice: number | null;
  lastPoints: number | null;
  caPrognose: number | null;
  caEmpfehlung: string | null;
  expectedPct: number;
  lockedUntil: string | null;
  onMarket: boolean;
}

export async function runDaily({ dry = false } = {}): Promise<RunSummary> {
  const cfg = config.strategy;
  const warnings: string[] = [];
  await store.expireOldRecs();

  const c = new ComunioClient();
  await c.login();
  const [squadRaw, marketRaw, offersRaw] = await Promise.all([c.getSquadRaw(), c.getMarketRaw(), c.getOffersRaw()]);
  await store.saveDebug({
    at: new Date().toISOString(),
    squadFirstItem: squadRaw.items?.[0],
    marketFirstItem: marketRaw.items?.[0],
    offers: offersRaw,
    marketKeys: Object.keys(marketRaw || {}),
  });

  const squad = parseSquad(squadRaw);
  const market = parseMarket(marketRaw, c.userId);
  const credit = parseCredit(offersRaw, marketRaw, squadRaw);
  const pending = pendingPurchaseTotal(offersRaw);

  // Kaufdatum ergänzen, falls Comunio keins liefert
  const seen = await store.trackSquadMembership(squad.map((p) => p.id));
  for (const p of squad) if (!p.acquiredAt && seen[p.id] && !seen[p.id].startsWith("1970")) p.acquiredAt = seen[p.id];

  // Externe Daten
  const [caRes, usList] = await Promise.all([
    fetchCaForPlayers([...squad, ...market], config.caIdOverrides()),
    fetchUnderstat().catch((e) => {
      warnings.push(`Understat nicht erreichbar: ${e.message}`);
      return [] as UnderstatPlayer[];
    }),
  ]);
  const understat = new Map<string, UnderstatPlayer>();
  for (const p of [...squad, ...market]) {
    const u = matchUnderstat(p.name, p.club, usList);
    if (u) understat.set(p.id, u);
  }

  const history = await store.loadHistory(7);
  const result = decide({
    squad,
    market,
    ca: caRes.data,
    understat,
    history,
    credit,
    pendingPurchases: pending.total,
    pendingBidPlayerIds: pending.playerIds,
    cfg,
  });
  warnings.push(...result.warnings);

  // Snapshot für die Trendberechnung der nächsten Tage
  const snap: Record<string, number> = {};
  for (const p of [...squad, ...market]) snap[p.id] = p.marketValue;
  await store.saveSnapshot(snap);

  // Kaderansicht fürs Dashboard
  const rows: SquadRow[] = squad.map((p) => {
    const s = computeSignals(p, caRes.data.get(p.id), history.get(p.id) || [], cfg, understat.get(p.id));
    const lu = p.acquiredAt ? new Date(Date.parse(p.acquiredAt) + cfg.sellLockDays * 86400_000) : null;
    return {
      id: p.id,
      name: p.name,
      club: p.club,
      position: p.position,
      marketValue: p.marketValue,
      purchasePrice: p.purchasePrice ?? null,
      lastPoints: p.lastPoints,
      caPrognose: caRes.data.get(p.id)?.prognose ?? null,
      caEmpfehlung: caRes.data.get(p.id)?.empfehlung ?? null,
      expectedPct: Math.round(s.horizonPct * 10) / 10,
      lockedUntil: lu && lu > new Date() ? lu.toISOString() : null,
      onMarket: !!p.onMarket,
    };
  });
  await store.saveSquadView(rows);

  const recs = [...result.sells, ...result.buys];
  const existing = new Set((await store.listRecs(100)).map((r) => r.id));
  const fresh = recs.filter((r) => !existing.has(r.id));
  for (const r of fresh) await store.saveRec(r);

  const summary: RunSummary = {
    runAt: new Date().toISOString(),
    credit,
    pendingPurchases: pending.total,
    available: result.available,
    squadValue: squad.reduce((s, p) => s + p.marketValue, 0),
    squadSize: squad.length,
    marketSize: market.length,
    unmapped: caRes.unmapped,
    recIds: fresh.map((r) => r.id),
    dry,
    warnings,
  };
  await store.saveSummary(summary);

  if (!dry) {
    await push({
      title: `Comunio: ${fresh.length} neue Empfehlung${fresh.length === 1 ? "" : "en"}`,
      message: [
        `Kontostand ${fmtMio(credit)} · verfügbar ${fmtMio(result.available)}`,
        `Kaderwert ${fmtMio(summary.squadValue)} (${squad.length} Spieler)`,
        ...warnings.filter((w) => !w.includes("gesperrt")).slice(0, 3),
      ].join("\n"),
      tags: ["soccer"],
      click: `${config.appUrl()}/`,
    });
    for (const r of fresh) await pushRecommendation(r);
  }
  return summary;
}
