// Zentrale Konfiguration. Alles kommt aus Umgebungsvariablen (Vercel > Settings > Environment Variables).

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Umgebungsvariable ${name} fehlt`);
  return v;
}

export const config = {
  comunio: {
    baseUrl: process.env.COMUNIO_BASE_URL || "https://api.comunio.de",
    username: () => req("COMUNIO_USERNAME"),
    password: () => req("COMUNIO_PASSWORD"),
    communityId: () => process.env.COMUNIO_COMMUNITY_ID || "",
    userId: () => process.env.COMUNIO_USER_ID || "",
    timezone: process.env.COMUNIO_TIMEZONE || "Europe/Berlin",
  },
  ntfy: {
    server: process.env.NTFY_SERVER || "https://ntfy.sh",
    topic: () => req("NTFY_TOPIC"),
    token: process.env.NTFY_TOKEN || "",
  },
  appUrl: () => (process.env.APP_URL || "").replace(/\/$/, ""),
  signingSecret: () => req("SIGNING_SECRET"),
  dashboardPassword: () => req("DASHBOARD_PASSWORD"),
  cronSecret: () => process.env.CRON_SECRET || "",
  // Zuordnung Comunio-ID -> com-analytics-ID, falls die IDs abweichen. JSON: {"12345": 67890}
  caIdOverrides: (): Record<string, string> => {
    try {
      return JSON.parse(process.env.CA_ID_OVERRIDES || "{}");
    } catch {
      return {};
    }
  },
  strategy: {
    horizonDays: num("HORIZON_DAYS", 3), // über wie viele Tage der erwartete Gewinn gerechnet wird
    minExpectedGainPct: num("MIN_EXPECTED_GAIN_PCT", 3), // Mindest-Renditeerwartung für eine Kaufempfehlung
    bidPremiumPct: num("BID_PREMIUM_PCT", 2), // Aufschlag auf den Angebotspreis (Konkurrenz in der Liga)
    maxBidPremiumPct: num("MAX_BID_PREMIUM_PCT", 6),
    sellThresholdPct: num("SELL_THRESHOLD_PCT", -2), // erwartete Entwicklung, ab der Verkauf empfohlen wird
    sellMarkupPct: num("SELL_MARKUP_PCT", 0), // Aufschlag auf den Marktwert beim Verkaufspreis
    cashReserve: num("CASH_RESERVE", 0), // Betrag, der nie verplant wird
    maxSquad: num("MAX_SQUAD", 20),
    maxBuyRecs: num("MAX_BUY_RECS", 5),
    maxSellRecs: num("MAX_SELL_RECS", 5),
    // Mindestanzahl je Position, die nach Verkäufen im Kader bleiben muss
    minPerPosition: {
      keeper: num("MIN_KEEPER", 1),
      defender: num("MIN_DEFENDER", 4),
      midfielder: num("MIN_MIDFIELDER", 4),
      striker: num("MIN_STRIKER", 2),
    } as Record<string, number>,
    recTtlHours: num("REC_TTL_HOURS", 20),
    sellLockDays: num("SELL_LOCK_DAYS", 3), // Ligaregel: gekaufte Spieler sind so lange gesperrt
  },
};

export type StrategyConfig = typeof config.strategy;
