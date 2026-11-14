import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map<string, unknown>();
vi.mock("../lib/store", () => ({
  expireOldRecs: async () => {},
  saveDebug: async () => {},
  trackSquadMembership: async (ids: string[]) => Object.fromEntries(ids.map((i) => [i, "1970-01-01T00:00:00.000Z"])),
  loadHistory: async () => new Map(),
  saveSnapshot: async () => {},
  saveSquadView: async () => {},
  listRecs: async () => [],
  saveRec: async (r: { id: string }) => void mem.set(r.id, r),
  saveSummary: async (s: unknown) => void mem.set("summary", s),
}));

const pushed: string[] = [];
beforeEach(() => {
  Object.assign(process.env, {
    COMUNIO_USERNAME: "u", COMUNIO_PASSWORD: "p", COMUNIO_COMMUNITY_ID: "100", COMUNIO_USER_ID: "42",
    NTFY_TOPIC: "t", SIGNING_SECRET: "s", APP_URL: "https://bot.example", DASHBOARD_PASSWORD: "x", MIN_STRIKER: "1", MIN_DEFENDER: "0", MIN_MIDFIELDER: "0",
  });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = String(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.endsWith("/login")) return json({ access_token: "tok" });
    if (u.includes("/users/42/squad")) return json({ items: [
      { id: 1, name: "Torwart", position: "keeper", quotedprice: 2_000_000, lastPoints: 4 },
      { id: 2, name: "Fallender", position: "striker", quotedprice: 8_000_000, lastPoints: 0 },
      { id: 3, name: "Stürmer", position: "striker", quotedprice: 6_000_000, lastPoints: 6 },
    ] });
    if (u.includes("/exchangemarket")) return json({ items: [
      { price: 3_000_000, _embedded: { player: { id: 9, name: "Schäfer", position: "midfielder", quotedPrice: 3_000_000, lastPoints: 12, status: "ACTIVE" }, owner: { id: 1, name: "Computer" } } },
    ] });
    if (u.includes("/offers")) return json({ credit: 10_000_000, items: [] });
    if (u.includes("com-analytics.de/player/2")) return new Response(`<h1>Fallender</h1><table><tr><th>Prognose</th><td>7.600.000</td></tr><tr><th>Empfehlung</th><td>Verkaufen</td></tr></table>`);
    if (u.includes("com-analytics.de/player/9")) return new Response(`<h1>Schäfer</h1><table><tr><th>Prognose</th><td>3.250.000</td></tr><tr><th>Empfehlung</th><td>Kaufen</td></tr></table>`);
    if (u.includes("com-analytics.de")) return new Response("", { status: 404 });
    if (u.includes("understat.com")) return json({ teams: {}, players: [] });
    if (u.includes("ntfy")) { pushed.push(JSON.parse(String(init?.body)).title); return new Response("{}"); }
    throw new Error("unerwartet: " + u);
  });
});

describe("runDaily", () => {
  it("erzeugt Kauf- und Verkaufsempfehlung und pusht sie", async () => {
    const { runDaily } = await import("../lib/pipeline");
    const s = await runDaily();
    expect(s.credit).toBe(10_000_000);
    const types = [...mem.values()].filter((v: any) => v.type).map((v: any) => `${v.type}:${v.playerName}`);
    expect(types).toContain("BUY:Schäfer");
    expect(types).toContain("SELL:Fallender");
    expect(pushed[0]).toMatch(/neue Empfehlung/);
    expect(pushed).toContain("Kaufen: Schäfer");
  }, 20000);
});
