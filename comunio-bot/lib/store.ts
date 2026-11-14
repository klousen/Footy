// Speicher: Upstash Redis (über den Vercel Marketplace mit einem Klick anlegbar).

import { Redis } from "@upstash/redis";
import type { Recommendation, RunSummary } from "./types";

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis nicht konfiguriert (UPSTASH_REDIS_REST_URL/TOKEN)");
  _redis = new Redis({ url, token });
  return _redis;
}

const DAY = 86400;
const today = (d = new Date()) => d.toISOString().slice(0, 10);

// Tägliche Marktwert-Snapshots für eigene Trendberechnung
export async function saveSnapshot(values: Record<string, number>, date = today()) {
  await redis().set(`snap:${date}`, values, { ex: 40 * DAY });
}

export async function loadHistory(days = 7): Promise<Map<string, number[]>> {
  const dates: string[] = [];
  for (let i = days; i >= 1; i--) dates.push(today(new Date(Date.now() - i * DAY * 1000)));
  const snaps = await redis().mget<(Record<string, number> | null)[]>(...dates.map((d) => `snap:${d}`));
  const hist = new Map<string, number[]>();
  for (const s of snaps) {
    if (!s) continue;
    for (const [id, v] of Object.entries(s)) {
      if (!hist.has(id)) hist.set(id, []);
      hist.get(id)!.push(v);
    }
  }
  return hist;
}

export async function saveRec(r: Recommendation) {
  await redis().set(`rec:${r.id}`, r, { ex: 60 * DAY });
  await redis().zadd("recs", { score: Date.parse(r.createdAt), member: r.id });
}

export async function getRec(id: string): Promise<Recommendation | null> {
  return redis().get<Recommendation>(`rec:${id}`);
}

export async function listRecs(limit = 60): Promise<Recommendation[]> {
  const ids = await redis().zrange<string[]>("recs", 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const recs = await redis().mget<(Recommendation | null)[]>(...ids.map((i) => `rec:${i}`));
  return recs.filter((r): r is Recommendation => !!r);
}

export async function expireOldRecs() {
  const now = Date.now();
  for (const r of await listRecs(100)) {
    if (r.status === "PENDING" && Date.parse(r.expiresAt) < now) {
      await saveRec({ ...r, status: "EXPIRED" });
    }
  }
}

// Schützt vor doppelter Ausführung (z. B. zweimal auf den Button getippt)
export async function lock(key: string, seconds = 120): Promise<boolean> {
  const ok = await redis().set(`lock:${key}`, "1", { nx: true, ex: seconds });
  return ok === "OK";
}

export async function saveSummary(s: RunSummary) {
  await redis().set("summary:last", s);
  await redis().lpush("balance", { date: s.runAt, credit: s.credit, squadValue: s.squadValue });
  await redis().ltrim("balance", 0, 89);
}

export async function getSummary(): Promise<RunSummary | null> {
  return redis().get<RunSummary>("summary:last");
}

export async function getBalanceHistory(): Promise<{ date: string; credit: number; squadValue: number }[]> {
  const l = await redis().lrange<{ date: string; credit: number; squadValue: number }>("balance", 0, 89);
  return l.reverse();
}

export async function saveSquadView(rows: unknown) {
  await redis().set("squad:last", rows);
}
export async function getSquadView<T>(): Promise<T | null> {
  return redis().get<T>("squad:last");
}

export async function saveDebug(raw: unknown) {
  await redis().set("debug:raw", raw, { ex: 7 * DAY });
}
export async function getDebug() {
  return redis().get("debug:raw");
}

// Seit wann ist ein Spieler im Kader? Fallback für die Kauf-Sperre, falls Comunio kein Kaufdatum liefert.
// Beim allerersten Lauf werden alle vorhandenen Spieler als "alt" markiert (nicht gesperrt).
export async function trackSquadMembership(ids: string[]): Promise<Record<string, string>> {
  const r = redis();
  const seen = ((await r.hgetall<Record<string, string>>("squad:seen")) || {}) as Record<string, string>;
  const first = Object.keys(seen).length === 0;
  const now = new Date().toISOString();
  const next: Record<string, string> = {};
  for (const id of ids) next[id] = seen[id] || (first ? "1970-01-01T00:00:00.000Z" : now);
  await r.del("squad:seen");
  if (ids.length) await r.hset("squad:seen", next);
  return next;
}
