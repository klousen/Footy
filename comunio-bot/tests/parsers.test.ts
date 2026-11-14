import { describe, expect, it } from "vitest";
import { namesMatch, parseCaProfile } from "../lib/comanalytics";
import { pendingPurchaseTotal, parseMarket, parseSquad } from "../lib/comunio";
import { matchUnderstat, parseUnderstat } from "../lib/understat";

describe("com-analytics", () => {
  it("liest Prognose, Empfehlung und 7-Tage-Änderung (Tabellenlayout)", () => {
    const html = `<html><head><title>com-analytics.de - Guirassy</title></head><body><h1>Guirassy</h1>
      <table><tr><th>Marktwert</th><td>15.760.000</td></tr><tr><th>Prognose<sup>1</sup></th><td>16.160.000</td></tr>
      <tr><th>Empfehlung</th><td>Verkaufen</td></tr><tr><th>Änderung (7 Tage)</th><td>+920.000 / +6,2%</td></tr></table></body></html>`;
    const d = parseCaProfile(html, "32667");
    expect(d.marketValue).toBe(15_760_000);
    expect(d.prognose).toBe(16_160_000);
    expect(d.empfehlung).toBe("Verkaufen");
    expect(d.change7dPct).toBeCloseTo(6.2);
  });
  it("funktioniert auch mit Fließtext", () => {
    const d = parseCaProfile(`<body><div>Marktwert: 4.560.000 Prognose 4.780.000 Empfehlung: Kaufen Änderung (7 Tage) -120.000 / -2,5 %</div></body>`, "1");
    expect(d.prognose).toBe(4_780_000);
    expect(d.empfehlung).toBe("Kaufen");
    expect(d.change7dPct).toBeCloseTo(-2.5);
  });
  it("Namensabgleich mit Kurzformen", () => {
    expect(namesMatch("Mario Vušković", "M. Vušković")).toBe(true);
    expect(namesMatch("Serhou Guirassy", "Guirassy")).toBe(true);
    expect(namesMatch("Kane", "Kimmich")).toBe(false);
  });
});

describe("Comunio-Normalisierung", () => {
  it("Kader und Markt (Feldnamen wie im Mitschnitt)", () => {
    const squad = parseSquad({ items: [{ id: 7, name: "Undav", club: { name: "VfB" }, position: "striker", status: "ACTIVE", quotedprice: 12_210_000, lastPoints: 8, purchaseInfo: { price: 10_000_000 } }] });
    expect(squad[0]).toMatchObject({ id: "7", marketValue: 12_210_000, purchasePrice: 10_000_000, lastPoints: 8 });
    const market = parseMarket({ items: [
      { price: 3_800_000, _embedded: { player: { id: 9, name: "Schäfer", quotedPrice: 3_720_000, position: "midfielder" }, owner: { id: 1, name: "Computer" } } },
      { price: 1, _embedded: { player: { id: 7, name: "Eigener", quotedPrice: 1 }, owner: { id: 42, name: "Ich" } } },
    ] }, "42");
    expect(market).toHaveLength(1);
    expect(market[0]).toMatchObject({ id: "9", askPrice: 3_800_000, marketValue: 3_720_000 });
  });
  it("offene Kaufgebote", () => {
    const r = pendingPurchaseTotal({ items: [
      { state: "PENDING", type: "PURCHASE", price: 1_000_000, tradableid: 5 },
      { state: "DONE", type: "PURCHASE", price: 9 },
      { state: "PENDING", type: "SALE", price: 9 },
    ] });
    expect(r).toEqual({ total: 1_000_000, playerIds: ["5"] });
  });
});

describe("Understat", () => {
  it("rechnet pro 90 und Einsatzquote", () => {
    const list = parseUnderstat({
      teams: { a: { title: "VfB Stuttgart", history: new Array(10).fill(0) } } as never,
      players: [{ player_name: "Deniz Undav", team_title: "VfB Stuttgart", games: "9", time: "720", xG: "4", xA: "2" }],
    });
    expect(list[0].xgPer90).toBeCloseTo(0.5);
    expect(list[0].minutesShare).toBeCloseTo(0.8);
    expect(matchUnderstat("Undav", "VfB Stuttgart", list)?.name).toBe("Deniz Undav");
  });
});
