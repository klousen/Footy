// Führt eine bestätigte Empfehlung aus. Vorher wird alles frisch geprüft:
// Spieler noch auf dem Markt, Budget reicht, Sperre abgelaufen, Empfehlung nicht abgelaufen.

import { config } from "./config";
import { ComunioClient, parseCredit, parseMarket, parseSquad, pendingPurchaseTotal } from "./comunio";
import * as store from "./store";
import { fmtMio } from "./strategy";
import type { Recommendation } from "./types";

export async function executeRec(rec: Recommendation): Promise<Recommendation> {
  const done = (status: Recommendation["status"], result: string): Recommendation => ({
    ...rec,
    status,
    result,
    decidedAt: new Date().toISOString(),
  });

  if (Date.parse(rec.expiresAt) < Date.now()) return done("EXPIRED", "Empfehlung abgelaufen");

  const c = new ComunioClient();
  await c.login();
  try {
    if (rec.type === "BUY") {
      const [marketRaw, offersRaw] = await Promise.all([c.getMarketRaw(), c.getOffersRaw()]);
      const p = parseMarket(marketRaw, c.userId).find((x) => x.id === rec.playerId);
      if (!p) return done("FAILED", "Spieler nicht mehr auf dem Transfermarkt");
      const pending = pendingPurchaseTotal(offersRaw);
      if (pending.playerIds.includes(rec.playerId)) return done("FAILED", "Es gibt schon ein offenes Gebot");
      const price = Math.max(rec.price, p.askPrice ?? 0);
      const available = parseCredit(offersRaw, marketRaw) - pending.total - config.strategy.cashReserve;
      if (price > available) return done("FAILED", `Budget reicht nicht (verfügbar ${fmtMio(available)})`);
      const offerId = await c.placeBid(rec.playerId, price);
      return done("EXECUTED", `Gebot ${fmtMio(price)} abgegeben${offerId ? ` (Angebot ${offerId})` : ""}`);
    }

    const squad = parseSquad(await c.getSquadRaw());
    const p = squad.find((x) => x.id === rec.playerId);
    if (!p) return done("FAILED", "Spieler nicht mehr im Kader");
    if (p.onMarket) return done("FAILED", "Spieler ist bereits gelistet");
    const seen = (await store.trackSquadMembership(squad.map((x) => x.id)))[p.id];
    const acquired = p.acquiredAt || (seen && !seen.startsWith("1970") ? seen : null);
    if (acquired && Date.parse(acquired) + config.strategy.sellLockDays * 86400_000 > Date.now()) {
      return done("FAILED", "Spieler ist noch durch die Kauf-Sperre gesperrt");
    }
    await c.listForSale(rec.playerId, rec.price);
    return done("EXECUTED", `Für ${fmtMio(rec.price)} auf den Transfermarkt gestellt`);
  } catch (e) {
    return done("FAILED", (e as Error).message);
  }
}
