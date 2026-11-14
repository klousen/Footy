import { describe, expect, it } from "vitest";
import { config } from "../lib/config";
import { decide } from "../lib/strategy";
import type { CaData, Player } from "../lib/types";

const cfg = { ...config.strategy, minPerPosition: { keeper: 1, defender: 1, midfielder: 1, striker: 1 } };
const now = new Date("2026-11-14T08:00:00Z");
const P = (id: string, pos: string, mv: number, extra: Partial<Player> = {}): Player => ({
  id, name: `Spieler ${id}`, club: "FC Test", position: pos, status: "ACTIVE", marketValue: mv,
  lastPoints: 5, totalPoints: 40, ...extra,
});
const CA = (id: string, prog: number, emp = "Halten"): CaData => ({
  caId: id, name: `Spieler ${id}`, marketValue: null, prognose: prog, empfehlung: emp, change7dPct: null, fetchedAt: "",
});
const base = {
  understat: new Map(), history: new Map<string, number[]>(), pendingPurchases: 0, pendingBidPlayerIds: [] as string[], cfg, now,
};

describe("decide", () => {
  it("empfiehlt Kauf bei steigender Prognose und hält das Budget ein", () => {
    const market = [P("10", "striker", 5_000_000, { askPrice: 5_000_000 }), P("11", "striker", 5_000_000, { askPrice: 5_000_000 })];
    const ca = new Map([["10", CA("10", 5_400_000, "Kaufen")], ["11", CA("11", 5_400_000, "Kaufen")]]);
    const out = decide({ ...base, squad: [], market, ca, credit: 6_000_000 });
    expect(out.buys).toHaveLength(1); // zweites Gebot würde das Budget sprengen
    expect(out.buys[0].price).toBeGreaterThanOrEqual(5_000_000);
    expect(out.buys[0].price).toBeLessThanOrEqual(6_000_000);
  });

  it("zieht offene Gebote vom Budget ab", () => {
    const market = [P("10", "striker", 5_000_000)];
    const ca = new Map([["10", CA("10", 5_400_000, "Kaufen")]]);
    const out = decide({ ...base, squad: [], market, ca, credit: 6_000_000, pendingPurchases: 3_000_000 });
    expect(out.buys).toHaveLength(0);
  });

  it("kauft keine Verletzten und nichts mit Empfehlung Verkaufen", () => {
    const market = [P("10", "striker", 5_000_000, { status: "INJURED" }), P("11", "striker", 5_000_000)];
    const ca = new Map([["10", CA("10", 5_600_000, "Kaufen")], ["11", CA("11", 5_600_000, "Verkaufen")]]);
    expect(decide({ ...base, squad: [], market, ca, credit: 50_000_000 }).buys).toHaveLength(0);
  });

  it("verkauft fallende Spieler, aber nicht unter die Mindestbesetzung", () => {
    const squad = [P("1", "keeper", 2_000_000), P("2", "striker", 8_000_000), P("3", "striker", 8_000_000)];
    const ca = new Map([
      ["1", CA("1", 1_800_000, "Verkaufen")],
      ["2", CA("2", 7_500_000, "Verkaufen")],
      ["3", CA("3", 7_500_000, "Verkaufen")],
    ]);
    const out = decide({ ...base, squad, market: [], ca, credit: 1_000_000 });
    const ids = out.sells.map((s) => s.playerId);
    expect(ids).not.toContain("1"); // einziger Torwart
    expect(ids.filter((i) => i === "2" || i === "3")).toHaveLength(1); // ein Stürmer bleibt
  });

  it("respektiert die 3-Tage-Sperre nach dem Kauf", () => {
    const squad = [
      P("2", "striker", 8_000_000, { acquiredAt: "2026-11-13T05:00:00Z" }),
      P("3", "striker", 8_000_000, { acquiredAt: "2026-11-01T05:00:00Z" }),
      P("4", "striker", 8_000_000),
    ];
    const ca = new Map(["2", "3", "4"].map((i) => [i, CA(i, 7_500_000, "Verkaufen")] as const));
    const out = decide({ ...base, squad, market: [], ca, credit: 1_000_000 });
    expect(out.sells.map((s) => s.playerId)).not.toContain("2");
    expect(out.warnings.some((w) => w.includes("gesperrt"))).toBe(true);
  });

  it("schlägt Verkäufe vor, wenn der Kontostand negativ ist", () => {
    const squad = [P("2", "striker", 3_000_000), P("3", "striker", 4_000_000)];
    const ca = new Map([["2", CA("2", 3_050_000)], ["3", CA("3", 4_080_000)]]);
    const out = decide({ ...base, squad, market: [], ca, credit: -2_000_000 });
    expect(out.sells.length).toBe(1);
  });
});
